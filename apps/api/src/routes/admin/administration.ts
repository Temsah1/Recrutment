import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  administratorCreateSchema,
  administratorUpdateSchema,
  auditListQuerySchema,
  passwordResetSchema,
  type AdminUserDTO,
  type AuditListDTO,
} from '@esme/shared';
import type { AppConfig } from '../../config.js';
import type { Db } from '../../db/connection.js';
import type { AdministratorRow, AuditRow } from '../../db/rows.js';
import { AppError } from '../../lib/errors.js';
import { nowIso } from '../../lib/time.js';
import { requireAdmin } from '../../plugins/auth.js';
import { mapAuditRow } from '../../services/applications.js';
import {
  hashPassword,
  revokeAllSessionsForAdmin,
  toAdminDTO,
} from '../../services/auth.js';
import { recordAudit } from '../../services/audit.js';
import type { FileStorage } from '../../services/storage.js';

interface Deps {
  db: Db;
  storage: FileStorage;
  config: AppConfig;
}

const idParams = z.object({ id: z.coerce.number().int().positive() });

function activeSuperAdminCount(db: Db, excludeId?: number): number {
  return (
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM administrators WHERE role = 'super_admin' AND is_active = 1 AND id IS NOT ?",
      )
      .get(excludeId ?? null) as { count: number }
  ).count;
}

const administrationRoutes: FastifyPluginAsync<Deps> = async (app, opts) => {
  const { db } = opts;

  app.get(
    '/administrators',
    { preHandler: [app.authenticate, app.authorize('administrators.manage')] },
    async () => {
      const rows = db
        .prepare('SELECT * FROM administrators ORDER BY created_at ASC')
        .all() as AdministratorRow[];
      return { items: rows.map(toAdminDTO) };
    },
  );

  app.post(
    '/administrators',
    { preHandler: [app.authenticate, app.csrfProtect, app.authorize('administrators.manage')] },
    async (request, reply) => {
      const actor = requireAdmin(request);
      const body = administratorCreateSchema.parse(request.body);

      const existing = db
        .prepare('SELECT id FROM administrators WHERE email = ?')
        .get(body.email) as { id: number } | undefined;
      if (existing) {
        throw new AppError(409, 'conflict', 'An administrator with this email already exists');
      }

      const passwordHash = await hashPassword(body.password);
      const now = nowIso();
      const result = db
        .prepare(
          `INSERT INTO administrators
             (email, password_hash, display_name, role, is_active, created_at, updated_at, password_changed_at)
           VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
        )
        .run(body.email, passwordHash, body.displayName, body.role, now, now, now);

      const id = Number(result.lastInsertRowid);
      recordAudit(db, {
        actorAdminId: actor.id,
        action: 'administrator.created',
        entityType: 'administrator',
        entityId: id,
        metadata: { email: body.email, role: body.role },
        requestId: request.id,
      });
      const row = db.prepare('SELECT * FROM administrators WHERE id = ?').get(id) as AdministratorRow;
      const dto: AdminUserDTO = toAdminDTO(row);
      reply.code(201);
      return { administrator: dto };
    },
  );

  app.patch(
    '/administrators/:id',
    { preHandler: [app.authenticate, app.csrfProtect, app.authorize('administrators.manage')] },
    async (request) => {
      const actor = requireAdmin(request);
      const { id } = idParams.parse(request.params);
      const body = administratorUpdateSchema.parse(request.body);

      const target = db.prepare('SELECT * FROM administrators WHERE id = ?').get(id) as
        | AdministratorRow
        | undefined;
      if (!target) throw AppError.notFound('Administrator not found');

      if (target.id === actor.id) {
        if (body.isActive === false) {
          throw AppError.badRequest('You cannot deactivate your own account');
        }
        if (body.role && body.role !== target.role) {
          throw AppError.badRequest('You cannot change your own role');
        }
      }

      const nextRole = body.role ?? target.role;
      const nextActive = body.isActive === undefined ? target.is_active === 1 : body.isActive;

      if (
        target.role === 'super_admin' &&
        (nextRole !== 'super_admin' || !nextActive) &&
        activeSuperAdminCount(db, target.id) === 0
      ) {
        throw AppError.badRequest('At least one active Super Admin must remain');
      }

      if (nextRole === 'super_admin' && actor.role !== 'super_admin') {
        throw AppError.forbidden('Only a Super Admin can grant the Super Admin role');
      }

      db.prepare(
        'UPDATE administrators SET display_name = ?, role = ?, is_active = ?, updated_at = ? WHERE id = ?',
      ).run(body.displayName ?? target.display_name, nextRole, nextActive ? 1 : 0, nowIso(), id);

      if (!nextActive) revokeAllSessionsForAdmin(db, id);

      recordAudit(db, {
        actorAdminId: actor.id,
        action: 'administrator.updated',
        entityType: 'administrator',
        entityId: id,
        metadata: {
          email: target.email,
          roleFrom: target.role,
          roleTo: nextRole,
          activeFrom: target.is_active === 1,
          activeTo: nextActive,
          displayNameChanged: Boolean(body.displayName && body.displayName !== target.display_name),
        },
        requestId: request.id,
      });

      const row = db.prepare('SELECT * FROM administrators WHERE id = ?').get(id) as AdministratorRow;
      return { administrator: toAdminDTO(row) };
    },
  );

  app.post(
    '/administrators/:id/password-reset',
    { preHandler: [app.authenticate, app.csrfProtect, app.authorize('administrators.manage')] },
    async (request, reply) => {
      const actor = requireAdmin(request);
      const { id } = idParams.parse(request.params);
      const body = passwordResetSchema.parse(request.body);
      if (id === actor.id) {
        throw AppError.badRequest('Use Change password to update your own password');
      }
      const target = db.prepare('SELECT * FROM administrators WHERE id = ?').get(id) as
        | AdministratorRow
        | undefined;
      if (!target) throw AppError.notFound('Administrator not found');

      const passwordHash = await hashPassword(body.newPassword);
      const now = nowIso();
      db.prepare(
        `UPDATE administrators
            SET password_hash = ?, password_changed_at = ?, updated_at = ?,
                failed_login_count = 0, locked_until = NULL
          WHERE id = ?`,
      ).run(passwordHash, now, now, id);
      revokeAllSessionsForAdmin(db, id);

      recordAudit(db, {
        actorAdminId: actor.id,
        action: 'administrator.password_reset',
        entityType: 'administrator',
        entityId: id,
        metadata: { email: target.email, sessionsRevoked: true },
        requestId: request.id,
      });
      return reply.code(204).send();
    },
  );

  app.get(
    '/audit-logs',
    { preHandler: [app.authenticate, app.authorize('audit.view')] },
    async (request): Promise<AuditListDTO> => {
      const query = auditListQuerySchema.parse(request.query);
      const clauses: string[] = [];
      const params: unknown[] = [];
      if (query.action) {
        clauses.push('l.action = ?');
        params.push(query.action);
      }
      if (query.actorId) {
        clauses.push('l.actor_admin_id = ?');
        params.push(query.actorId);
      }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const total = (
        db.prepare(`SELECT COUNT(*) AS count FROM audit_logs l ${where}`).get(...params) as {
          count: number;
        }
      ).count;

      const rows = db
        .prepare(
          `SELECT l.*, a.display_name AS actor_display_name
             FROM audit_logs l
             LEFT JOIN administrators a ON a.id = l.actor_admin_id
             ${where}
            ORDER BY l.created_at DESC, l.id DESC
            LIMIT ? OFFSET ?`,
        )
        .all(...params, query.pageSize, (query.page - 1) * query.pageSize) as AuditRow[];

      return {
        items: rows.map(mapAuditRow),
        total,
        page: query.page,
        pageSize: query.pageSize,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      };
    },
  );
};

export default administrationRoutes;

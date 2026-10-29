import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  cycleSchema,
  departmentSchema,
  departmentUpdateSchema,
  hasPermission,
  settingsPatchSchema,
  type CycleDTO,
} from '@esme/shared';
import type { AppConfig } from '../../config.js';
import type { Db } from '../../db/connection.js';
import type { CycleRow } from '../../db/rows.js';
import { AppError } from '../../lib/errors.js';
import { nowIso } from '../../lib/time.js';
import { requireAdmin } from '../../plugins/auth.js';
import { recordAudit } from '../../services/audit.js';
import {
  createDepartment,
  listDepartments,
  updateDepartment,
} from '../../services/departments.js';
import {
  getSettings,
  listCycles,
  updateSettings,
} from '../../services/settings.js';
import type { FileStorage } from '../../services/storage.js';

interface Deps {
  db: Db;
  storage: FileStorage;
  config: AppConfig;
}

const idParams = z.object({ id: z.coerce.number().int().positive() });

function mapCycle(row: CycleRow & { application_count?: number }): CycleDTO {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    privacyPolicyVersion: row.privacy_policy_version,
    applicationCount: row.application_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const settingsRoutes: FastifyPluginAsync<Deps> = async (app, opts) => {
  const { db } = opts;

  app.get(
    '/settings',
    { preHandler: [app.authenticate, app.authorize('settings.manage')] },
    async () => ({ settings: getSettings(db) }),
  );

  app.patch(
    '/settings',
    { preHandler: [app.authenticate, app.csrfProtect, app.authorize('settings.manage')] },
    async (request) => {
      const admin = requireAdmin(request);
      const patch = settingsPatchSchema.parse(request.body);
      if (patch.retention && !hasPermission(admin.role, 'settings.security')) {
        throw AppError.forbidden('Only a Super Admin can change retention settings');
      }
      const { settings, changedSections } = updateSettings(db, patch);
      recordAudit(db, {
        actorAdminId: admin.id,
        action: 'settings.updated',
        entityType: 'app_settings',
        entityId: null,
        metadata: { sections: changedSections, privacyVersion: settings.privacy.version },
        requestId: request.id,
      });
      return { settings };
    },
  );

  app.get(
    '/departments',
    { preHandler: [app.authenticate, app.authorize('applications.view')] },
    async () => ({ items: listDepartments(db, true) }),
  );

  app.post(
    '/departments',
    { preHandler: [app.authenticate, app.csrfProtect, app.authorize('departments.manage')] },
    async (request, reply) => {
      const admin = requireAdmin(request);
      const body = departmentSchema.parse(request.body);
      const department = createDepartment(db, body);
      recordAudit(db, {
        actorAdminId: admin.id,
        action: 'department.created',
        entityType: 'department',
        entityId: department.id,
        metadata: { name: department.name, slug: department.slug },
        requestId: request.id,
      });
      reply.code(201);
      return { department };
    },
  );

  app.patch(
    '/departments/:id',
    { preHandler: [app.authenticate, app.csrfProtect, app.authorize('departments.manage')] },
    async (request) => {
      const admin = requireAdmin(request);
      const { id } = idParams.parse(request.params);
      const body = departmentUpdateSchema.parse(request.body);
      const department = updateDepartment(db, id, body);
      recordAudit(db, {
        actorAdminId: admin.id,
        action: 'department.updated',
        entityType: 'department',
        entityId: id,
        metadata: { name: department.name, isActive: department.isActive },
        requestId: request.id,
      });
      return { department };
    },
  );

  app.get(
    '/cycles',
    { preHandler: [app.authenticate, app.authorize('cycles.manage')] },
    async () => ({ items: listCycles(db).map(mapCycle) }),
  );

  app.post(
    '/cycles',
    { preHandler: [app.authenticate, app.csrfProtect, app.authorize('cycles.manage')] },
    async (request, reply) => {
      const admin = requireAdmin(request);
      const body = cycleSchema.parse(request.body);
      const now = nowIso();
      const privacyVersion =
        body.privacyPolicyVersion ?? getSettings(db).privacy.version;
      const hasCurrent = db
        .prepare('SELECT COUNT(*) AS count FROM recruitment_cycles WHERE is_current = 1')
        .get() as { count: number };
      const isCurrent = hasCurrent.count === 0 ? 1 : 0;
      const result = db
        .prepare(
          `INSERT INTO recruitment_cycles
             (name, status, opens_at, closes_at, privacy_policy_version, is_current, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          body.name,
          body.status,
          body.opensAt ?? null,
          body.closesAt ?? null,
          privacyVersion,
          isCurrent,
          now,
          now,
        );
      const id = Number(result.lastInsertRowid);
      recordAudit(db, {
        actorAdminId: admin.id,
        action: 'cycle.created',
        entityType: 'recruitment_cycle',
        entityId: id,
        metadata: { name: body.name, status: body.status },
        requestId: request.id,
      });
      const row = db.prepare('SELECT * FROM recruitment_cycles WHERE id = ?').get(id) as CycleRow;
      reply.code(201);
      return { cycle: mapCycle(row) };
    },
  );

  app.patch(
    '/cycles/:id',
    { preHandler: [app.authenticate, app.csrfProtect, app.authorize('cycles.manage')] },
    async (request) => {
      const admin = requireAdmin(request);
      const { id } = idParams.parse(request.params);
      const existing = db
        .prepare('SELECT * FROM recruitment_cycles WHERE id = ?')
        .get(id) as CycleRow | undefined;
      if (!existing) throw AppError.notFound('Recruitment cycle not found');

      const body = cycleSchema.parse(request.body);
      db.prepare(
        `UPDATE recruitment_cycles
            SET name = ?, status = ?, opens_at = ?, closes_at = ?,
                privacy_policy_version = ?, updated_at = ?
          WHERE id = ?`,
      ).run(
        body.name,
        body.status,
        body.opensAt ?? null,
        body.closesAt ?? null,
        body.privacyPolicyVersion ?? existing.privacy_policy_version,
        nowIso(),
        id,
      );

      recordAudit(db, {
        actorAdminId: admin.id,
        action: 'cycle.updated',
        entityType: 'recruitment_cycle',
        entityId: id,
        metadata: {
          name: body.name,
          statusFrom: existing.status,
          statusTo: body.status,
          opensAt: body.opensAt ?? null,
          closesAt: body.closesAt ?? null,
        },
        requestId: request.id,
      });

      const row = db.prepare('SELECT * FROM recruitment_cycles WHERE id = ?').get(id) as CycleRow;
      return { cycle: mapCycle(row) };
    },
  );

  app.post(
    '/cycles/:id/activate',
    { preHandler: [app.authenticate, app.csrfProtect, app.authorize('cycles.manage')] },
    async (request) => {
      const admin = requireAdmin(request);
      const { id } = idParams.parse(request.params);
      const existing = db
        .prepare('SELECT * FROM recruitment_cycles WHERE id = ?')
        .get(id) as CycleRow | undefined;
      if (!existing) throw AppError.notFound('Recruitment cycle not found');

      db.transaction(() => {
        const now = nowIso();
        db.prepare('UPDATE recruitment_cycles SET is_current = 0, updated_at = ? WHERE is_current = 1').run(now);
        db.prepare('UPDATE recruitment_cycles SET is_current = 1, updated_at = ? WHERE id = ?').run(now, id);
      }).immediate();

      recordAudit(db, {
        actorAdminId: admin.id,
        action: 'cycle.activated',
        entityType: 'recruitment_cycle',
        entityId: id,
        metadata: { name: existing.name, status: existing.status },
        requestId: request.id,
      });
      return { activatedId: id };
    },
  );
};

export default settingsRoutes;

import type { FastifyPluginAsync } from 'fastify';
import {
  SESSION_COOKIE,
  changePasswordSchema,
  loginSchema,
  type AuthMeDTO,
} from '@esme/shared';
import type { AppConfig } from '../config.js';
import type { Db } from '../db/connection.js';
import { AppError } from '../lib/errors.js';
import { nowIso } from '../lib/time.js';
import { recordAudit } from '../services/audit.js';
import {
  createSession,
  hashPassword,
  login,
  revokeAllSessionsForAdmin,
  revokeSession,
  toAdminDTO,
  verifyPassword,
} from '../services/auth.js';
import { requireAdmin, requireSession } from '../plugins/auth.js';

interface Deps {
  db: Db;
  config: AppConfig;
}

const authRoutes: FastifyPluginAsync<Deps> = async (app, opts) => {
  const { db, config } = opts;

  const sessionCookieOptions = {
    httpOnly: true as const,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: '/',
    maxAge: config.sessionMaxAgeSeconds,
  };

  app.post(
    '/auth/login',
    { config: { rateLimit: { max: 8, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = loginSchema.parse(request.body);
      try {
        const result = await login(
          db,
          body.email,
          body.password,
          { ip: request.ip, userAgent: request.headers['user-agent'] ?? null },
          config,
        );
        reply.setCookie(SESSION_COOKIE, result.session.token, sessionCookieOptions);
        recordAudit(db, {
          actorAdminId: result.admin.id,
          action: 'auth.login_success',
          entityType: 'administrator',
          entityId: result.admin.id,
          metadata: { ip: request.ip },
          requestId: request.id,
        });
        const body_: AuthMeDTO = {
          administrator: toAdminDTO(result.admin),
          csrfToken: result.session.csrfToken,
          sessionExpiresAt: result.session.expiresAt,
        };
        return reply.send(body_);
      } catch (error) {
        recordAudit(db, {
          actorAdminId: null,
          action: 'auth.login_failed',
          entityType: 'administrator',
          entityId: null,
          metadata: {
            email: body.email,
            ip: request.ip,
            code: (error as { code?: string }).code ?? 'unknown',
          },
          requestId: request.id,
        });
        throw error;
      }
    },
  );

  app.post(
    '/auth/logout',
    { preHandler: [app.authenticate, app.csrfProtect] },
    async (request, reply) => {
      const admin = requireAdmin(request);
      const session = requireSession(request);
      revokeSession(db, session.session.id);
      recordAudit(db, {
        actorAdminId: admin.id,
        action: 'auth.logout',
        entityType: 'administrator',
        entityId: admin.id,
        requestId: request.id,
      });
      reply.clearCookie(SESSION_COOKIE, { path: '/' });
      return reply.code(204).send();
    },
  );

  app.get('/auth/me', { preHandler: [app.authenticate] }, async (request) => {
    const admin = requireAdmin(request);
    const session = requireSession(request);
    const body: AuthMeDTO = {
      administrator: toAdminDTO(admin),
      csrfToken: session.session.csrf_token,
      sessionExpiresAt: session.session.expires_at,
    };
    return body;
  });

  app.post(
    '/auth/change-password',
    {
      preHandler: [app.authenticate, app.csrfProtect],
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const admin = requireAdmin(request);
      const body = changePasswordSchema.parse(request.body);

      const currentValid = await verifyPassword(admin.password_hash, body.currentPassword);
      if (!currentValid) {
        throw new AppError(400, 'validation_error', 'Current password is incorrect', [
          { path: 'currentPassword', message: 'Current password is incorrect' },
        ]);
      }
      if (body.currentPassword === body.newPassword) {
        throw new AppError(400, 'validation_error', 'Choose a different password', [
          { path: 'newPassword', message: 'The new password must be different' },
        ]);
      }

      const passwordHash = await hashPassword(body.newPassword);
      const now = nowIso();
      db.prepare(
        `UPDATE administrators
            SET password_hash = ?, password_changed_at = ?, updated_at = ?,
                failed_login_count = 0, locked_until = NULL
          WHERE id = ?`,
      ).run(passwordHash, now, now, admin.id);

      revokeAllSessionsForAdmin(db, admin.id);
      const session = createSession(
        db,
        admin.id,
        { ip: request.ip, userAgent: request.headers['user-agent'] ?? null },
        config,
      );
      reply.setCookie(SESSION_COOKIE, session.token, sessionCookieOptions);

      recordAudit(db, {
        actorAdminId: admin.id,
        action: 'auth.password_changed',
        entityType: 'administrator',
        entityId: admin.id,
        metadata: { otherSessionsRevoked: true },
        requestId: request.id,
      });

      return reply.send({
        administrator: toAdminDTO(admin),
        csrfToken: session.csrfToken,
        sessionExpiresAt: session.expiresAt,
      });
    },
  );
};

export default authRoutes;

import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { CSRF_HEADER, SESSION_COOKIE, hasPermission, type Permission } from '@esme/shared';
import type { AppConfig } from '../config.js';
import type { Db } from '../db/connection.js';
import type { AdministratorRow } from '../db/rows.js';
import { AppError } from '../lib/errors.js';
import { timingSafeEqualStrings } from '../lib/crypto.js';
import { resolveSession, type SessionContext } from '../services/auth.js';

declare module 'fastify' {
  interface FastifyRequest {
    adminContext: AdministratorRow | null;
    sessionContext: SessionContext | null;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    csrfProtect: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authorize: (permission: Permission) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export function requireAdmin(request: FastifyRequest): AdministratorRow {
  if (!request.adminContext) throw AppError.unauthorized();
  return request.adminContext;
}

export function requireSession(request: FastifyRequest): SessionContext {
  if (!request.sessionContext) throw AppError.unauthorized();
  return request.sessionContext;
}

const authPlugin: FastifyPluginAsync<{ db: Db; config: AppConfig }> = async (app, opts) => {
  app.decorateRequest('adminContext', null);
  app.decorateRequest('sessionContext', null);

  app.decorate('authenticate', async (request: FastifyRequest) => {
    const token = request.cookies[SESSION_COOKIE];
    if (!token) throw AppError.unauthorized('Sign in to continue');
    const context = resolveSession(opts.db, token, opts.config);
    if (!context) {
      throw AppError.unauthorized('Your session has expired. Please sign in again.');
    }
    request.sessionContext = context;
    request.adminContext = context.admin;
  });

  app.decorate('csrfProtect', async (request: FastifyRequest) => {
    const context = request.sessionContext;
    if (!context) throw AppError.unauthorized();
    const header = request.headers[CSRF_HEADER];
    if (typeof header !== 'string' || !timingSafeEqualStrings(header, context.session.csrf_token)) {
      throw AppError.forbidden('Invalid or missing CSRF token. Reload the page and try again.');
    }
  });

  app.decorate('authorize', (permission: Permission) => async (request: FastifyRequest) => {
    const admin = request.adminContext;
    if (!admin) throw AppError.unauthorized();
    if (!hasPermission(admin.role, permission)) {
      throw AppError.forbidden('Your role does not allow this action');
    }
  });
};

export default fp(authPlugin, { name: 'esme-auth' });

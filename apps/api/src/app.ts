import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import type { AppConfig } from './config.js';
import { closeDatabase, type Db } from './db/connection.js';
import { AppError } from './lib/errors.js';
import authPlugin from './plugins/auth.js';
import errorsPlugin from './plugins/errors.js';
import { FileStorage } from './services/storage.js';
import publicRoutes from './routes/public.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin/index.js';

export interface BuildAppOptions {
  config: AppConfig;
  db: Db;
  storage?: FileStorage;
  logger?: boolean;
  disableRateLimit?: boolean;
  closeDbOnShutdown?: boolean;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config, db } = options;
  const storage = options.storage ?? new FileStorage(config.uploadsDir);
  if (!options.storage) storage.init();

  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : {
            level: config.logLevel,
            redact: {
              paths: [
                'req.headers.cookie',
                'req.headers.authorization',
                'req.headers["x-esme-csrf"]',
                'res.headers["set-cookie"]',
              ],
              censor: '[redacted]',
            },
          },
    trustProxy: config.trustProxy,
    genReqId: () => randomUUID(),
    bodyLimit: 1024 * 1024,
  });

  await app.register(errorsPlugin);
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: config.isProduction
      ? { maxAge: 15552000, includeSubDomains: true }
      : false,
    referrerPolicy: { policy: 'no-referrer' },
  });
  await app.register(cookie);
  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (config.trustedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'x-esme-csrf', 'idempotency-key', 'accept'],
    exposedHeaders: ['content-disposition'],
    maxAge: 600,
  });
  if (!options.disableRateLimit) {
    await app.register(rateLimit, {
      global: false,
      max: 120,
      timeWindow: '1 minute',
      allowList: [],
    });
  }
  await app.register(multipart, {
    limits: {
      fileSize: config.maxUploadBytes,
      files: 2,
      fields: 30,
      parts: 40,
    },
    attachFieldsToBody: false,
  });

  // Reject state-changing cross-site browser requests from untrusted origins.
  app.addHook('onRequest', async (request) => {
    if (SAFE_METHODS.has(request.method.toUpperCase())) return;

    const origin = request.headers.origin;
    let candidate: string | null = null;
    if (origin) {
      candidate = origin;
    } else if (request.headers.referer) {
      try {
        candidate = new URL(request.headers.referer).origin;
      } catch {
        candidate = null;
      }
    }
    if (!candidate) return; // Non-browser client; authentication and CSRF still apply.

    if (config.trustedOrigins.includes(candidate)) return;
    const host = request.headers.host;
    if (host && candidate === `${request.protocol}://${host}`) return;
    throw new AppError(403, 'forbidden', 'This origin is not allowed to perform this request');
  });

  app.addHook('onSend', async (request, reply, payload) => {
    const url = request.raw.url ?? '';
    if (!reply.getHeader('cache-control') && url.startsWith('/api/v1')) {
      reply.header('Cache-Control', 'no-store');
    }
    const contentType = String(reply.getHeader('content-type') ?? '');
    if (contentType.includes('application/json') && !reply.getHeader('content-security-policy')) {
      reply.header(
        'Content-Security-Policy',
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      );
    }
    return payload;
  });

  await app.register(authPlugin, { db, config });

  app.get('/', async () => ({
    name: 'ESME Recruitment OS API',
    status: 'ok',
    health: '/api/v1/health',
  }));

  await app.register(publicRoutes, { prefix: '/api/v1', db, storage, config });
  await app.register(authRoutes, { prefix: '/api/v1', db, config });
  await app.register(adminRoutes, { prefix: '/api/v1/admin', db, storage, config });

  app.addHook('onClose', async () => {
    if (options.closeDbOnShutdown !== false) closeDatabase(db);
  });

  return app;
}

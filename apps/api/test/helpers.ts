import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import type { AppConfig } from '../src/config.js';
import { loadConfig } from '../src/config.js';
import { closeDatabase, openDatabase, runMigrations, type Db } from '../src/db/connection.js';
import { seedDefaults } from '../src/db/seed.js';
import { nowIso } from '../src/lib/time.js';
import { buildApp } from '../src/app.js';
import { hashPassword } from '../src/services/auth.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

// Avoids the development-secret warning while keeping overrides explicit.
process.env.SESSION_SECRET ??= 'unit-test-session-secret-not-for-production';

export const SUPER_ADMIN = { email: 'super@esme.test', password: 'SuperAdmin#2026!', displayName: 'Super Admin' };
export const RECRUITMENT_ADMIN = {
  email: 'recruiter@esme.test',
  password: 'Recruiter#2026!',
  displayName: 'Recruitment Admin',
};
export const REVIEWER = { email: 'reviewer@esme.test', password: 'Reviewer#2026!', displayName: 'Reviewer One' };

export interface TestContext {
  root: string;
  config: AppConfig;
  db: Db;
  app: FastifyInstance;
  adminIds: Record<'super' | 'recruitment' | 'reviewer', number>;
  cleanup: () => Promise<void>;
}

export interface TestContextOptions {
  recruitmentOpen?: boolean;
}

export async function createTestContext(options: TestContextOptions = {}): Promise<TestContext> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'esme-api-test-'));
  const dataDir = path.join(root, 'data');
  const config = loadConfig({
    repoRoot: REPO_ROOT,
    dataDir,
    databasePath: path.join(dataDir, 'db', 'test.sqlite'),
    uploadsDir: path.join(dataDir, 'uploads'),
    backupDir: path.join(dataDir, 'backups'),
    migrationsDir: path.join(REPO_ROOT, 'database', 'migrations'),
    publicAppUrl: 'http://localhost:5173',
    sessionSecret: 'test-session-secret-'.padEnd(48, 'x'),
    cookieSecure: false,
  });

  const db = openDatabase(config.databasePath);
  runMigrations(db, config.migrationsDir);
  seedDefaults(db);

  if (options.recruitmentOpen !== false) {
    db.prepare("UPDATE recruitment_cycles SET status = 'open', updated_at = ? WHERE is_current = 1").run(nowIso());
  }

  const adminIds = {
    super: await insertAdmin(db, SUPER_ADMIN, 'super_admin'),
    recruitment: await insertAdmin(db, RECRUITMENT_ADMIN, 'recruitment_admin'),
    reviewer: await insertAdmin(db, REVIEWER, 'reviewer'),
  };

  const app = await buildApp({
    config,
    db,
    logger: false,
    disableRateLimit: true,
    closeDbOnShutdown: false,
  });

  return {
    root,
    config,
    db,
    app,
    adminIds,
    cleanup: async () => {
      await app.close();
      closeDatabase(db);
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

export async function insertAdmin(
  db: Db,
  admin: { email: string; password: string; displayName: string },
  role: 'super_admin' | 'recruitment_admin' | 'reviewer',
  isActive = true,
): Promise<number> {
  const passwordHash = await hashPassword(admin.password);
  const now = nowIso();
  const result = db
    .prepare(
      `INSERT INTO administrators
         (email, password_hash, display_name, role, is_active, created_at, updated_at, password_changed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(admin.email, passwordHash, admin.displayName, role, isActive ? 1 : 0, now, now, now);
  return Number(result.lastInsertRowid);
}

export interface Session {
  cookie: string;
  csrfToken: string;
  admin: { id: number; email: string; role: string };
}

export async function loginAs(
  app: FastifyInstance,
  email: string,
  password: string,
): Promise<Session> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password },
  });
  if (response.statusCode !== 200) {
    throw new Error(`Login failed for ${email}: ${response.statusCode} ${response.body}`);
  }
  const setCookie = response.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie.join(';') : String(setCookie ?? '');
  const match = /esme_session=([^;]+)/.exec(raw);
  if (!match) throw new Error('Session cookie was not set');
  const body = response.json() as {
    csrfToken: string;
    administrator: { id: number; email: string; role: string };
  };
  return { cookie: `esme_session=${match[1]}`, csrfToken: body.csrfToken, admin: body.administrator };
}

export async function loginSuper(app: FastifyInstance): Promise<Session> {
  return loginAs(app, SUPER_ADMIN.email, SUPER_ADMIN.password);
}

export function authHeaders(session: Session, csrf = false): Record<string, string> {
  return {
    cookie: session.cookie,
    ...(csrf ? { 'x-esme-csrf': session.csrfToken } : {}),
  };
}

export const PDF_BYTES = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n',
);

export const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

export interface UploadFile {
  field: 'national_id' | 'university_id';
  filename: string;
  contentType: string;
  data: Buffer;
}

export function buildMultipart(
  payload: Record<string, unknown>,
  files: UploadFile[] = [],
): { body: Buffer; headers: Record<string, string> } {
  const boundary = `----esme${randomUUID().replace(/-/g, '')}`;
  const chunks: Buffer[] = [
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="payload"\r\nContent-Type: application/json\r\n\r\n`,
    ),
    Buffer.from(JSON.stringify(payload)),
    Buffer.from('\r\n'),
  ];
  for (const file of files) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
      ),
      file.data,
      Buffer.from('\r\n'),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    body: Buffer.concat(chunks),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

export interface SubmissionOverrides {
  email?: string;
  fullName?: string;
  idempotencyKey?: string;
  primaryDepartmentSlug?: string;
  secondaryDepartmentSlug?: string | null;
}

export function applicationPayload(overrides: SubmissionOverrides = {}): Record<string, unknown> {
  return {
    fullName: 'Layla Hassan',
    email: overrides.email ?? `layla.${randomUUID().slice(0, 8)}@example.com`,
    phone: '+20 100 123 4567',
    university: 'Cairo University',
    faculty: 'Engineering',
    academicDepartment: 'Computer Engineering',
    academicYear: 'Third year',
    primaryDepartmentSlug: overrides.primaryDepartmentSlug ?? 'frontend-development',
    secondaryDepartmentSlug:
      overrides.secondaryDepartmentSlug === null
        ? undefined
        : overrides.secondaryDepartmentSlug ?? 'backend-development',
    githubUrl: 'https://github.com/layla',
    motivationStatement:
      'I want to build accessible, reliable products with the ESME team and learn from experienced members every week.',
    consentAccepted: true,
    ...(overrides.idempotencyKey ? { idempotencyKey: overrides.idempotencyKey } : {}),
    ...(overrides.fullName ? { fullName: overrides.fullName } : {}),
  };
}

export async function submitApplication(
  app: FastifyInstance,
  overrides: SubmissionOverrides = {},
  files: UploadFile[] = [
    { field: 'national_id', filename: 'national-id.pdf', contentType: 'application/pdf', data: PDF_BYTES },
    { field: 'university_id', filename: 'university-id.png', contentType: 'image/png', data: PNG_BYTES },
  ],
): Promise<LightMyRequestResponse> {
  const { body, headers } = buildMultipart(applicationPayload(overrides), files);
  return app.inject({ method: 'POST', url: '/api/v1/public/applications', payload: body, headers });
}

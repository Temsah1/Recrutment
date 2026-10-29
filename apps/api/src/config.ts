import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { UPLOAD_LIMITS } from '@esme/shared';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

function findRepoRoot(start: string): string {
  let current = path.resolve(start);
  for (let i = 0; i < 6; i += 1) {
    if (
      fs.existsSync(path.join(current, 'database', 'migrations')) &&
      fs.existsSync(path.join(current, 'package.json'))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(start);
}

export function loadEnvFiles(repoRoot: string): void {
  const candidates = [
    process.env.ENV_FILE,
    path.join(repoRoot, '.env'),
    path.join(process.cwd(), '.env'),
    path.join(repoRoot, 'apps/api/.env'),
  ].filter((p): p is string => Boolean(p));

  const seen = new Set<string>();
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (seen.has(resolved) || !fs.existsSync(resolved)) continue;
    seen.add(resolved);
    // Explicit process environment wins over files, so hosts/platforms and test
    // harnesses can override a stale .env without editing it.
    dotenv.config({ path: resolved, override: false, quiet: true });
  }
}

export type SameSiteOption = 'lax' | 'strict' | 'none';

export interface AppConfig {
  env: 'development' | 'test' | 'production';
  isProduction: boolean;
  host: string;
  port: number;
  publicAppUrl: string;
  trustedOrigins: string[];
  repoRoot: string;
  dataDir: string;
  databasePath: string;
  uploadsDir: string;
  backupDir: string;
  migrationsDir: string;
  sessionSecret: string;
  sessionMaxAgeSeconds: number;
  sessionIdleSeconds: number;
  adminBootstrapToken: string | null;
  maxUploadBytes: number;
  recruitmentTimezone: string;
  cookieSameSite: SameSiteOption;
  cookieSecure: boolean;
  trustProxy: boolean;
  logLevel: string;
}

const DEV_SESSION_SECRET = 'development-only-session-secret-do-not-use-in-production';

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < min || value > max) {
    throw new ConfigError(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const repoRoot = overrides.repoRoot ?? findRepoRoot(process.cwd());
  if (!overrides.repoRoot) loadEnvFiles(repoRoot);

  const rawEnv = process.env.NODE_ENV;
  const env: AppConfig['env'] =
    rawEnv === 'production' ? 'production' : rawEnv === 'test' ? 'test' : 'development';
  const isProduction = env === 'production';
  const isVercel = Boolean(process.env.VERCEL);

  const dataDir = path.resolve(
    overrides.dataDir ??
      process.env.APP_DATA_DIR ??
      (isVercel ? path.join(os.tmpdir(), 'esme-recruitment') : path.join(repoRoot, 'var', 'app')),
  );
  const databasePath = path.resolve(
    overrides.databasePath ??
      process.env.DATABASE_PATH ??
      path.join(dataDir, 'db', 'esme-recruitment.sqlite'),
  );
  const uploadsDir = path.resolve(
    overrides.uploadsDir ??
      process.env.PRIVATE_UPLOADS_DIR ??
      path.join(dataDir, 'uploads'),
  );
  const backupDir = path.resolve(
    overrides.backupDir ?? process.env.BACKUP_DIR ?? path.join(dataDir, 'backups'),
  );
  const configuredMigrationsDir = overrides.migrationsDir ?? process.env.MIGRATIONS_DIR;
  const migrationsDir = path.resolve(
    configuredMigrationsDir ??
      [
        path.join(repoRoot, 'database', 'migrations'),
        path.join(process.cwd(), 'apps', 'api', 'dist', 'migrations'),
        path.join(process.cwd(), 'dist', 'migrations'),
      ].find((candidate) => fs.existsSync(candidate)) ??
      path.join(repoRoot, 'database', 'migrations'),
  );

  const platformHost = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  const publicAppUrl = (
    overrides.publicAppUrl ??
    process.env.PUBLIC_APP_URL ??
    (platformHost ? `https://${platformHost}` : 'http://localhost:5173')
  ).replace(/\/+$/, '');

  if (!originOf(publicAppUrl)) {
    throw new ConfigError('PUBLIC_APP_URL must be an absolute URL, e.g. https://apply.example.com');
  }
  if (isProduction && !publicAppUrl.startsWith('https://')) {
    throw new ConfigError('PUBLIC_APP_URL must use HTTPS in production');
  }

  const trusted = (process.env.TRUSTED_ORIGINS ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
    .map((value) => {
      const origin = originOf(value);
      if (!origin) throw new ConfigError(`TRUSTED_ORIGINS contains an invalid origin: ${value}`);
      return origin;
    });

  const publicOrigin = originOf(publicAppUrl);
  const trustedOrigins = Array.from(
    new Set([
      ...(publicOrigin ? [publicOrigin] : []),
      ...trusted,
      ...(isProduction ? [] : ['http://localhost:5173', 'http://localhost:4173', 'http://127.0.0.1:5173']),
    ]),
  );

  const sessionSecret = overrides.sessionSecret ?? process.env.SESSION_SECRET ?? '';
  if (!sessionSecret && isProduction) {
    throw new ConfigError(
      'SESSION_SECRET is required in production and must be at least 32 characters. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
    );
  }
  if (isProduction && sessionSecret.length < 32) {
    throw new ConfigError('SESSION_SECRET must be at least 32 characters in production');
  }

  const adminBootstrapToken = process.env.ADMIN_BOOTSTRAP_TOKEN?.trim() || null;
  if (adminBootstrapToken && adminBootstrapToken.length < 24) {
    throw new ConfigError('ADMIN_BOOTSTRAP_TOKEN must be at least 24 characters when set');
  }

  const maxUploadBytes = intEnv(
    'MAX_UPLOAD_SIZE_BYTES',
    UPLOAD_LIMITS.maxBytes,
    UPLOAD_LIMITS.minBytes,
    UPLOAD_LIMITS.hardMaxBytes,
  );

  const sameSiteRaw = (process.env.COOKIE_SAME_SITE ?? 'lax').toLowerCase();
  if (sameSiteRaw !== 'lax' && sameSiteRaw !== 'strict' && sameSiteRaw !== 'none') {
    throw new ConfigError('COOKIE_SAME_SITE must be one of: lax, strict, none');
  }
  if (sameSiteRaw === 'none' && !isProduction && !overrides.cookieSecure) {
    process.emitWarning('COOKIE_SAME_SITE=none requires HTTPS; cookies may be rejected in local HTTP.');
  }

  const config: AppConfig = {
    env,
    isProduction,
    host: process.env.HOST ?? '127.0.0.1',
    port: intEnv('PORT', 4000, 1, 65535),
    publicAppUrl,
    trustedOrigins,
    repoRoot,
    dataDir,
    databasePath,
    uploadsDir,
    backupDir,
    migrationsDir,
    sessionSecret: sessionSecret || DEV_SESSION_SECRET,
    sessionMaxAgeSeconds: intEnv('SESSION_MAX_AGE_SECONDS', 12 * 60 * 60, 900, 7 * 24 * 60 * 60),
    sessionIdleSeconds: intEnv('SESSION_IDLE_TIMEOUT_SECONDS', 60 * 60, 300, 24 * 60 * 60),
    adminBootstrapToken,
    maxUploadBytes,
    recruitmentTimezone: process.env.RECRUITMENT_TIMEZONE ?? 'Africa/Cairo',
    cookieSameSite: sameSiteRaw as SameSiteOption,
    cookieSecure: overrides.cookieSecure ?? isProduction,
    trustProxy: (process.env.TRUST_PROXY ?? (isVercel ? 'true' : 'false')) === 'true',
    logLevel: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
    ...overrides,
  };

  if (!isProduction && !process.env.SESSION_SECRET) {
    process.emitWarning(
      'Using a development session secret. Set SESSION_SECRET before deploying.',
    );
  }
  if (isVercel) {
    process.emitWarning(
      'Vercel uses an ephemeral filesystem: applications, uploads and administrator accounts ' +
        'will not survive instance recycling. Use a persistent-disk host for production data.',
    );
  }

  validatePaths(config);
  return config;
}

function assertWritableDirectory(target: string, label: string): void {
  try {
    fs.mkdirSync(target, { recursive: true });
  } catch (error) {
    throw new ConfigError(`${label} directory cannot be created at ${target}: ${(error as Error).message}`);
  }
  const probe = path.join(target, `.write-test-${process.pid}-${Date.now()}`);
  try {
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
  } catch (error) {
    throw new ConfigError(`${label} directory is not writable at ${target}: ${(error as Error).message}`);
  }
}

function isInsideDirectory(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return (
    relative === '' ||
    (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))
  );
}

export function validatePaths(config: AppConfig): void {
  assertWritableDirectory(path.dirname(config.databasePath), 'Database');
  assertWritableDirectory(config.uploadsDir, 'Private uploads');
  assertWritableDirectory(config.backupDir, 'Backup');

  const webRoot = path.join(config.repoRoot, 'apps', 'web');
  if (isInsideDirectory(webRoot, config.uploadsDir)) {
    throw new ConfigError(
      'PRIVATE_UPLOADS_DIR must be outside the public web root (apps/web). Choose a private directory such as ./var/app/uploads.',
    );
  }
  if (isInsideDirectory(webRoot, config.databasePath)) {
    throw new ConfigError(
      'DATABASE_PATH must be outside the public web root (apps/web). Choose a private directory such as ./var/app/db/esme-recruitment.sqlite.',
    );
  }

  if (!fs.existsSync(config.migrationsDir)) {
    throw new ConfigError(
      `Migration directory not found at ${config.migrationsDir}. Set MIGRATIONS_DIR to the folder containing the SQL migrations.`,
    );
  }
}

export function currentFilePath(metaUrl: string): string {
  return fileURLToPath(metaUrl);
}

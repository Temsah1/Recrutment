import { hash, verify } from '@node-rs/argon2';
import type { AdminUserDTO, Role } from '@esme/shared';
import type { AppConfig } from '../config.js';
import type { Db } from '../db/connection.js';
import type { AdministratorRow, SessionRow } from '../db/rows.js';
import { randomToken, sha256 } from '../lib/crypto.js';
import { AppError } from '../lib/errors.js';
import { nowIso } from '../lib/time.js';

// @node-rs/argon2 exposes Algorithm as an ambient const enum, which cannot be
// referenced under isolatedModules. 2 is Algorithm.Argon2id in its ABI.
const ARGON2ID = 2;

const ARGON_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
} as unknown as Parameters<typeof hash>[1];

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const TOUCH_INTERVAL_MS = 30_000;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHashPromise: Promise<string> | null = null;
/** Equalises timing between unknown accounts and wrong passwords. */
async function dummyVerify(password: string): Promise<void> {
  dummyHashPromise ??= hashPassword(randomToken(24));
  const dummy = await dummyHashPromise;
  await verifyPassword(dummy, password);
}

export function toAdminDTO(row: AdministratorRow): AdminUserDTO {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role as Role,
    isActive: row.is_active === 1,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface SessionContext {
  session: SessionRow;
  admin: AdministratorRow;
}

export interface IssuedSession {
  token: string;
  csrfToken: string;
  expiresAt: string;
  sessionId: string;
}

export function createSession(
  db: Db,
  adminId: number,
  meta: { ip?: string | null; userAgent?: string | null },
  config: AppConfig,
): IssuedSession {
  const token = randomToken(32);
  const sessionId = sha256(token);
  const csrfToken = randomToken(24);
  const now = nowIso();
  const expiresAt = new Date(Date.now() + config.sessionMaxAgeSeconds * 1000).toISOString();
  db.prepare(
    `INSERT INTO admin_sessions
       (id, admin_id, csrf_token, created_at, last_seen_at, expires_at, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(sessionId, adminId, csrfToken, now, now, expiresAt, meta.ip ?? null, meta.userAgent ?? null);
  return { token, csrfToken, expiresAt, sessionId };
}

export function revokeSession(db: Db, sessionId: string): void {
  db.prepare('DELETE FROM admin_sessions WHERE id = ?').run(sessionId);
}

export function revokeAllSessionsForAdmin(db: Db, adminId: number): void {
  db.prepare('DELETE FROM admin_sessions WHERE admin_id = ?').run(adminId);
}

export function cleanupExpiredSessions(db: Db): number {
  const result = db.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').run(nowIso());
  return result.changes;
}

/** Validates a session cookie value and applies absolute + idle expiry. */
export function resolveSession(
  db: Db,
  rawToken: string,
  config: AppConfig,
  now: Date = new Date(),
): SessionContext | null {
  const sessionId = sha256(rawToken);
  const row = db.prepare('SELECT * FROM admin_sessions WHERE id = ?').get(sessionId) as
    | SessionRow
    | undefined;
  if (!row) return null;

  const nowMs = now.getTime();
  const expired = new Date(row.expires_at).getTime() <= nowMs;
  const idle =
    nowMs - new Date(row.last_seen_at).getTime() > config.sessionIdleSeconds * 1000;
  if (expired || idle) {
    revokeSession(db, sessionId);
    return null;
  }

  const admin = db
    .prepare('SELECT * FROM administrators WHERE id = ?')
    .get(row.admin_id) as AdministratorRow | undefined;
  if (!admin || admin.is_active !== 1) {
    revokeSession(db, sessionId);
    return null;
  }

  if (nowMs - new Date(row.last_seen_at).getTime() > TOUCH_INTERVAL_MS) {
    db.prepare('UPDATE admin_sessions SET last_seen_at = ? WHERE id = ?').run(
      new Date(nowMs).toISOString(),
      sessionId,
    );
    row.last_seen_at = new Date(nowMs).toISOString();
  }

  return { session: row, admin };
}

export interface LoginResult {
  admin: AdministratorRow;
  session: IssuedSession;
}

export async function login(
  db: Db,
  email: string,
  password: string,
  meta: { ip?: string | null; userAgent?: string | null },
  config: AppConfig,
): Promise<LoginResult> {
  const normalized = email.trim().toLowerCase();
  const admin = db
    .prepare('SELECT * FROM administrators WHERE email = ?')
    .get(normalized) as AdministratorRow | undefined;

  if (!admin) {
    await dummyVerify(password);
    throw new AppError(401, 'invalid_credentials', 'Invalid email or password');
  }

  if (admin.locked_until && new Date(admin.locked_until).getTime() > Date.now()) {
    await dummyVerify(password);
    throw new AppError(
      423,
      'account_locked',
      'Too many failed sign-in attempts. Try again later or ask a Super Admin to unlock the account.',
    );
  }

  if (admin.is_active !== 1) {
    await dummyVerify(password);
    throw new AppError(403, 'forbidden', 'This account is disabled');
  }

  const valid = await verifyPassword(admin.password_hash, password);
  if (!valid) {
    const failed = admin.failed_login_count + 1;
    if (failed >= MAX_FAILED_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString();
      db.prepare(
        'UPDATE administrators SET failed_login_count = 0, locked_until = ?, updated_at = ? WHERE id = ?',
      ).run(lockedUntil, nowIso(), admin.id);
    } else {
      db.prepare(
        'UPDATE administrators SET failed_login_count = ?, updated_at = ? WHERE id = ?',
      ).run(failed, nowIso(), admin.id);
    }
    throw new AppError(401, 'invalid_credentials', 'Invalid email or password');
  }

  const now = nowIso();
  db.prepare(
    `UPDATE administrators
        SET failed_login_count = 0, locked_until = NULL, last_login_at = ?, updated_at = ?
      WHERE id = ?`,
  ).run(now, now, admin.id);
  cleanupExpiredSessions(db);

  const session = createSession(db, admin.id, meta, config);
  const updated = db.prepare('SELECT * FROM administrators WHERE id = ?').get(admin.id) as AdministratorRow;
  return { admin: updated, session };
}

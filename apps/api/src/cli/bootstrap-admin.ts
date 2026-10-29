import { randomToken, timingSafeEqualStrings } from '../lib/crypto.js';
import { nowIso } from '../lib/time.js';
import { recordAudit } from '../services/audit.js';
import { bootstrapAdminSchema, loginSchema } from '@esme/shared';
import { hashPassword, revokeAllSessionsForAdmin } from '../services/auth.js';
import { findAdminByEmail } from './helpers.js';
import { closeDatabase } from '../db/connection.js';
import { fail, initCli, parseArgs, promptHidden, promptText } from './common.js';

async function main(): Promise<void> {
  const args = parseArgs();
  const { config, db } = initCli();

  const resetTarget = typeof args.reset === 'string' ? args.reset.trim().toLowerCase() : null;

  const providedToken = typeof args.token === 'string' ? args.token : process.env.ADMIN_BOOTSTRAP_TOKEN ?? '';
  const expectedToken = config.adminBootstrapToken;
  if (config.isProduction && !expectedToken) {
    closeDatabase(db);
    fail('ADMIN_BOOTSTRAP_TOKEN must be configured in production before bootstrapping an administrator.');
  }
  if (expectedToken) {
    if (!providedToken || !timingSafeEqualStrings(providedToken, expectedToken)) {
      closeDatabase(db);
      fail('Invalid bootstrap token. Provide the value configured in ADMIN_BOOTSTRAP_TOKEN with --token.');
    }
  } else {
    console.warn(
      '⚠ ADMIN_BOOTSTRAP_TOKEN is not set. Local CLI access is the only authorization for this development bootstrap.',
    );
  }

  const activeSupers = (
    db
      .prepare("SELECT COUNT(*) AS count FROM administrators WHERE role = 'super_admin' AND is_active = 1")
      .get() as { count: number }
  ).count;

  if (!resetTarget && activeSupers > 0) {
    closeDatabase(db);
    fail(
      'An active Super Admin already exists. Bootstrap is only available on a fresh installation. ' +
        'Use --reset <email> with the bootstrap token to recover access.',
    );
  }

  const email = (
    (typeof args.email === 'string' ? args.email : process.env.ADMIN_EMAIL) ??
    (await promptText('Administrator email: '))
  )
    .trim()
    .toLowerCase();

  if (resetTarget) {
    const target = findAdminByEmail(db, email);
    if (!target) {
      closeDatabase(db);
      fail(`No administrator found with email ${email}`);
    }
    const password =
      process.env.ADMIN_BOOTSTRAP_PASSWORD ?? (typeof args.password === 'string' ? args.password : null) ??
      (await promptHidden('New password (min 12 characters): '));
    if (password.length < 12) {
      closeDatabase(db);
      fail('Password must be at least 12 characters.');
    }
    const passwordHash = await hashPassword(password);
    const now = nowIso();
    db.prepare(
      `UPDATE administrators
          SET password_hash = ?, password_changed_at = ?, updated_at = ?,
              failed_login_count = 0, locked_until = NULL, is_active = 1
        WHERE id = ?`,
    ).run(passwordHash, now, now, target.id);
    revokeAllSessionsForAdmin(db, target.id);
    recordAudit(db, {
      actorAdminId: null,
      action: 'administrator.password_reset_cli',
      entityType: 'administrator',
      entityId: target.id,
      metadata: { email: target.email, sessionsRevoked: true },
      requestId: `cli-${randomToken(6)}`,
    });
    console.log(`\n✔ Password reset for ${target.email} (${target.role}). All sessions were revoked.\n`);
    closeDatabase(db);
    return;
  }

  const displayName = (
    (typeof args.name === 'string' ? args.name : process.env.ADMIN_NAME) ??
    (await promptText('Display name: '))
  ).trim();

  const password =
    process.env.ADMIN_BOOTSTRAP_PASSWORD ?? (typeof args.password === 'string' ? args.password : null) ??
    (await promptHidden('Password (min 12 characters): '));
  const passwordConfirm =
    process.env.ADMIN_BOOTSTRAP_PASSWORD ? password : await promptHidden('Confirm password: ');

  if (password !== passwordConfirm) {
    closeDatabase(db);
    fail('Passwords do not match.');
  }

  const parsed = bootstrapAdminSchema.safeParse({
    email,
    displayName,
    password,
  });
  if (!parsed.success) {
    closeDatabase(db);
    fail(parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n'));
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const now = nowIso();
  const result = db
    .prepare(
      `INSERT INTO administrators
         (email, password_hash, display_name, role, is_active, created_at, updated_at, password_changed_at)
       VALUES (?, ?, ?, 'super_admin', 1, ?, ?, ?)`,
    )
    .run(parsed.data.email, passwordHash, parsed.data.displayName, now, now, now);

  const id = Number(result.lastInsertRowid);
  recordAudit(db, {
    actorAdminId: null,
    action: 'administrator.bootstrapped',
    entityType: 'administrator',
    entityId: id,
    metadata: { email: parsed.data.email, role: 'super_admin' },
    requestId: `cli-${randomToken(6)}`,
  });

  console.log(`\n✔ Super Admin created: ${parsed.data.email} (id ${id})`);
  console.log('  Bootstrap is now unavailable because an active Super Admin exists.');
  console.log('  Sign in at /admin/login. Never commit or share the password.\n');

  // Sanity check: the schema permits the generated credentials.
  loginSchema.parse({ email: parsed.data.email, password: parsed.data.password });

  closeDatabase(db);
}

void main().catch((error) => {
  fail((error as Error).message);
});

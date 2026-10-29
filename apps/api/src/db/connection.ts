import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { sha256 } from '../lib/crypto.js';
import { nowIso } from '../lib/time.js';

export type Db = Database.Database;

export interface AppliedMigration {
  version: string;
  checksum: string;
  appliedAt: string;
}

export interface OpenDatabaseOptions {
  readonly?: boolean;
}

export function openDatabase(databasePath: string, options: OpenDatabaseOptions = {}): Db {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new Database(databasePath, { readonly: options.readonly ?? false, fileMustExist: false });
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('trusted_schema = OFF');
  if (!options.readonly) {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
  }
  return db;
}

export function listMigrations(migrationsDir: string): { version: string; file: string }[] {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migration directory not found: ${migrationsDir}`);
  }
  return fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b))
    .map((file) => ({ version: file.replace(/\.sql$/, ''), file: path.join(migrationsDir, file) }));
}

export function runMigrations(db: Db, migrationsDir: string): AppliedMigration[] {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      checksum   TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
  const applied = new Map<string, string>();
  for (const row of db.prepare('SELECT version, checksum FROM schema_migrations').all() as {
    version: string;
    checksum: string;
  }[]) {
    applied.set(row.version, row.checksum);
  }

  const newlyApplied: AppliedMigration[] = [];
  for (const migration of listMigrations(migrationsDir)) {
    const sql = fs.readFileSync(migration.file, 'utf8');
    const checksum = sha256(sql);
    const previous = applied.get(migration.version);
    if (previous) {
      if (previous !== checksum) {
        throw new Error(
          `Migration ${migration.version} has changed after being applied (checksum mismatch). ` +
            'Migrations are immutable; create a new migration instead.',
        );
      }
      continue;
    }
    const appliedAt = nowIso();
    const apply = db.transaction(() => {
      db.exec(sql);
      db.prepare(
        'INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)',
      ).run(migration.version, checksum, appliedAt);
    });
    apply();
    newlyApplied.push({ version: migration.version, checksum, appliedAt });
  }
  return newlyApplied;
}

export function getAppliedMigrations(db: Db): AppliedMigration[] {
  return db
    .prepare('SELECT version, checksum, applied_at as appliedAt FROM schema_migrations ORDER BY version')
    .all() as AppliedMigration[];
}

export function closeDatabase(db: Db): void {
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
  } catch {
    // WAL checkpoint is best-effort during shutdown.
  }
  db.close();
}

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { AppConfig } from '../config.js';
import type { Db } from '../db/connection.js';
import { openDatabase } from '../db/connection.js';
import { sha256 } from '../lib/crypto.js';
import { nowIso } from '../lib/time.js';

export interface BackupResult {
  directory: string;
  createdAt: string;
  databaseBytes: number;
  documentRows: number;
  uploadFiles: number;
  uploadBytes: number;
  integrity: string;
}

function timestampSlug(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
  );
}

function uniqueDirectory(base: string): string {
  if (!fs.existsSync(base)) return base;
  let counter = 2;
  for (;;) {
    const candidate = `${base}-${counter}`;
    if (!fs.existsSync(candidate)) return candidate;
    counter += 1;
  }
}

async function directoryStats(dir: string): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;
  const walk = async (current: string) => {
    const entries = await fsp.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.tmp') continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
      } else if (entry.isFile()) {
        files += 1;
        bytes += (await fsp.stat(absolute)).size;
      }
    }
  };
  await walk(dir);
  return { files, bytes };
}

/**
 * Creates a consistent backup using SQLite's online backup API (safe with WAL),
 * then copies private uploads and writes a manifest with integrity results.
 * Existing backups are never overwritten.
 */
export async function createBackup(db: Db, config: AppConfig): Promise<BackupResult> {
  const createdAt = nowIso();
  const directory = uniqueDirectory(path.join(config.backupDir, timestampSlug(new Date(createdAt))));
  await fsp.mkdir(directory, { recursive: true });

  const databaseFile = path.join(directory, 'database.sqlite');
  await db.backup(databaseFile);

  const restored = openDatabase(databaseFile, { readonly: true });
  let integrity = 'unknown';
  let documentRows = 0;
  let migrations: string[] = [];
  try {
    const check = restored.pragma('integrity_check') as { integrity_check: string }[];
    integrity = check[0]?.integrity_check ?? 'unknown';
    const fk = restored.pragma('foreign_key_check') as unknown[];
    if (fk.length > 0) integrity = `foreign_key_check_failed(${fk.length})`;
    documentRows = (
      restored.prepare('SELECT COUNT(*) AS count FROM application_documents').get() as {
        count: number;
      }
    ).count;
    migrations = (
      restored.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as {
        version: string;
      }[]
    ).map((row) => row.version);
  } finally {
    restored.close();
  }

  const uploadsTarget = path.join(directory, 'uploads');
  if (fs.existsSync(config.uploadsDir)) {
    await fsp.cp(config.uploadsDir, uploadsTarget, {
      recursive: true,
      filter: (source) => path.basename(source) !== '.tmp',
    });
  } else {
    await fsp.mkdir(uploadsTarget, { recursive: true });
  }

  const dbBuffer = await fsp.readFile(databaseFile);
  const uploadStats = await directoryStats(uploadsTarget);

  const manifest = {
    application: 'esme-recruitment-os',
    createdAt,
    database: {
      file: 'database.sqlite',
      sizeBytes: dbBuffer.length,
      sha256: sha256(dbBuffer),
      integrity,
    },
    migrations,
    documents: { rows: documentRows },
    uploads: { directory: 'uploads', ...uploadStats },
  };
  await fsp.writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2));

  return {
    directory,
    createdAt,
    databaseBytes: dbBuffer.length,
    documentRows,
    uploadFiles: uploadStats.files,
    uploadBytes: uploadStats.bytes,
    integrity,
  };
}

export interface RestoreResult {
  restoredDatabase: string;
  restoredUploads: string;
  documentRows: number;
  uploadFiles: number;
}

export async function verifyBackupDirectory(sourceDir: string): Promise<{
  manifest: Record<string, unknown>;
  documentRows: number;
  uploadFiles: number;
}> {
  const manifestPath = path.join(sourceDir, 'manifest.json');
  const databaseFile = path.join(sourceDir, 'database.sqlite');
  if (!fs.existsSync(manifestPath) || !fs.existsSync(databaseFile)) {
    throw new Error('Backup directory must contain manifest.json and database.sqlite');
  }
  const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8')) as Record<string, unknown>;
  const db = openDatabase(databaseFile, { readonly: true });
  try {
    const check = db.pragma('integrity_check') as { integrity_check: string }[];
    if (check[0]?.integrity_check !== 'ok') {
      throw new Error(`Backup database failed integrity_check: ${check[0]?.integrity_check}`);
    }
    const expected = (manifest.database as { sha256?: string } | undefined)?.sha256;
    const actual = sha256(await fsp.readFile(databaseFile));
    if (expected && expected !== actual) {
      throw new Error('Backup database checksum does not match its manifest');
    }
    const documentRows = (
      db.prepare('SELECT COUNT(*) AS count FROM application_documents').get() as { count: number }
    ).count;
    const uploadsDir = path.join(sourceDir, 'uploads');
    const uploadFiles = fs.existsSync(uploadsDir) ? (await directoryStats(uploadsDir)).files : 0;
    return { manifest, documentRows, uploadFiles };
  } finally {
    db.close();
  }
}

export async function restoreBackup(
  sourceDir: string,
  config: AppConfig,
  options: { force: boolean },
): Promise<RestoreResult> {
  await verifyBackupDirectory(sourceDir);
  const databaseFile = path.join(sourceDir, 'database.sqlite');
  const uploadsSource = path.join(sourceDir, 'uploads');

  if (fs.existsSync(config.databasePath) && !options.force) {
    throw new Error(
      `Refusing to overwrite existing database at ${config.databasePath}. Stop the API and pass --force to replace it.`,
    );
  }

  await fsp.mkdir(path.dirname(config.databasePath), { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) {
    const file = `${config.databasePath}${suffix}`;
    if (fs.existsSync(file)) await fsp.unlink(file);
  }
  await fsp.copyFile(databaseFile, config.databasePath);

  await fsp.rm(config.uploadsDir, { recursive: true, force: true });
  await fsp.mkdir(config.uploadsDir, { recursive: true });
  if (fs.existsSync(uploadsSource)) {
    await fsp.cp(uploadsSource, config.uploadsDir, { recursive: true });
  }

  const restored = openDatabase(config.databasePath, { readonly: true });
  let documentRows = 0;
  try {
    const check = restored.pragma('integrity_check') as { integrity_check: string }[];
    if (check[0]?.integrity_check !== 'ok') {
      throw new Error('Restored database failed integrity_check');
    }
    documentRows = (
      restored.prepare('SELECT COUNT(*) AS count FROM application_documents').get() as {
        count: number;
      }
    ).count;
  } finally {
    restored.close();
  }

  const uploadFiles = fs.existsSync(config.uploadsDir)
    ? (await directoryStats(config.uploadsDir)).files
    : 0;

  return {
    restoredDatabase: config.databasePath,
    restoredUploads: config.uploadsDir,
    documentRows,
    uploadFiles,
  };
}

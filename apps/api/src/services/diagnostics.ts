import fs from 'node:fs';
import type { AppConfig } from '../config.js';
import type { Db } from '../db/connection.js';
import { getAppliedMigrations } from '../db/connection.js';
import type { SystemDiagnosticsDTO } from '@esme/shared';
import type { FileStorage } from './storage.js';
import { getSettings } from './settings.js';
import { previewRetention } from './retention.js';

export function getDiagnostics(
  db: Db,
  storage: FileStorage,
  config: AppConfig,
): SystemDiagnosticsDTO {
  const migrations = getAppliedMigrations(db).map((migration) => ({
    version: migration.version,
    appliedAt: migration.appliedAt,
  }));

  let dbReady = true;
  try {
    db.prepare('SELECT 1').get();
    db.pragma('quick_check');
  } catch {
    dbReady = false;
  }

  const databaseBytes = fs.existsSync(config.databasePath)
    ? fs.statSync(config.databasePath).size
    : 0;

  const documentRows = db
    .prepare(
      'SELECT id, storage_name, document_type, file_size FROM application_documents WHERE deleted_at IS NULL',
    )
    .all() as { id: number; storage_name: string; document_type: string; file_size: number }[];

  const files = new Set(storage.listFiles());
  const referenced = new Set(documentRows.map((row) => row.storage_name));
  const missing = documentRows.filter((row) => !files.has(row.storage_name));
  const orphanedFiles = Array.from(files).filter((file) => !referenced.has(file)).length;
  const orphanedTemporary = storage.listTemporaryFiles().length;

  const settings = getSettings(db);
  const retention = previewRetention(db, settings);

  const counts = {
    applications: (
      db.prepare('SELECT COUNT(*) AS count FROM applications').get() as { count: number }
    ).count,
    administrators: (
      db.prepare('SELECT COUNT(*) AS count FROM administrators').get() as { count: number }
    ).count,
    auditEntries: (
      db.prepare('SELECT COUNT(*) AS count FROM audit_logs').get() as { count: number }
    ).count,
  };

  return {
    migrations,
    database: { ready: dbReady, ok: dbReady, sizeBytes: databaseBytes },
    storage: {
      ready: storage.isReady(),
      writable: storage.checkWritable(),
      documentCount: documentRows.length,
      totalBytes: documentRows.reduce((sum, row) => sum + row.file_size, 0),
    },
    reconciliation: {
      missingFiles: missing.slice(0, 50).map((row) => ({ documentId: row.id, type: row.document_type })),
      orphanedFiles,
      orphanedTemporary,
    },
    retention,
    counts,
  };
}

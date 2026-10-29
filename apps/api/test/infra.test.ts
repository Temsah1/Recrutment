import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_SETTINGS,
  UPLOAD_LIMITS,
  type AppSettings,
} from '@esme/shared';
import {
  getAppliedMigrations,
  openDatabase,
  runMigrations,
  type Db,
} from '../src/db/connection.js';
import { seedDefaults } from '../src/db/seed.js';
import { FileStorage } from '../src/services/storage.js';
import { validateUploadedDocument } from '../src/services/documents.js';
import { createBackup, restoreBackup, verifyBackupDirectory } from '../src/services/backup.js';
import { AppError } from '../src/lib/errors.js';
import {
  PDF_BYTES,
  PNG_BYTES,
  REPO_ROOT,
  createTestContext,
  submitApplication,
  type TestContext,
} from './helpers.js';

const MIGRATIONS_DIR = path.join(REPO_ROOT, 'database', 'migrations');

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `esme-${prefix}-`));
}

describe('database migrations', () => {
  let dir: string;
  let db: Db;

  beforeEach(() => {
    dir = tempDir('migrations');
    db = openDatabase(path.join(dir, 'db.sqlite'));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('applies each migration once and records its checksum', () => {
    const applied = runMigrations(db, MIGRATIONS_DIR);
    expect(applied.map((m) => m.version)).toEqual(['001_init']);
    expect(applied[0]!.checksum).toMatch(/^[a-f0-9]{64}$/);

    expect(runMigrations(db, MIGRATIONS_DIR)).toEqual([]);
    expect(getAppliedMigrations(db)).toHaveLength(1);
  });

  it('refuses to run when an applied migration file has changed', () => {
    const copy = path.join(dir, 'migrations');
    fs.cpSync(MIGRATIONS_DIR, copy, { recursive: true });
    runMigrations(db, copy);

    const file = path.join(copy, '001_init.sql');
    fs.appendFileSync(file, '\n-- drift\n');
    expect(() => runMigrations(db, copy)).toThrow(/checksum mismatch/i);
  });

  it('enforces foreign keys and unique indexes', () => {
    runMigrations(db, MIGRATIONS_DIR);
    seedDefaults(db);
    const now = new Date().toISOString();
    expect(() =>
      db
        .prepare(
          `INSERT INTO applications
             (public_reference, applicant_id, recruitment_cycle_id, primary_department_id,
              contact_email, status, consent_accepted_at, consent_policy_version, submitted_at,
              row_version, created_at, updated_at)
           VALUES ('ESME-2026-TEST-TEST-TEST', 99999, 1, 1, 'ghost@example.com', 'pending',
                   ?, 'v1', ?, 1, ?, ?)`,
        )
        .run(now, now, now, now),
    ).toThrow(/FOREIGN KEY/i);

    expect(() =>
      db
        .prepare(
          `INSERT INTO administrators
             (email, password_hash, display_name, role, is_active, created_at, updated_at, password_changed_at)
           VALUES ('admin@esme.test', 'hash', 'One', 'super_admin', 1, ?, ?, ?)`,
        )
        .run(now, now, now),
    ).not.toThrow();
    expect(() =>
      db
        .prepare(
          `INSERT INTO administrators
             (email, password_hash, display_name, role, is_active, created_at, updated_at, password_changed_at)
           VALUES ('ADMIN@esme.test', 'hash', 'Two', 'reviewer', 1, ?, ?, ?)`,
        )
        .run(now, now, now),
    ).toThrow(/UNIQUE/i);
  });
});

describe('private file storage', () => {
  let dir: string;
  let storage: FileStorage;

  beforeEach(() => {
    dir = tempDir('storage');
    storage = new FileStorage(path.join(dir, 'uploads'));
    storage.init();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('rejects absolute, empty and traversal references', () => {
    for (const reference of ['', '..', '../secret', 'a/../../b', '/etc/passwd', 'C:\\Windows\\win.ini', 'a\0b']) {
      expect(() => storage.absolutePath(reference), reference).toThrow(AppError);
    }
  });

  it('writes, resolves and deletes random files', () => {
    const relative = storage.save(PDF_BYTES, '.pdf');
    expect(relative).toMatch(/^\d{4}\/\d{2}\/[a-f0-9-]{36}\.pdf$/);
    expect(storage.exists(relative)).toBe(true);
    expect(storage.size(relative)).toBe(PDF_BYTES.length);
    expect(storage.listFiles()).toEqual([relative]);

    expect(storage.delete(relative).deleted).toBe(true);
    expect(storage.exists(relative)).toBe(false);
    expect(storage.delete(relative).deleted).toBe(true);
  });

  it('reads streams and reports missing files', async () => {
    const relative = storage.save(PNG_BYTES, '.png');
    const stream = storage.createStream(relative);
    expect(stream.path.toString().replace(/\\/g, '/')).toContain(relative);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).equals(PNG_BYTES)).toBe(true);
    expect(() => storage.createStream('2026/01/missing.pdf')).toThrow(/missing/i);
  });

  it('cleans stale temporary files only', () => {
    const tmp = path.join(dir, 'uploads', '.tmp');
    const stale = path.join(tmp, 'stale.part');
    const fresh = path.join(tmp, 'fresh.part');
    fs.writeFileSync(stale, 'x');
    fs.writeFileSync(fresh, 'x');
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
    fs.utimesSync(stale, old, old);
    expect(storage.cleanupTemporaryFiles(24 * 60 * 60 * 1000)).toBe(1);
    expect(fs.existsSync(stale)).toBe(false);
    expect(fs.existsSync(fresh)).toBe(true);
  });
});

describe('document validation', () => {
  const settings = structuredClone(DEFAULT_SETTINGS) as unknown as AppSettings;
  const hardMax = UPLOAD_LIMITS.hardMaxBytes;

  it('accepts genuine PDFs and images for the matching document type', async () => {
    const pdf = await validateUploadedDocument(
      { data: PDF_BYTES, filename: 'National ID.pdf', mimetype: 'application/pdf' },
      'national_id',
      settings,
      hardMax,
    );
    expect(pdf).toMatchObject({ contentType: 'application/pdf', extension: '.pdf', originalFilename: 'National ID.pdf' });

    const png = await validateUploadedDocument(
      { data: PNG_BYTES, filename: 'university-id.png', mimetype: 'image/png' },
      'university_id',
      settings,
      hardMax,
    );
    expect(png).toMatchObject({ contentType: 'image/png', extension: '.png' });
  });

  it('rejects mismatched, spoofed and unsupported files', async () => {
    await expect(
      validateUploadedDocument(
        { data: PNG_BYTES, filename: 'id.pdf', mimetype: 'application/pdf' },
        'national_id',
        settings,
        hardMax,
      ),
    ).rejects.toMatchObject({ statusCode: 415 });

    await expect(
      validateUploadedDocument(
        { data: Buffer.from('just some text, definitely not a document'), filename: 'x.pdf', mimetype: 'application/pdf' },
        'national_id',
        settings,
        hardMax,
      ),
    ).rejects.toMatchObject({ statusCode: 415 });

    await expect(
      validateUploadedDocument(
        { data: PDF_BYTES, filename: 'id.pdf', mimetype: 'application/pdf' },
        'university_id',
        settings,
        hardMax,
      ),
    ).rejects.toMatchObject({ statusCode: 415 });
  });

  it('enforces empty, minimum and maximum size limits', async () => {
    await expect(
      validateUploadedDocument({ data: Buffer.alloc(0), filename: 'x.pdf', mimetype: 'application/pdf' }, 'national_id', settings, hardMax),
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      validateUploadedDocument({ data: Buffer.from('%PDF-1'), filename: 'x.pdf', mimetype: 'application/pdf' }, 'national_id', settings, hardMax),
    ).rejects.toMatchObject({ statusCode: 400 });

    const smallLimit = { ...settings, documents: { ...settings.documents, maxSizeBytes: UPLOAD_LIMITS.minBytes } };
    const oversized = Buffer.concat([PDF_BYTES, Buffer.alloc(UPLOAD_LIMITS.minBytes)]);
    await expect(
      validateUploadedDocument({ data: oversized, filename: 'x.pdf', mimetype: 'application/pdf' }, 'national_id', smallLimit, hardMax),
    ).rejects.toMatchObject({ statusCode: 413 });
  });
});

describe('backup and restore', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
    const submitted = await submitApplication(ctx.app, { email: 'backup-restore@example.com' });
    expect(submitted.statusCode).toBe(201);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('creates a verifiable backup and restores database and uploads', async () => {
    const backup = await createBackup(ctx.db, ctx.config);
    expect(backup.integrity).toBe('ok');
    expect(backup.documentRows).toBe(2);
    expect(backup.uploadFiles).toBe(2);

    const verified = await verifyBackupDirectory(backup.directory);
    expect(verified.documentRows).toBe(2);
    expect(verified.uploadFiles).toBe(2);

    const targetRoot = path.join(ctx.root, 'restored');
    const targetConfig = {
      ...ctx.config,
      dataDir: targetRoot,
      databasePath: path.join(targetRoot, 'db', 'restored.sqlite'),
      uploadsDir: path.join(targetRoot, 'uploads'),
      backupDir: path.join(targetRoot, 'backups'),
    };

    const restored = await restoreBackup(backup.directory, targetConfig, { force: true });
    expect(restored.documentRows).toBe(2);
    expect(restored.uploadFiles).toBe(2);

    const restoredDb = openDatabase(targetConfig.databasePath, { readonly: true });
    try {
      const check = restoredDb.pragma('integrity_check') as { integrity_check: string }[];
      expect(check[0]!.integrity_check).toBe('ok');
      expect(
        (restoredDb.prepare('SELECT COUNT(*) AS count FROM applications').get() as { count: number }).count,
      ).toBe(1);
      const names = restoredDb
        .prepare('SELECT storage_name FROM application_documents')
        .all() as { storage_name: string }[];
      for (const row of names) {
        expect(fs.existsSync(path.join(targetConfig.uploadsDir, row.storage_name))).toBe(true);
      }
    } finally {
      restoredDb.close();
    }
  });

  it('refuses to overwrite an existing database without force', async () => {
    const backup = await createBackup(ctx.db, ctx.config);
    await expect(restoreBackup(backup.directory, ctx.config, { force: false })).rejects.toThrow(
      /Refusing to overwrite/i,
    );
  });
});

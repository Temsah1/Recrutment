import type { AppSettings } from '@esme/shared';
import type { Db } from '../db/connection.js';
import type { DocumentRow } from '../db/rows.js';
import { AppError } from '../lib/errors.js';
import { nowIso } from '../lib/time.js';
import { recordAudit } from './audit.js';
import type { FileStorage } from './storage.js';

export interface RetentionApplicationPreview {
  id: number;
  reference: string;
  status: string;
  decidedAt: string | null;
}

export interface RetentionPreview {
  enabled: boolean;
  days: number;
  cutoff: string;
  eligibleApplications: number;
  applications: RetentionApplicationPreview[];
  documentCount: number;
  applicantCount: number;
  totalApplications: number;
}

function cutoffFor(days: number, now: Date): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

const ELIGIBLE_WHERE = `submitted_at < ? AND status IN ('accepted', 'rejected')`;

export function previewRetention(
  db: Db,
  settings: AppSettings,
  now: Date = new Date(),
): RetentionPreview {
  const cutoff = cutoffFor(settings.retention.days, now);
  const rows = db
    .prepare(
      `SELECT a.id, a.public_reference AS reference, a.status, a.applicant_id,
              (SELECT h.created_at FROM application_status_history h
                WHERE h.application_id = a.id AND h.new_status IN ('accepted', 'rejected')
                ORDER BY h.created_at DESC, h.id DESC LIMIT 1) AS decided_at
         FROM applications a
        WHERE a.submitted_at < ? AND a.status IN ('accepted', 'rejected')
        ORDER BY a.submitted_at ASC`,
    )
    .all(cutoff) as {
    id: number;
    reference: string;
    status: string;
    applicant_id: number;
    decided_at: string | null;
  }[];

  const ids = rows.map((row) => row.id);
  const documentCount =
    ids.length === 0
      ? 0
      : (
          db
            .prepare(
              `SELECT COUNT(*) AS count FROM application_documents
                WHERE application_id IN (${ids.map(() => '?').join(',')})`,
            )
            .get(...ids) as { count: number }
        ).count;

  return {
    enabled: settings.retention.enabled,
    days: settings.retention.days,
    cutoff,
    eligibleApplications: rows.length,
    applications: rows.map((row) => ({
      id: row.id,
      reference: row.reference,
      status: row.status,
      decidedAt: row.decided_at,
    })),
    documentCount,
    applicantCount: new Set(rows.map((row) => row.applicant_id)).size,
    totalApplications: rows.length,
  };
}

export interface CleanupResult {
  applicationsDeleted: number;
  documentsDeleted: number;
  applicantsDeleted: number;
  filesDeleted: number;
  fileFailures: { documentId: number; error: string }[];
  temporaryFilesRemoved: number;
  cutoff: string;
}

/**
 * Destructive cleanup for decided applications past the configured retention
 * window. Disabled by default; requires an explicit confirmation token.
 */
export function cleanupRetention(
  db: Db,
  storage: FileStorage,
  settings: AppSettings,
  params: { confirmation: string; actorAdminId: number; requestId?: string | null },
): CleanupResult {
  if (!settings.retention.enabled) {
    throw AppError.badRequest('Retention cleanup is disabled. Enable it in settings after review.');
  }
  if (params.confirmation !== 'DELETE') {
    throw AppError.badRequest('Type DELETE to confirm this destructive operation');
  }

  const cutoff = cutoffFor(settings.retention.days, new Date());
  const ids = (
    db
      .prepare(`SELECT id FROM applications WHERE ${ELIGIBLE_WHERE}`)
      .all(cutoff) as { id: number }[]
  ).map((row) => row.id);

  const documents: DocumentRow[] = [];
  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    documents.push(
      ...(db
        .prepare(
          `SELECT * FROM application_documents WHERE application_id IN (${placeholders})`,
        )
        .all(...ids) as DocumentRow[]),
    );
  }

  const applicantIds =
    ids.length === 0
      ? []
      : (
          db
            .prepare(
              `SELECT DISTINCT applicant_id FROM applications
                WHERE id IN (${ids.map(() => '?').join(',')})`,
            )
            .all(...ids) as { applicant_id: number }[]
        ).map((row) => row.applicant_id);

  const result = db.transaction(() => {
    let removed = 0;
    let applicantsRemoved = 0;
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      removed = db
        .prepare(`DELETE FROM applications WHERE id IN (${placeholders})`)
        .run(...ids).changes;
      db.prepare(
        'DELETE FROM applicants WHERE id NOT IN (SELECT applicant_id FROM applications)',
      ).run();
      if (applicantIds.length > 0) {
        const remaining = (
          db
            .prepare(
              `SELECT COUNT(*) AS count FROM applicants
                WHERE id IN (${applicantIds.map(() => '?').join(',')})`,
            )
            .get(...applicantIds) as { count: number }
        ).count;
        applicantsRemoved = applicantIds.length - remaining;
      }
    }
    recordAudit(db, {
      actorAdminId: params.actorAdminId,
      action: 'retention.cleanup',
      entityType: 'application',
      entityId: null,
      metadata: { applicationsDeleted: removed, cutoff, documents: documents.length },
      requestId: params.requestId ?? null,
    });
    return { removed, applicantsRemoved };
  }).immediate();

  let filesDeleted = 0;
  const fileFailures: { documentId: number; error: string }[] = [];
  for (const document of documents) {
    const result = storage.delete(document.storage_name);
    if (result.deleted) filesDeleted += 1;
    else fileFailures.push({ documentId: document.id, error: result.error ?? 'Unknown error' });
  }

  const temporaryFilesRemoved = storage.cleanupTemporaryFiles(24 * 60 * 60 * 1000);

  return {
    applicationsDeleted: result.removed,
    documentsDeleted: documents.length,
    applicantsDeleted: result.applicantsRemoved,
    filesDeleted,
    fileFailures,
    temporaryFilesRemoved,
    cutoff,
  };
}

export function recordRetentionPreview(
  db: Db,
  preview: RetentionPreview,
  actorAdminId: number,
  requestId?: string | null,
): void {
  recordAudit(db, {
    actorAdminId,
    action: 'retention.preview',
    entityType: 'system',
    entityId: null,
    metadata: { ...preview, checkedAt: nowIso() },
    requestId: requestId ?? null,
  });
}

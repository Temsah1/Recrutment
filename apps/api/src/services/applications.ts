import {
  canTransition,
  hasPermission,
  DOCUMENT_TYPE_LABELS,
  type ApplicationDetailDTO,
  type ApplicationListDTO,
  type ApplicationListQuery,
  type ApplicationStatus,
  type ApplicationSubmission,
  type ApplicationSummaryDTO,
  type AuditEntryDTO,
  type DashboardDTO,
  type DocumentMetaDTO,
  type DocumentType,
  type NoteDTO,
  type ReviewerRef,
  type Role,
  type StatusEventDTO,
} from '@esme/shared';
import type { Db } from '../db/connection.js';
import type {
  AdministratorRow,
  ApplicationJoinedRow,
  AuditRow,
  CycleRow,
  DocumentRow,
  HistoryRow,
  NoteRow,
} from '../db/rows.js';
import { AppError } from '../lib/errors.js';
import { generatePublicReference, sha256 } from '../lib/crypto.js';
import { nowIso } from '../lib/time.js';
import { recordAudit } from './audit.js';
import type { FileStorage } from './storage.js';
import type { ValidatedUpload } from './documents.js';
import { findDepartmentBySlug } from './departments.js';
import { resolveRecruitmentState } from './settings.js';

export type Scope = { kind: 'all' } | { kind: 'assigned'; adminId: number };

export function scopeForAdmin(role: Role, adminId: number): Scope {
  return hasPermission(role, 'applications.view_all')
    ? { kind: 'all' }
    : { kind: 'assigned', adminId };
}

export function mapSummary(row: ApplicationJoinedRow): ApplicationSummaryDTO {
  return {
    id: row.id,
    reference: row.public_reference,
    fullName: row.full_name,
    email: row.email,
    primaryDepartment: row.primary_name ? { name: row.primary_name, slug: row.primary_slug } : null,
    secondaryDepartment:
      row.secondary_name && row.secondary_slug
        ? { name: row.secondary_name, slug: row.secondary_slug }
        : null,
    academicYear: row.academic_year,
    status: row.status,
    submittedAt: row.submitted_at,
    assignedReviewer:
      row.assigned_reviewer_id && row.reviewer_display_name
        ? { id: row.assigned_reviewer_id, displayName: row.reviewer_display_name }
        : null,
    version: row.row_version,
  };
}

const SUMMARY_SELECT = `
  SELECT a.id, a.public_reference, a.status, a.submitted_at, a.row_version,
         a.assigned_reviewer_id, ap.full_name, ap.email, ap.academic_year,
         pd.name AS primary_name, pd.slug AS primary_slug,
         sd.name AS secondary_name, sd.slug AS secondary_slug,
         rv.display_name AS reviewer_display_name
    FROM applications a
    JOIN applicants ap ON ap.id = a.applicant_id
    JOIN departments pd ON pd.id = a.primary_department_id
    LEFT JOIN departments sd ON sd.id = a.secondary_department_id
    LEFT JOIN administrators rv ON rv.id = a.assigned_reviewer_id
`;

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function buildWhere(query: ApplicationListQuery, scope: Scope): { clause: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (scope.kind === 'assigned') {
    clauses.push('a.assigned_reviewer_id = ?');
    params.push(scope.adminId);
  }
  if (query.q) {
    const pattern = `%${escapeLike(query.q)}%`;
    clauses.push(
      "(ap.full_name LIKE ? ESCAPE '\\' OR ap.email LIKE ? ESCAPE '\\' OR a.public_reference LIKE ? ESCAPE '\\')",
    );
    params.push(pattern, pattern, pattern);
  }
  if (query.status) {
    clauses.push('a.status = ?');
    params.push(query.status);
  }
  if (query.departmentSlug) {
    clauses.push('pd.slug = ?');
    params.push(query.departmentSlug);
  }
  if (query.academicYear) {
    clauses.push('ap.academic_year = ?');
    params.push(query.academicYear);
  }
  if (query.cycleId) {
    clauses.push('a.recruitment_cycle_id = ?');
    params.push(query.cycleId);
  }
  if (query.reviewerId) {
    clauses.push('a.assigned_reviewer_id = ?');
    params.push(query.reviewerId);
  }
  if (query.unassigned === 'true') {
    clauses.push('a.assigned_reviewer_id IS NULL');
  }
  if (query.from) {
    clauses.push('a.submitted_at >= ?');
    params.push(query.from);
  }
  if (query.to) {
    clauses.push('a.submitted_at <= ?');
    params.push(query.to);
  }

  return {
    clause: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
}

const SORT_COLUMNS: Record<ApplicationListQuery['sort'], string> = {
  submitted_at: 'a.submitted_at',
  full_name: 'ap.full_name',
  status: 'a.status',
  academic_year: 'ap.academic_year',
};

export function listApplications(
  db: Db,
  query: ApplicationListQuery,
  scope: Scope,
): ApplicationListDTO {
  const { clause, params } = buildWhere(query, scope);
  const total = (
    db
      .prepare(
        `SELECT COUNT(*) AS count
           FROM applications a
           JOIN applicants ap ON ap.id = a.applicant_id
           JOIN departments pd ON pd.id = a.primary_department_id
           ${clause}`,
      )
      .get(...params) as { count: number }
  ).count;

  const orderColumn = SORT_COLUMNS[query.sort];
  const direction = query.order === 'asc' ? 'ASC' : 'DESC';
  const offset = (query.page - 1) * query.pageSize;
  const rows = db
    .prepare(
      `${SUMMARY_SELECT} ${clause} ORDER BY ${orderColumn} ${direction}, a.id ${direction} LIMIT ? OFFSET ?`,
    )
    .all(...params, query.pageSize, offset) as ApplicationJoinedRow[];

  return {
    items: rows.map(mapSummary),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

function getJoinedApplication(db: Db, id: number): ApplicationJoinedRow | null {
  const row = db
    .prepare(
      `SELECT a.id, a.public_reference, a.status, a.submitted_at, a.row_version,
              a.assigned_reviewer_id, a.recruitment_cycle_id, a.primary_department_id,
              a.secondary_department_id, a.contact_email, a.consent_accepted_at,
              a.consent_policy_version, a.created_at, a.updated_at,
              ap.full_name, ap.preferred_name, ap.email, ap.phone, ap.university, ap.faculty,
              ap.academic_department, ap.academic_year, ap.github_url, ap.linkedin_url,
              ap.portfolio_url, ap.motivation_statement, ap.experience, ap.additional_information,
              ap.created_at AS applicant_created_at,
              pd.name AS primary_name, pd.slug AS primary_slug,
              sd.name AS secondary_name, sd.slug AS secondary_slug,
              rv.display_name AS reviewer_display_name,
              c.name AS cycle_name
         FROM applications a
         JOIN applicants ap ON ap.id = a.applicant_id
         JOIN departments pd ON pd.id = a.primary_department_id
         LEFT JOIN departments sd ON sd.id = a.secondary_department_id
         LEFT JOIN administrators rv ON rv.id = a.assigned_reviewer_id
         LEFT JOIN recruitment_cycles c ON c.id = a.recruitment_cycle_id
        WHERE a.id = ?`,
    )
    .get(id) as ApplicationJoinedRow | undefined;
  return row ?? null;
}

export function assertApplicationAccess(row: ApplicationJoinedRow, scope: Scope): void {
  if (scope.kind === 'assigned' && row.assigned_reviewer_id !== scope.adminId) {
    throw AppError.forbidden('This application is not assigned to you');
  }
}

export function mapDocument(row: DocumentRow): DocumentMetaDTO {
  return {
    id: row.id,
    type: row.document_type,
    originalFilename: row.original_filename,
    contentType: row.detected_content_type,
    size: row.file_size,
    uploadedAt: row.uploaded_at,
  };
}

export function mapHistoryRow(row: HistoryRow): StatusEventDTO {
  return {
    id: row.id,
    previousStatus: row.previous_status,
    newStatus: row.new_status,
    changedBy: row.changed_by_admin_id
      ? { id: row.changed_by_admin_id, displayName: row.actor_display_name ?? 'Administrator' }
      : null,
    reason: row.reason,
    createdAt: row.created_at,
  };
}

export function mapNoteRow(row: NoteRow): NoteDTO {
  return {
    id: row.id,
    author: row.author_admin_id
      ? { id: row.author_admin_id, displayName: row.author_display_name ?? 'Administrator' }
      : null,
    body: row.body,
    createdAt: row.created_at,
  };
}

export function getApplicationDetail(db: Db, id: number, scope: Scope): ApplicationDetailDTO {
  const row = getJoinedApplication(db, id);
  if (!row) throw AppError.notFound('Application not found');
  assertApplicationAccess(row, scope);

  const documents = db
    .prepare(
      'SELECT * FROM application_documents WHERE application_id = ? AND deleted_at IS NULL ORDER BY id',
    )
    .all(id) as DocumentRow[];

  const notes = db
    .prepare(
      `SELECT n.*, a.display_name AS author_display_name
         FROM application_notes n
         LEFT JOIN administrators a ON a.id = n.author_admin_id
        WHERE n.application_id = ?
        ORDER BY n.created_at ASC, n.id ASC`,
    )
    .all(id) as NoteRow[];

  const history = db
    .prepare(
      `SELECT h.*, a.display_name AS actor_display_name
         FROM application_status_history h
         LEFT JOIN administrators a ON a.id = h.changed_by_admin_id
        WHERE h.application_id = ?
        ORDER BY h.created_at ASC, h.id ASC`,
    )
    .all(id) as HistoryRow[];

  return {
    ...mapSummary(row),
    preferredName: row.preferred_name,
    phone: row.phone,
    university: row.university,
    faculty: row.faculty,
    academicDepartment: row.academic_department,
    githubUrl: row.github_url,
    linkedinUrl: row.linkedin_url,
    portfolioUrl: row.portfolio_url,
    motivationStatement: row.motivation_statement,
    experience: row.experience,
    additionalInformation: row.additional_information,
    cycle: row.recruitment_cycle_id
      ? { id: row.recruitment_cycle_id, name: row.cycle_name ?? 'Recruitment cycle' }
      : null,
    consent: {
      acceptedAt: row.consent_accepted_at,
      policyVersion: row.consent_policy_version,
    },
    documents: documents.map(mapDocument),
    notes: notes.map(mapNoteRow),
    history: history.map(mapHistoryRow),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface NewApplicationInput {
  payload: ApplicationSubmission;
  uploads: Partial<Record<DocumentType, ValidatedUpload>>;
  ip?: string | null;
  requestId?: string | null;
}

export interface NewApplicationResult {
  id: number;
  reference: string;
  submittedAt: string;
  replayed: boolean;
}

function isUniqueViolation(error: unknown, indexFragment?: string): boolean {
  const err = error as { code?: string; message?: string };
  if (err.code !== 'SQLITE_CONSTRAINT_UNIQUE' && err.code !== 'SQLITE_CONSTRAINT_PRIMARYKEY') {
    return false;
  }
  if (!indexFragment) return true;
  return (err.message ?? '').includes(indexFragment);
}

export function createApplication(
  db: Db,
  storage: FileStorage,
  input: NewApplicationInput,
): NewApplicationResult {
  const { payload } = input;
  const savedFiles: string[] = [];
  const idempotencyKey = payload.idempotencyKey ?? null;

  const transaction = db.transaction((): NewApplicationResult => {
    const state = resolveRecruitmentState(db);
    if (!state.open || !state.cycle) {
      throw new AppError(
        409,
        'recruitment_closed',
        state.closedReason === 'not_open_yet'
          ? 'Recruitment has not opened yet'
          : 'Recruitment is currently closed',
      );
    }
    const cycle = state.cycle;
    const settings = state.settings;

    if (idempotencyKey) {
      const existing = db
        .prepare('SELECT id, public_reference, submitted_at FROM applications WHERE idempotency_key = ?')
        .get(idempotencyKey) as
        | { id: number; public_reference: string; submitted_at: string }
        | undefined;
      if (existing) {
        return {
          id: existing.id,
          reference: existing.public_reference,
          submittedAt: existing.submitted_at,
          replayed: true,
        };
      }
    }

    const duplicate = db
      .prepare(
        'SELECT id FROM applications WHERE recruitment_cycle_id = ? AND contact_email = ? COLLATE NOCASE',
      )
      .get(cycle.id, payload.email) as { id: number } | undefined;
    if (duplicate) {
      throw new AppError(
        409,
        'duplicate_application',
        'An application with this email address has already been submitted for this recruitment cycle. Contact the recruitment team if you need to change something.',
      );
    }

    const primary = findDepartmentBySlug(db, payload.primaryDepartmentSlug);
    if (!primary || primary.is_active !== 1) {
      throw new AppError(400, 'validation_error', 'Select a valid department', [
        { path: 'primaryDepartmentSlug', message: 'Select a valid department' },
      ]);
    }

    let secondaryId: number | null = null;
    if (payload.secondaryDepartmentSlug) {
      if (!settings.form.allowSecondaryPreference) {
        throw new AppError(400, 'validation_error', 'A secondary department preference is not enabled', [
          { path: 'secondaryDepartmentSlug', message: 'Secondary preference is not enabled' },
        ]);
      }
      const secondary = findDepartmentBySlug(db, payload.secondaryDepartmentSlug);
      if (!secondary || secondary.is_active !== 1) {
        throw new AppError(400, 'validation_error', 'Select a valid secondary department', [
          { path: 'secondaryDepartmentSlug', message: 'Select a valid secondary department' },
        ]);
      }
      if (secondary.id === primary.id) {
        throw new AppError(400, 'validation_error', 'Choose a different secondary department', [
          { path: 'secondaryDepartmentSlug', message: 'Choose a different secondary department' },
        ]);
      }
      secondaryId = secondary.id;
    }

    if (
      !settings.form.allowOtherUniversities &&
      payload.university.trim().toLowerCase() !== 'cairo university'
    ) {
      throw new AppError(400, 'validation_error', 'Applications are limited to Cairo University students', [
        { path: 'university', message: 'Currently limited to Cairo University students' },
      ]);
    }

    if (settings.form.requireExperience && !payload.experience) {
      throw new AppError(400, 'validation_error', 'Relevant experience is required for this cycle', [
        { path: 'experience', message: 'Describe your relevant experience' },
      ]);
    }

    const nationalId = input.uploads.national_id;
    const universityId = input.uploads.university_id;
    if (settings.documents.nationalIdRequired && !nationalId) {
      throw new AppError(400, 'validation_error', 'A national ID PDF is required', [
        { path: 'national_id', message: 'Upload your national ID as a PDF' },
      ]);
    }
    if (settings.documents.universityIdRequired && !universityId) {
      throw new AppError(400, 'validation_error', 'A university ID image is required', [
        { path: 'university_id', message: 'Upload a photo of your university ID' },
      ]);
    }

    const now = nowIso();
    const applicant = db
      .prepare(
        `INSERT INTO applicants
           (full_name, preferred_name, email, phone, university, faculty, academic_department,
            academic_year, github_url, linkedin_url, portfolio_url, motivation_statement,
            experience, additional_information, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        payload.fullName,
        payload.preferredName?.trim() || null,
        payload.email,
        payload.phone,
        payload.university,
        payload.faculty,
        payload.academicDepartment,
        payload.academicYear,
        payload.githubUrl ?? null,
        payload.linkedinUrl ?? null,
        payload.portfolioUrl ?? null,
        payload.motivationStatement,
        payload.experience ?? null,
        settings.form.additionalInformationEnabled ? payload.additionalInformation ?? null : null,
        now,
        now,
      );

    const applicantId = Number(applicant.lastInsertRowid);
    const year = new Date(now).getUTCFullYear();

    let reference = generatePublicReference(year);
    let applicationId = 0;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const inserted = db
          .prepare(
            `INSERT INTO applications
               (public_reference, applicant_id, recruitment_cycle_id, primary_department_id,
                secondary_department_id, contact_email, status, consent_accepted_at,
                consent_policy_version, submitted_at, idempotency_key, row_version, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, 1, ?, ?)`,
          )
          .run(
            reference,
            applicantId,
            cycle.id,
            primary.id,
            secondaryId,
            payload.email,
            now,
            settings.privacy.version,
            now,
            idempotencyKey,
            now,
            now,
          );
        applicationId = Number(inserted.lastInsertRowid);
        break;
      } catch (error) {
        if (isUniqueViolation(error, 'public_reference') && attempt < 4) {
          reference = generatePublicReference(year);
          continue;
        }
        if (isUniqueViolation(error, 'contact_email')) {
          throw new AppError(
            409,
            'duplicate_application',
            'An application with this email address has already been submitted for this recruitment cycle.',
          );
        }
        if (isUniqueViolation(error, 'idempotency_key')) {
          const existing = db
            .prepare('SELECT id, public_reference, submitted_at FROM applications WHERE idempotency_key = ?')
            .get(idempotencyKey) as { id: number; public_reference: string; submitted_at: string };
          return {
            id: existing.id,
            reference: existing.public_reference,
            submittedAt: existing.submitted_at,
            replayed: true,
          };
        }
        throw error;
      }
    }
    if (!applicationId) {
      throw new AppError(500, 'internal_error', 'Could not allocate an application reference');
    }

    const insertDocument = db.prepare(
      `INSERT INTO application_documents
         (application_id, document_type, storage_name, original_filename, detected_content_type,
          file_size, checksum, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    for (const type of ['national_id', 'university_id'] as DocumentType[]) {
      const upload = input.uploads[type];
      if (!upload) continue;
      const relative = storage.save(upload.buffer, upload.extension);
      savedFiles.push(relative);
      insertDocument.run(
        applicationId,
        type,
        relative,
        upload.originalFilename,
        upload.contentType,
        upload.size,
        sha256(upload.buffer),
        now,
      );
    }

    db.prepare(
      `INSERT INTO application_status_history
         (application_id, previous_status, new_status, changed_by_admin_id, reason, created_at)
       VALUES (?, NULL, 'pending', NULL, 'Submitted through the public application form', ?)`,
    ).run(applicationId, now);

    recordAudit(db, {
      actorAdminId: null,
      action: 'application.submitted',
      entityType: 'application',
      entityId: applicationId,
      metadata: {
        reference,
        cycleId: cycle.id,
        department: primary.slug,
        documents: Object.keys(input.uploads),
      },
      requestId: input.requestId ?? null,
    });

    return { id: applicationId, reference, submittedAt: now, replayed: false };
  });

  try {
    return transaction.immediate();
  } catch (error) {
    for (const file of savedFiles) storage.delete(file);
    throw error;
  }
}

export function updateApplicationStatus(
  db: Db,
  params: {
    applicationId: number;
    admin: AdministratorRow;
    scope: Scope;
    status: ApplicationStatus;
    reason?: string | null;
    expectedVersion?: number;
    requestId?: string | null;
  },
): { status: ApplicationStatus; version: number } {
  const { applicationId, admin, scope, status, reason, expectedVersion } = params;

  return db.transaction(() => {
    const row = getJoinedApplication(db, applicationId);
    if (!row) throw AppError.notFound('Application not found');
    assertApplicationAccess(row, scope);

    if (!canTransition(row.status, status)) {
      throw AppError.badRequest(
        row.status === status
          ? `Application is already ${row.status}`
          : `Cannot change status from ${row.status} to ${status}`,
      );
    }
    if (expectedVersion !== undefined && expectedVersion !== row.row_version) {
      throw new AppError(
        409,
        'conflict',
        'This application was updated by another administrator. Reload and try again.',
      );
    }

    const now = nowIso();
    const update = db
      .prepare(
        `UPDATE applications
            SET status = ?, row_version = row_version + 1, updated_at = ?
          WHERE id = ? AND row_version = ?`,
      )
      .run(status, now, applicationId, row.row_version);

    if (update.changes !== 1) {
      throw new AppError(409, 'conflict', 'Concurrent update detected. Reload and try again.');
    }

    db.prepare(
      `INSERT INTO application_status_history
         (application_id, previous_status, new_status, changed_by_admin_id, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(applicationId, row.status, status, admin.id, reason ?? null, now);

    recordAudit(db, {
      actorAdminId: admin.id,
      action: 'application.status_changed',
      entityType: 'application',
      entityId: applicationId,
      metadata: {
        reference: row.public_reference,
        from: row.status,
        to: status,
        reason: reason ?? null,
      },
      requestId: params.requestId ?? null,
    });

    return { status, version: row.row_version + 1 };
  }).immediate();
}

export function addApplicationNote(
  db: Db,
  params: {
    applicationId: number;
    admin: AdministratorRow;
    scope: Scope;
    body: string;
    requestId?: string | null;
  },
): NoteDTO {
  const row = getJoinedApplication(db, params.applicationId);
  if (!row) throw AppError.notFound('Application not found');
  assertApplicationAccess(row, params.scope);

  const now = nowIso();
  const result = db
    .prepare(
      `INSERT INTO application_notes (application_id, author_admin_id, body, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(params.applicationId, params.admin.id, params.body, now);

  recordAudit(db, {
    actorAdminId: params.admin.id,
    action: 'application.note_added',
    entityType: 'application',
    entityId: params.applicationId,
    metadata: { reference: row.public_reference },
    requestId: params.requestId ?? null,
  });

  return {
    id: Number(result.lastInsertRowid),
    author: { id: params.admin.id, displayName: params.admin.display_name },
    body: params.body,
    createdAt: now,
  };
}

export function assignReviewer(
  db: Db,
  params: {
    applicationId: number;
    reviewerId: number | null;
    admin: AdministratorRow;
    requestId?: string | null;
  },
): { reviewer: ReviewerRef | null } {
  return db.transaction(() => {
    const row = getJoinedApplication(db, params.applicationId);
    if (!row) throw AppError.notFound('Application not found');

    let reviewer: ReviewerRef | null = null;
    if (params.reviewerId !== null) {
      const target = db
        .prepare('SELECT id, display_name, is_active FROM administrators WHERE id = ?')
        .get(params.reviewerId) as
        | { id: number; display_name: string; is_active: number }
        | undefined;
      if (!target || target.is_active !== 1) {
        throw AppError.badRequest('Select an active administrator to assign');
      }
      reviewer = { id: target.id, displayName: target.display_name };
    }

    db.prepare('UPDATE applications SET assigned_reviewer_id = ?, updated_at = ? WHERE id = ?').run(
      params.reviewerId,
      nowIso(),
      params.applicationId,
    );

    recordAudit(db, {
      actorAdminId: params.admin.id,
      action: 'application.assigned',
      entityType: 'application',
      entityId: params.applicationId,
      metadata: {
        reference: row.public_reference,
        reviewerId: params.reviewerId,
        reviewerName: reviewer?.displayName ?? null,
      },
      requestId: params.requestId ?? null,
    });

    return { reviewer };
  }).immediate();
}

export function listReviewers(db: Db): ReviewerRef[] {
  const rows = db
    .prepare(
      "SELECT id, display_name FROM administrators WHERE is_active = 1 ORDER BY display_name COLLATE NOCASE",
    )
    .all() as { id: number; display_name: string }[];
  return rows.map((row) => ({ id: row.id, displayName: row.display_name }));
}

export function listActiveDocuments(db: Db, applicationId: number): DocumentMetaDTO[] {
  const rows = db
    .prepare(
      'SELECT * FROM application_documents WHERE application_id = ? AND deleted_at IS NULL ORDER BY id',
    )
    .all(applicationId) as DocumentRow[];
  return rows.map(mapDocument);
}

export function documentTypeLabel(type: DocumentType): string {
  return DOCUMENT_TYPE_LABELS[type];
}

export function mapAuditRow(row: AuditRow): AuditEntryDTO {
  let metadata: Record<string, unknown> | null = null;
  if (row.metadata_json) {
    try {
      metadata = JSON.parse(row.metadata_json) as Record<string, unknown>;
    } catch {
      metadata = null;
    }
  }
  return {
    id: row.id,
    actor: row.actor_admin_id
      ? { id: row.actor_admin_id, displayName: row.actor_display_name ?? 'Administrator' }
      : null,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata,
    createdAt: row.created_at,
  };
}

function countByStatus(db: Db, scope: Scope): Record<ApplicationStatus, number> {
  const counts: Record<ApplicationStatus, number> = {
    pending: 0,
    reviewing: 0,
    shortlisted: 0,
    accepted: 0,
    rejected: 0,
  };
  const scopeClause = scope.kind === 'assigned' ? 'WHERE assigned_reviewer_id = ?' : '';
  const rows = db
    .prepare(`SELECT status, COUNT(*) AS count FROM applications ${scopeClause} GROUP BY status`)
    .all(...(scope.kind === 'assigned' ? [scope.adminId] : [])) as {
    status: ApplicationStatus;
    count: number;
  }[];
  for (const row of rows) counts[row.status] = row.count;
  return counts;
}

export function getDashboard(db: Db, admin: AdministratorRow, scope: Scope): DashboardDTO {
  const counts = countByStatus(db, scope);
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);

  const assignedToMe = (
    db
      .prepare('SELECT COUNT(*) AS count FROM applications WHERE assigned_reviewer_id = ?')
      .get(admin.id) as { count: number }
  ).count;

  const departmentScope = scope.kind === 'assigned' ? 'AND a.assigned_reviewer_id = ?' : '';
  const byDepartment = db
    .prepare(
      `SELECT d.name, d.slug, COUNT(a.id) AS count
         FROM departments d
         LEFT JOIN applications a ON a.primary_department_id = d.id ${departmentScope}
        WHERE d.is_active = 1
        GROUP BY d.id
        ORDER BY d.display_order ASC, d.name ASC`,
    )
    .all(...(scope.kind === 'assigned' ? [scope.adminId] : [])) as {
    name: string;
    slug: string;
    count: number;
  }[];

  const yearScope = scope.kind === 'assigned' ? 'WHERE a.assigned_reviewer_id = ?' : '';
  const byAcademicYear = db
    .prepare(
      `SELECT ap.academic_year AS academicYear, COUNT(*) AS count
         FROM applications a JOIN applicants ap ON ap.id = a.applicant_id
         ${yearScope}
        GROUP BY ap.academic_year
        ORDER BY count DESC`,
    )
    .all(...(scope.kind === 'assigned' ? [scope.adminId] : [])) as {
    academicYear: string;
    count: number;
  }[];

  const since = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const timeScope = scope.kind === 'assigned' ? 'AND assigned_reviewer_id = ?' : '';
  const rawTime = db
    .prepare(
      `SELECT substr(submitted_at, 1, 10) AS date, COUNT(*) AS count
         FROM applications
        WHERE submitted_at >= ? ${timeScope}
        GROUP BY date
        ORDER BY date ASC`,
    )
    .all(since, ...(scope.kind === 'assigned' ? [scope.adminId] : [])) as {
    date: string;
    count: number;
  }[];
  const timeMap = new Map(rawTime.map((row) => [row.date, row.count]));
  const overTime: { date: string; count: number }[] = [];
  for (let i = 13; i >= 0; i -= 1) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    overTime.push({ date, count: timeMap.get(date) ?? 0 });
  }

  const recent = listApplications(
    db,
    {
      page: 1,
      pageSize: 8,
      sort: 'submitted_at',
      order: 'desc',
    },
    scope,
  ).items;

  const recentActivity: AuditEntryDTO[] = hasPermission(admin.role, 'audit.view')
    ? (
        db
          .prepare(
            `SELECT l.*, a.display_name AS actor_display_name
               FROM audit_logs l LEFT JOIN administrators a ON a.id = l.actor_admin_id
              ORDER BY l.created_at DESC, l.id DESC LIMIT 10`,
          )
          .all() as AuditRow[]
      ).map(mapAuditRow)
    : [];

  const state = resolveRecruitmentState(db);
  const cycle: CycleRow | null = state.cycle;

  return {
    counts: { ...counts, total, assignedToMe },
    byDepartment,
    byAcademicYear,
    overTime,
    recent,
    recentActivity,
    recruitment: {
      open: state.open,
      title: state.settings.recruitment.title,
      deadline: state.effectiveClose,
      cycleName: cycle?.name ?? 'No active cycle',
      cycleId: cycle?.id ?? null,
    },
    reviewers: listReviewers(db),
    generatedAt: nowIso(),
  };
}

export interface ExportRow {
  reference: string;
  full_name: string;
  email: string;
  phone: string;
  university: string;
  faculty: string;
  academic_department: string;
  academic_year: string;
  primary_department: string;
  secondary_department: string;
  status: ApplicationStatus;
  submitted_at: string;
  reviewer: string;
}

/** Streams rows (no document data, no national ID numbers are collected). */
export function* iterateExportRows(
  db: Db,
  query: ApplicationListQuery,
  scope: Scope,
): Generator<ExportRow> {
  const { clause, params } = buildWhere(query, scope);
  const statement = db.prepare(
    `SELECT a.public_reference AS reference, ap.full_name, ap.email, ap.phone, ap.university,
            ap.faculty, ap.academic_department, ap.academic_year,
            pd.name AS primary_department, COALESCE(sd.name, '') AS secondary_department,
            a.status, a.submitted_at, COALESCE(rv.display_name, '') AS reviewer
       FROM applications a
       JOIN applicants ap ON ap.id = a.applicant_id
       JOIN departments pd ON pd.id = a.primary_department_id
       LEFT JOIN departments sd ON sd.id = a.secondary_department_id
       LEFT JOIN administrators rv ON rv.id = a.assigned_reviewer_id
       ${clause}
      ORDER BY a.submitted_at DESC, a.id DESC`,
  );
  yield* statement.iterate(...params) as Iterable<ExportRow>;
}

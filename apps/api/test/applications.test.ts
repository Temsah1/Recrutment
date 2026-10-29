import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  PDF_BYTES,
  PNG_BYTES,
  RECRUITMENT_ADMIN,
  REVIEWER,
  createTestContext,
  loginAs,
  submitApplication,
  type TestContext,
} from './helpers.js';

let ctx: TestContext;

beforeEach(async () => {
  ctx = await createTestContext();
});

afterEach(async () => {
  await ctx.cleanup();
});

function latestApplication(): { id: number; reference: string; status: string } {
  return ctx.db
    .prepare('SELECT id, public_reference AS reference, status FROM applications ORDER BY id DESC LIMIT 1')
    .get() as { id: number; reference: string; status: string };
}

describe('public API', () => {
  it('reports health and the open recruitment configuration', async () => {
    const health = await ctx.app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ status: 'ok', database: 'ok', storage: 'ok' });

    const config = await ctx.app.inject({ method: 'GET', url: '/api/v1/public/config' });
    expect(config.statusCode).toBe(200);
    const body = config.json();
    expect(body.recruitment.open).toBe(true);
    expect(body.departments.length).toBeGreaterThanOrEqual(5);
    expect(body.privacy.version).toBeTruthy();
    expect(body.documents.nationalId.allowedTypes).toEqual(['application/pdf']);
    expect(body.form.academicYears).toContain('Third year');
  });

  it('stores a valid submission, documents and consent in one transaction', async () => {
    const response = await submitApplication(ctx.app, { email: 'layla@example.com' });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.replayed).toBe(false);
    expect(body.reference).toMatch(/^ESME-\d{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(body.submittedAt).toBeTruthy();

    const row = ctx.db
      .prepare(
        `SELECT a.id, a.contact_email, a.status, a.consent_policy_version,
                (SELECT COUNT(*) FROM application_status_history h WHERE h.application_id = a.id) AS history_count
           FROM applications a WHERE a.public_reference = ?`,
      )
      .get(body.reference) as {
      id: number;
      contact_email: string;
      status: string;
      consent_policy_version: string;
      history_count: number;
    };
    expect(row.contact_email).toBe('layla@example.com');
    expect(row.status).toBe('pending');
    expect(row.consent_policy_version).toBeTruthy();
    expect(row.history_count).toBe(1);

    const documents = ctx.db
      .prepare('SELECT document_type, storage_name, detected_content_type, file_size FROM application_documents WHERE application_id = ?')
      .all(row.id) as { document_type: string; storage_name: string; detected_content_type: string; file_size: number }[];
    expect(documents).toHaveLength(2);
    expect(documents.map((d) => d.document_type).sort()).toEqual(['national_id', 'university_id']);
    expect(documents.find((d) => d.document_type === 'national_id')?.detected_content_type).toBe('application/pdf');
    expect(documents.find((d) => d.document_type === 'university_id')?.detected_content_type).toBe('image/png');
    for (const document of documents) {
      expect(document.storage_name).not.toMatch(/\.\.|^[A-Za-z]:|^\//);
      const absolute = ctx.config.uploadsDir + '/' + document.storage_name;
      expect(fs.existsSync(absolute)).toBe(true);
    }

    const audit = ctx.db
      .prepare("SELECT metadata_json FROM audit_logs WHERE action = 'application.submitted'")
      .get() as { metadata_json: string } | undefined;
    expect(audit).toBeDefined();
    expect(JSON.parse(audit!.metadata_json).documents.sort()).toEqual(['national_id', 'university_id']);
  });

  it('rejects a duplicate email in the same cycle, case-insensitively', async () => {
    const first = await submitApplication(ctx.app, { email: 'duplicate@example.com' });
    expect(first.statusCode).toBe(201);

    const second = await submitApplication(ctx.app, { email: 'Duplicate@Example.com' });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('duplicate_application');

    const count = ctx.db.prepare('SELECT COUNT(*) AS count FROM applications').get() as { count: number };
    expect(count.count).toBe(1);
  });

  it('replays an idempotent submission without creating duplicates', async () => {
    const key = randomUUID();
    const first = await submitApplication(ctx.app, { email: 'first@example.com', idempotencyKey: key });
    expect(first.statusCode).toBe(201);
    const reference = first.json().reference;

    const replay = await submitApplication(ctx.app, { email: 'second@example.com', idempotencyKey: key });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toMatchObject({ reference, replayed: true });

    const counts = ctx.db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM applications) AS applications,
                (SELECT COUNT(*) FROM applicants) AS applicants,
                (SELECT COUNT(*) FROM application_documents) AS documents`,
      )
      .get() as { applications: number; applicants: number; documents: number };
    expect(counts).toEqual({ applications: 1, applicants: 1, documents: 2 });
  });

  it('rejects missing, spoofed and disallowed documents', async () => {
    const missing = await submitApplication(ctx.app, {}, []);
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.details.map((d: { path: string }) => d.path)).toContain('national_id');

    const pngAsNationalId = await submitApplication(ctx.app, {}, [
      { field: 'national_id', filename: 'id.png', contentType: 'image/png', data: PNG_BYTES },
    ]);
    expect(pngAsNationalId.statusCode).toBe(415);

    const pdfAsUniversityId = await submitApplication(ctx.app, {}, [
      { field: 'university_id', filename: 'id.pdf', contentType: 'application/pdf', data: PDF_BYTES },
    ]);
    expect(pdfAsUniversityId.statusCode).toBe(415);

    const spoofed = await submitApplication(ctx.app, {}, [
      {
        field: 'national_id',
        filename: 'national-id.pdf',
        contentType: 'application/pdf',
        data: Buffer.from('This is plain text pretending to be a PDF document.'),
      },
    ]);
    expect(spoofed.statusCode).toBe(415);

    const count = ctx.db.prepare('SELECT COUNT(*) AS count FROM applications').get() as { count: number };
    expect(count.count).toBe(0);
  });

  it('rejects submissions when recruitment is closed or not open yet', async () => {
    ctx.db.prepare("UPDATE recruitment_cycles SET status = 'closed' WHERE is_current = 1").run();
    const closed = await submitApplication(ctx.app);
    expect(closed.statusCode).toBe(409);
    expect(closed.json().error.code).toBe('recruitment_closed');
    expect(closed.json().error.message).toMatch(/currently closed/i);

    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    ctx.db
      .prepare("UPDATE recruitment_cycles SET status = 'open', opens_at = ?, closes_at = NULL WHERE is_current = 1")
      .run(future);
    const notYet = await submitApplication(ctx.app);
    expect(notYet.statusCode).toBe(409);
    expect(notYet.json().error.message).toMatch(/not opened yet/i);
  });

  it('rejects malformed payloads and unsafe state-changing origins', async () => {
    const invalid = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/public/applications',
      headers: { 'content-type': 'multipart/form-data; boundary=x' },
      payload: Buffer.from('--x--\r\n'),
    });
    expect(invalid.statusCode).toBe(400);

    const crossOrigin = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/public/applications',
      headers: { origin: 'https://evil.example', 'content-type': 'multipart/form-data; boundary=x' },
      payload: Buffer.from('--x--\r\n'),
    });
    expect(crossOrigin.statusCode).toBe(403);
  });
});

describe('application review workflow', () => {
  async function seedSubmission(email = 'review@example.com'): Promise<{ id: number; reference: string }> {
    const response = await submitApplication(ctx.app, { email });
    expect(response.statusCode).toBe(201);
    return latestApplication();
  }

  it('scopes reviewers to assigned applications and protects notes and documents', async () => {
    const assigned = await seedSubmission('assigned@example.com');
    const unassigned = await seedSubmission('unassigned@example.com');
    const recruiter = await loginAs(ctx.app, RECRUITMENT_ADMIN.email, RECRUITMENT_ADMIN.password);
    const reviewer = await loginAs(ctx.app, REVIEWER.email, REVIEWER.password);

    const all = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/admin/applications',
      headers: { cookie: recruiter.cookie },
    });
    expect(all.statusCode).toBe(200);
    expect(all.json().total).toBe(2);

    const before = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/admin/applications',
      headers: { cookie: reviewer.cookie },
    });
    expect(before.statusCode).toBe(200);
    expect(before.json().total).toBe(0);

    const forbiddenDetail = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/admin/applications/${assigned.id}`,
      headers: { cookie: reviewer.cookie },
    });
    expect(forbiddenDetail.statusCode).toBe(403);

    const unauthorizedNote = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/admin/applications/${unassigned.id}/notes`,
      headers: { cookie: reviewer.cookie, 'x-esme-csrf': reviewer.csrfToken },
      payload: { body: 'Should not be allowed' },
    });
    expect(unauthorizedNote.statusCode).toBe(403);

    const assign = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/applications/${assigned.id}/assignee`,
      headers: { cookie: recruiter.cookie, 'x-esme-csrf': recruiter.csrfToken },
      payload: { reviewerId: ctx.adminIds.reviewer },
    });
    expect(assign.statusCode).toBe(200);
    expect(assign.json().assignedReviewer).toMatchObject({ id: ctx.adminIds.reviewer });

    const after = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/admin/applications',
      headers: { cookie: reviewer.cookie },
    });
    expect(after.json().total).toBe(1);
    expect(after.json().items[0].id).toBe(assigned.id);

    const detail = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/admin/applications/${assigned.id}`,
      headers: { cookie: reviewer.cookie },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().documents).toHaveLength(2);
    expect(detail.json().consent.acceptedAt).toBeTruthy();

    const note = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/admin/applications/${assigned.id}/notes`,
      headers: { cookie: reviewer.cookie, 'x-esme-csrf': reviewer.csrfToken },
      payload: { body: 'Strong portfolio and clear motivation.' },
    });
    expect(note.statusCode).toBe(201);
    expect(note.json().body).toBe('Strong portfolio and clear motivation.');

    const withNote = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/admin/applications/${assigned.id}`,
      headers: { cookie: reviewer.cookie },
    });
    expect(withNote.json().notes).toHaveLength(1);

    const documentId = withNote.json().documents.find((d: { type: string }) => d.type === 'national_id').id;
    const reviewerDownload = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/admin/documents/${documentId}/download`,
      headers: { cookie: reviewer.cookie },
    });
    expect(reviewerDownload.statusCode).toBe(403);

    const recruiterDownload = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/admin/documents/${documentId}/download`,
      headers: { cookie: recruiter.cookie },
    });
    expect(recruiterDownload.statusCode).toBe(200);
    expect(recruiterDownload.headers['content-type']).toContain('application/pdf');
    expect(recruiterDownload.headers['content-disposition']).toContain('attachment');
    expect(recruiterDownload.headers['cache-control']).toBe('no-store');
    expect(recruiterDownload.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');

    const accessAudit = ctx.db
      .prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'document.accessed'")
      .get() as { count: number };
    expect(accessAudit.count).toBe(1);

    const missingDocument = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/admin/documents/999999/download',
      headers: { cookie: recruiter.cookie },
    });
    expect(missingDocument.statusCode).toBe(404);
  });

  it('validates status transitions, optimistic concurrency and CSRF', async () => {
    const application = await seedSubmission('status@example.com');
    const recruiter = await loginAs(ctx.app, RECRUITMENT_ADMIN.email, RECRUITMENT_ADMIN.password);
    const headers = { cookie: recruiter.cookie, 'x-esme-csrf': recruiter.csrfToken };

    const invalid = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/applications/${application.id}/status`,
      headers,
      payload: { status: 'accepted' },
    });
    expect(invalid.statusCode).toBe(400);

    const noCsrf = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/applications/${application.id}/status`,
      headers: { cookie: recruiter.cookie },
      payload: { status: 'reviewing', expectedVersion: 1 },
    });
    expect(noCsrf.statusCode).toBe(403);

    const first = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/applications/${application.id}/status`,
      headers,
      payload: { status: 'reviewing', expectedVersion: 1, reason: 'Starting review' },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ status: 'reviewing', version: 2 });

    const stale = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/applications/${application.id}/status`,
      headers,
      payload: { status: 'shortlisted', expectedVersion: 1 },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('conflict');

    const second = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/applications/${application.id}/status`,
      headers,
      payload: { status: 'shortlisted', expectedVersion: 2 },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({ status: 'shortlisted', version: 3 });
    expect(second.json().history.map((h: { newStatus: string }) => h.newStatus)).toEqual([
      'pending',
      'reviewing',
      'shortlisted',
    ]);

    const audit = ctx.db
      .prepare("SELECT metadata_json FROM audit_logs WHERE action = 'application.status_changed' ORDER BY id")
      .all() as { metadata_json: string }[];
    expect(audit).toHaveLength(2);
    expect(JSON.parse(audit[0]!.metadata_json)).toMatchObject({ from: 'pending', to: 'reviewing' });
  });

  it('rejects invalid assignees and supports unassigning', async () => {
    const application = await seedSubmission('assign@example.com');
    const recruiter = await loginAs(ctx.app, RECRUITMENT_ADMIN.email, RECRUITMENT_ADMIN.password);
    const headers = { cookie: recruiter.cookie, 'x-esme-csrf': recruiter.csrfToken };

    const invalid = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/applications/${application.id}/assignee`,
      headers,
      payload: { reviewerId: 99999 },
    });
    expect(invalid.statusCode).toBe(400);

    const assign = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/applications/${application.id}/assignee`,
      headers,
      payload: { reviewerId: ctx.adminIds.reviewer },
    });
    expect(assign.statusCode).toBe(200);

    const unassign = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/applications/${application.id}/assignee`,
      headers,
      payload: { reviewerId: null },
    });
    expect(unassign.statusCode).toBe(200);
    expect(unassign.json().assignedReviewer).toBeNull();
  });

  it('exports CSV with a BOM, headers and audit trail', async () => {
    const application = await seedSubmission('export@example.com');
    const recruiter = await loginAs(ctx.app, RECRUITMENT_ADMIN.email, RECRUITMENT_ADMIN.password);

    const exportResponse = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/admin/exports/applications.csv',
      headers: { cookie: recruiter.cookie },
    });
    expect(exportResponse.statusCode).toBe(200);
    expect(exportResponse.headers['content-type']).toContain('text/csv');
    expect(exportResponse.headers['content-disposition']).toContain('attachment');
    expect(exportResponse.body.charCodeAt(0)).toBe(0xfeff);
    expect(exportResponse.body).toContain('Application reference');
    expect(exportResponse.body).toContain(application.reference);
    expect(exportResponse.body).toContain('Layla Hassan');
    expect(exportResponse.body).toContain("'+20 100 123 4567");

    const audit = ctx.db
      .prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'export.created'")
      .get() as { count: number };
    expect(audit.count).toBe(1);
  });

  it('reports real dashboard aggregates', async () => {
    await seedSubmission('one@example.com');
    const application = await seedSubmission('two@example.com');
    const recruiter = await loginAs(ctx.app, RECRUITMENT_ADMIN.email, RECRUITMENT_ADMIN.password);
    await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/applications/${application.id}/status`,
      headers: { cookie: recruiter.cookie, 'x-esme-csrf': recruiter.csrfToken },
      payload: { status: 'reviewing' },
    });

    const dashboard = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/admin/dashboard',
      headers: { cookie: recruiter.cookie },
    });
    expect(dashboard.statusCode).toBe(200);
    const body = dashboard.json();
    expect(body.counts.total).toBe(2);
    expect(body.counts.reviewing).toBe(1);
  });
});

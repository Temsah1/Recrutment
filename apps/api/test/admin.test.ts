import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  RECRUITMENT_ADMIN,
  SUPER_ADMIN,
  createTestContext,
  insertAdmin,
  loginAs,
  submitApplication,
  type Session,
  type TestContext,
} from './helpers.js';

let ctx: TestContext;
let superSession: Session;
let recruiterSession: Session;

function headers(session: Session, csrf = true): Record<string, string> {
  return {
    cookie: session.cookie,
    ...(csrf ? { 'x-esme-csrf': session.csrfToken } : {}),
  };
}

beforeEach(async () => {
  ctx = await createTestContext();
  superSession = await loginAs(ctx.app, SUPER_ADMIN.email, SUPER_ADMIN.password);
  recruiterSession = await loginAs(ctx.app, RECRUITMENT_ADMIN.email, RECRUITMENT_ADMIN.password);
});

afterEach(async () => {
  await ctx.cleanup();
});

describe('settings and recruitment configuration', () => {
  it('updates settings with validation and audits the change', async () => {
    const current = (
      await ctx.app.inject({
        method: 'GET',
        url: '/api/v1/admin/settings',
        headers: headers(superSession, false),
      })
    ).json().settings;

    const update = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/settings',
      headers: headers(superSession),
      payload: { recruitment: { ...current.recruitment, title: 'Spring 2027 Recruitment' } },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().settings.recruitment.title).toBe('Spring 2027 Recruitment');

    const read = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/admin/settings',
      headers: headers(superSession, false),
    });
    expect(read.json().settings.recruitment.title).toBe('Spring 2027 Recruitment');

    const audit = ctx.db
      .prepare("SELECT metadata_json FROM audit_logs WHERE action = 'settings.updated' ORDER BY id DESC LIMIT 1")
      .get() as { metadata_json: string };
    expect(JSON.parse(audit.metadata_json).sections).toContain('recruitment');

    const invalid = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/settings',
      headers: headers(superSession),
      payload: {
        recruitment: { ...current.recruitment, timezone: 'Mars/Olympus' },
      },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe('validation_error');
  });

  it('lets only Super Admins change retention settings', async () => {
    const byRecruiter = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/settings',
      headers: headers(recruiterSession),
      payload: { retention: { enabled: true, days: 365 } },
    });
    expect(byRecruiter.statusCode).toBe(403);

    const bySuper = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/settings',
      headers: headers(superSession),
      payload: { retention: { enabled: true, days: 365 } },
    });
    expect(bySuper.statusCode).toBe(200);
    expect(bySuper.json().settings.retention).toEqual({ enabled: true, days: 365 });
  });

  it('manages departments and reflects active ones publicly', async () => {
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/admin/departments',
      headers: headers(superSession),
      payload: { name: 'Design', slug: 'design', description: 'Visual and product design.' },
    });
    expect(created.statusCode).toBe(201);
    const department = created.json().department;

    let publicConfig = await ctx.app.inject({ method: 'GET', url: '/api/v1/public/config' });
    expect(publicConfig.json().departments.map((d: { slug: string }) => d.slug)).toContain('design');

    const byRecruiter = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/admin/departments',
      headers: headers(recruiterSession),
      payload: { name: 'Unauthorized', slug: 'unauthorized' },
    });
    expect(byRecruiter.statusCode).toBe(403);

    const deactivated = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/departments/${department.id}`,
      headers: headers(superSession),
      payload: { isActive: false },
    });
    expect(deactivated.statusCode).toBe(200);
    publicConfig = await ctx.app.inject({ method: 'GET', url: '/api/v1/public/config' });
    expect(publicConfig.json().departments.map((d: { slug: string }) => d.slug)).not.toContain('design');
  });

  it('manages cycles and uses the active cycle to open or close recruitment', async () => {
    const original = ctx.db
      .prepare('SELECT id FROM recruitment_cycles WHERE is_current = 1')
      .get() as { id: number };

    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/admin/cycles',
      headers: headers(recruiterSession),
      payload: { name: 'Spring 2027', status: 'draft', opensAt: null, closesAt: null },
    });
    expect(created.statusCode).toBe(201);
    const cycleId = created.json().cycle.id;
    expect(created.json().cycle.applicationCount).toBe(0);

    const invalidWindow = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/admin/cycles',
      headers: headers(recruiterSession),
      payload: {
        name: 'Broken window',
        status: 'open',
        opensAt: '2027-03-01T00:00:00Z',
        closesAt: '2027-02-01T00:00:00Z',
      },
    });
    expect(invalidWindow.statusCode).toBe(400);

    const activate = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/admin/cycles/${cycleId}/activate`,
      headers: headers(recruiterSession),
      payload: {},
    });
    expect(activate.statusCode).toBe(200);

    let publicConfig = await ctx.app.inject({ method: 'GET', url: '/api/v1/public/config' });
    expect(publicConfig.json().recruitment.open).toBe(false);
    expect(publicConfig.json().recruitment.cycleId).toBe(cycleId);

    const restore = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/admin/cycles/${original.id}/activate`,
      headers: headers(recruiterSession),
      payload: {},
    });
    expect(restore.statusCode).toBe(200);
    publicConfig = await ctx.app.inject({ method: 'GET', url: '/api/v1/public/config' });
    expect(publicConfig.json().recruitment.open).toBe(true);
  });
});

describe('administrator management', () => {
  it('creates, updates, deactivates and resets administrators with audit entries', async () => {
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/admin/administrators',
      headers: headers(superSession),
      payload: {
        email: 'new.reviewer@esme.test',
        displayName: 'New Reviewer',
        role: 'reviewer',
        password: 'NewReviewer#2026!',
      },
    });
    expect(created.statusCode).toBe(201);
    const newId = created.json().administrator.id;

    const duplicate = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/admin/administrators',
      headers: headers(superSession),
      payload: {
        email: 'new.reviewer@esme.test',
        displayName: 'Duplicate',
        role: 'reviewer',
        password: 'NewReviewer#2026!',
      },
    });
    expect(duplicate.statusCode).toBe(409);

    const list = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/admin/administrators',
      headers: headers(superSession, false),
    });
    expect(list.json().items).toHaveLength(4);

    const noteSelf = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/administrators/${ctx.adminIds.super}`,
      headers: headers(superSession),
      payload: { isActive: false },
    });
    expect(noteSelf.statusCode).toBe(400);

    const reset = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/admin/administrators/${newId}/password-reset`,
      headers: headers(superSession),
      payload: { newPassword: 'Rotated#Password2026' },
    });
    expect(reset.statusCode).toBe(204);

    const oldLogin = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'new.reviewer@esme.test', password: 'NewReviewer#2026!' },
    });
    expect(oldLogin.statusCode).toBe(401);

    const newLogin = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'new.reviewer@esme.test', password: 'Rotated#Password2026' },
    });
    expect(newLogin.statusCode).toBe(200);
    const newSession = await loginAs(ctx.app, 'new.reviewer@esme.test', 'Rotated#Password2026');

    const deactivated = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/administrators/${newId}`,
      headers: headers(superSession),
      payload: { isActive: false },
    });
    expect(deactivated.statusCode).toBe(200);

    const revoked = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: newSession.cookie },
    });
    expect(revoked.statusCode).toBe(401);

    const disabledLogin = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'new.reviewer@esme.test', password: 'Rotated#Password2026' },
    });
    expect(disabledLogin.statusCode).toBe(403);

    const audit = ctx.db
      .prepare("SELECT action FROM audit_logs WHERE entity_type = 'administrator' ORDER BY id")
      .all() as { action: string }[];
    const actions = audit.map((row) => row.action);
    for (const expected of [
      'administrator.created',
      'administrator.password_reset',
      'administrator.updated',
    ]) {
      expect(actions).toContain(expected);
    }
  });

  it('prevents self-demotion and self-deactivation of the active Super Admin', async () => {
    const secondSuperId = await insertAdmin(
      ctx.db,
      { email: 'second.super@esme.test', password: 'SecondSuper#2026!', displayName: 'Second Super' },
      'super_admin',
    );
    const second = await loginAs(ctx.app, 'second.super@esme.test', 'SecondSuper#2026!');

    const demote = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/administrators/${ctx.adminIds.super}`,
      headers: headers(second),
      payload: { role: 'reviewer' },
    });
    expect(demote.statusCode).toBe(200);

    const selfDemote = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/administrators/${secondSuperId}`,
      headers: headers(second),
      payload: { role: 'reviewer' },
    });
    expect(selfDemote.statusCode).toBe(400);

    const selfDeactivate = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/administrators/${secondSuperId}`,
      headers: headers(second),
      payload: { isActive: false },
    });
    expect(selfDeactivate.statusCode).toBe(400);
  });

  it('lists and filters the append-only audit log', async () => {
    await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/settings',
      headers: headers(superSession),
      payload: { recruitment: { title: 'Audited Title' } },
    });

    const all = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/admin/audit-logs',
      headers: headers(superSession, false),
    });
    expect(all.statusCode).toBe(200);
    expect(all.json().total).toBeGreaterThan(0);

    const filtered = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/admin/audit-logs?action=settings.updated',
      headers: headers(superSession, false),
    });
    expect(filtered.statusCode).toBe(200);
    expect(filtered.json().items.every((item: { action: string }) => item.action === 'settings.updated')).toBe(true);

    expect(() =>
      ctx.db.prepare("UPDATE audit_logs SET action = 'tampered' WHERE id = 1").run(),
    ).toThrow(/append-only/i);
    expect(() => ctx.db.prepare('DELETE FROM audit_logs WHERE id = 1').run()).toThrow(/append-only/i);
  });
});

describe('retention and system operations', () => {
  async function seedDecidedApplication(): Promise<{ id: number; storageNames: string[] }> {
    const response = await submitApplication(ctx.app, { email: 'retention@example.com' });
    expect(response.statusCode).toBe(201);
    const row = ctx.db
      .prepare('SELECT id FROM applications ORDER BY id DESC LIMIT 1')
      .get() as { id: number };
    ctx.db
      .prepare("UPDATE applications SET status = 'accepted', submitted_at = '2024-01-01T00:00:00.000Z' WHERE id = ?")
      .run(row.id);
    const documents = ctx.db
      .prepare('SELECT storage_name FROM application_documents WHERE application_id = ?')
      .all(row.id) as { storage_name: string }[];
    return { id: row.id, storageNames: documents.map((d) => d.storage_name) };
  }

  it('previews and deletes only old decided applications after confirmation', async () => {
    const seeded = await seedDecidedApplication();
    const pendingResponse = await submitApplication(ctx.app, { email: 'pending@example.com' });
    expect(pendingResponse.statusCode).toBe(201);

    const disabled = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/admin/system/retention/cleanup',
      headers: headers(superSession),
      payload: { confirm: 'DELETE' },
    });
    expect(disabled.statusCode).toBe(400);

    await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/settings',
      headers: headers(superSession),
      payload: { retention: { enabled: true, days: 365 } },
    });

    const preview = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/admin/system/retention/preview',
      headers: headers(superSession),
      payload: {},
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({
      enabled: true,
      days: 365,
      eligibleApplications: 1,
      documentCount: 2,
      applicantCount: 1,
      totalApplications: 1,
    });
    expect(preview.json().applications[0].reference).toBeTruthy();

    const wrongConfirmation = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/admin/system/retention/cleanup',
      headers: headers(superSession),
      payload: { confirm: 'delete' },
    });
    expect(wrongConfirmation.statusCode).toBe(400);

    const cleanup = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/admin/system/retention/cleanup',
      headers: headers(superSession),
      payload: { confirm: 'DELETE' },
    });
    expect(cleanup.statusCode).toBe(200);
    expect(cleanup.json()).toMatchObject({
      deletedApplications: 1,
      deletedDocuments: 2,
      deletedApplicants: 1,
      deletedFiles: 2,
    });

    for (const name of seeded.storageNames) {
      expect(fs.existsSync(path.join(ctx.config.uploadsDir, name))).toBe(false);
    }
    expect(
      (ctx.db.prepare('SELECT COUNT(*) AS count FROM applications').get() as { count: number }).count,
    ).toBe(1);
    expect(
      (ctx.db.prepare('SELECT COUNT(*) AS count FROM applicants').get() as { count: number }).count,
    ).toBe(1);

    const audit = ctx.db
      .prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'retention.cleanup'")
      .get() as { count: number };
    expect(audit.count).toBe(1);

    const after = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/admin/system/retention/preview',
      headers: headers(superSession),
      payload: {},
    });
    expect(after.json().eligibleApplications).toBe(0);
  });

  it('creates a consistent backup and reports diagnostics', async () => {
    const submitted = await submitApplication(ctx.app, { email: 'backup@example.com' });
    expect(submitted.statusCode).toBe(201);

    const backup = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/admin/backups',
      headers: headers(superSession),
      payload: {},
    });
    expect(backup.statusCode).toBe(200);
    expect(backup.json().integrity).toBe('ok');
    expect(backup.json().documentRows).toBe(2);
    expect(backup.json().uploadFiles).toBe(2);

    const directories = fs.readdirSync(ctx.config.backupDir);
    expect(directories).toHaveLength(1);
    const backupDir = path.join(ctx.config.backupDir, directories[0]!);
    const manifest = JSON.parse(fs.readFileSync(path.join(backupDir, 'manifest.json'), 'utf8'));
    expect(manifest.database.integrity).toBe('ok');
    expect(manifest.database.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.migrations).toContain('001_init');
    expect(fs.existsSync(path.join(backupDir, 'database.sqlite'))).toBe(true);
    expect(fs.statSync(path.join(backupDir, 'uploads')).isDirectory()).toBe(true);

    const diagnostics = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/admin/system',
      headers: headers(superSession, false),
    });
    expect(diagnostics.statusCode).toBe(200);
    expect(diagnostics.json().database.ok).toBe(true);
    expect(diagnostics.json().storage.writable).toBe(true);
    expect(diagnostics.json().reconciliation.missingFiles).toEqual([]);
    expect(diagnostics.json().counts.applications).toBe(1);
    expect(diagnostics.json().migrations.map((m: { version: string }) => m.version)).toContain('001_init');

    const audit = ctx.db
      .prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'backup.created'")
      .get() as { count: number };
    expect(audit.count).toBe(1);
  });

  it('does not expose system routes without authentication', async () => {
    for (const url of ['/api/v1/admin/system', '/api/v1/admin/applications', '/api/v1/admin/audit-logs']) {
      const response = await ctx.app.inject({ method: 'GET', url });
      expect(response.statusCode, url).toBe(401);
    }
  });
});

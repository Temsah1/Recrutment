import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  RECRUITMENT_ADMIN,
  REVIEWER,
  SUPER_ADMIN,
  createTestContext,
  loginAs,
  type TestContext,
} from './helpers.js';

let ctx: TestContext;

beforeEach(async () => {
  ctx = await createTestContext();
});

afterEach(async () => {
  await ctx.cleanup();
});

describe('admin authentication', () => {
  it('rejects an unknown account and records a failed attempt', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'nobody@esme.test', password: 'whatever-password' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('invalid_credentials');

    const failed = ctx.db
      .prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'auth.login_failed'")
      .get() as { count: number };
    expect(failed.count).toBe(1);
  });

  it('issues an HttpOnly session cookie and stores only a hash of the token', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: SUPER_ADMIN.email, password: SUPER_ADMIN.password },
    });
    expect(response.statusCode).toBe(200);
    const setCookie = response.headers['set-cookie'];
    const raw = Array.isArray(setCookie) ? setCookie.join(';') : String(setCookie);
    expect(raw).toContain('HttpOnly');
    expect(raw).toContain('SameSite=Lax');
    const token = /esme_session=([^;]+)/.exec(raw)?.[1] ?? '';
    expect(token.length).toBeGreaterThan(20);

    const sessions = ctx.db.prepare('SELECT id FROM admin_sessions').all() as { id: string }[];
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.id).not.toBe(token);
    expect(sessions[0]!.id).toMatch(/^[a-f0-9]{64}$/);

    const me = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: `esme_session=${token}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().administrator.email).toBe(SUPER_ADMIN.email);
    expect(me.json().csrfToken).toHaveLength(32);
  });

  it('rejects unauthenticated and expired sessions', async () => {
    const anonymous = await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me' });
    expect(anonymous.statusCode).toBe(401);

    const session = await loginAs(ctx.app, RECRUITMENT_ADMIN.email, RECRUITMENT_ADMIN.password);
    ctx.db.prepare('UPDATE admin_sessions SET expires_at = ?').run('2020-01-01T00:00:00.000Z');
    const expired = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: session.cookie },
    });
    expect(expired.statusCode).toBe(401);
    const remaining = ctx.db.prepare('SELECT COUNT(*) AS count FROM admin_sessions').get() as {
      count: number;
    };
    expect(remaining.count).toBe(0);
  });

  it('requires a matching CSRF token for state-changing requests', async () => {
    const session = await loginAs(ctx.app, SUPER_ADMIN.email, SUPER_ADMIN.password);

    const noCsrf = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { cookie: session.cookie },
    });
    expect(noCsrf.statusCode).toBe(403);
    expect(noCsrf.json().error.code).toBe('forbidden');

    const wrongCsrf = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { cookie: session.cookie, 'x-esme-csrf': 'not-the-token' },
    });
    expect(wrongCsrf.statusCode).toBe(403);

    const ok = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { cookie: session.cookie, 'x-esme-csrf': session.csrfToken },
    });
    expect(ok.statusCode).toBe(204);

    const after = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: session.cookie },
    });
    expect(after.statusCode).toBe(401);
  });

  it('locks an account after five consecutive failures', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: REVIEWER.email, password: 'wrong-password' },
      });
      expect(response.statusCode).toBe(401);
    }

    const locked = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: REVIEWER.email, password: REVIEWER.password },
    });
    expect(locked.statusCode).toBe(423);
    expect(locked.json().error.code).toBe('account_locked');
  });

  it('rejects state-changing cross-origin browser requests', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: 'https://evil.example' },
      payload: { email: SUPER_ADMIN.email, password: SUPER_ADMIN.password },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('forbidden');
  });

  it('rotates the session and revokes the others when changing a password', async () => {
    const session = await loginAs(ctx.app, RECRUITMENT_ADMIN.email, RECRUITMENT_ADMIN.password);
    const second = await loginAs(ctx.app, RECRUITMENT_ADMIN.email, RECRUITMENT_ADMIN.password);
    expect(second.cookie).not.toBe(session.cookie);

    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/change-password',
      headers: { cookie: session.cookie, 'x-esme-csrf': session.csrfToken },
      payload: { currentPassword: RECRUITMENT_ADMIN.password, newPassword: 'BrandNew#2026!pass' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().csrfToken).toBeTruthy();

    const oldSession = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: second.cookie },
    });
    expect(oldSession.statusCode).toBe(401);

    const oldPassword = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: RECRUITMENT_ADMIN.email, password: RECRUITMENT_ADMIN.password },
    });
    expect(oldPassword.statusCode).toBe(401);

    const newPassword = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: RECRUITMENT_ADMIN.email, password: 'BrandNew#2026!pass' },
    });
    expect(newPassword.statusCode).toBe(200);
  });
});

describe('RBAC enforcement on admin endpoints', () => {
  it('blocks reviewers from privileged operations', async () => {
    const reviewer = await loginAs(ctx.app, REVIEWER.email, REVIEWER.password);
    const headers = { cookie: reviewer.cookie, 'x-esme-csrf': reviewer.csrfToken };

    for (const [method, url] of [
      ['GET', '/api/v1/admin/settings'],
      ['GET', '/api/v1/admin/administrators'],
      ['GET', '/api/v1/admin/audit-logs'],
      ['GET', '/api/v1/admin/system'],
      ['GET', '/api/v1/admin/exports/applications.csv'],
      ['GET', '/api/v1/admin/cycles'],
    ] as const) {
      const response = await ctx.app.inject({ method, url, headers });
      expect(response.statusCode, `${method} ${url}`).toBe(403);
    }

    const status = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/applications/1/status',
      headers,
      payload: { status: 'reviewing' },
    });
    expect(status.statusCode).toBe(403);
  });

  it('allows recruitment admins to operate applications but not security settings', async () => {
    const recruiter = await loginAs(ctx.app, RECRUITMENT_ADMIN.email, RECRUITMENT_ADMIN.password);
    const headers = { cookie: recruiter.cookie, 'x-esme-csrf': recruiter.csrfToken };

    const dashboard = await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/dashboard', headers });
    expect(dashboard.statusCode).toBe(200);

    const settings = await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/settings', headers });
    expect(settings.statusCode).toBe(403);

    const admins = await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/administrators', headers });
    expect(admins.statusCode).toBe(403);

    const backups = await ctx.app.inject({ method: 'POST', url: '/api/v1/admin/backups', headers, payload: {} });
    expect(backups.statusCode).toBe(403);

    const cycles = await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/cycles', headers });
    expect(cycles.statusCode).toBe(200);
  });

  it('grants the Super Admin full access', async () => {
    const superAdmin = await loginAs(ctx.app, SUPER_ADMIN.email, SUPER_ADMIN.password);
    const headers = { cookie: superAdmin.cookie };
    for (const url of [
      '/api/v1/admin/settings',
      '/api/v1/admin/administrators',
      '/api/v1/admin/audit-logs',
      '/api/v1/admin/system',
      '/api/v1/admin/cycles',
    ]) {
      const response = await ctx.app.inject({ method: 'GET', url, headers });
      expect(response.statusCode, url).toBe(200);
    }
  });
});

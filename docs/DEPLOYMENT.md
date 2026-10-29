# Deployment guide

> **Current status: not deployed.** No production environment, DNS record or hosting platform has been touched. The application is **CONDITIONAL GO**: the code, tests and local build pass, but production readiness depends on the operator supplying a persistent-disk host, TLS, secrets and a verified backup routine. The API is **NO-GO on Vercel serverless** for the reasons in §9.

## 1. Supported topology

```
                   ┌──────────────────────────────┐
Internet ──HTTPS──>│ reverse proxy / TLS          │
                   │  /        -> static SPA      │
                   │  /api/*   -> API :4000       │
                   └──────────────┬───────────────┘
                                  │
                       ┌──────────▼──────────┐
                       │ one API process     │
                       │ Fastify + SQLite    │
                       └──────────┬──────────┘
                                  │
                       ┌──────────▼──────────┐
                       │ persistent volume    │
                       │ db / uploads / backups│
                       └─────────────────────┘
```

Requirements:

- A host with a **persistent disk** for `APP_DATA_DIR` (VPS, bare metal, or a container with a mounted volume).
- A **long-running single API process**. Do not use a cluster mode or multiple replicas.
- HTTPS termination at a reverse proxy or load balancer.
- Node.js 20.11+ on the API host; build tools if `better-sqlite3` has no prebuilt binary.
- A static host or the same reverse proxy for `apps/web/dist`.

## 2. Production environment

Start from [`.env.example`](../.env.example). Minimum production values:

```bash
NODE_ENV=production
HOST=127.0.0.1                 # 0.0.0.0 inside a container
PORT=4000
PUBLIC_APP_URL=https://apply.example.org
TRUSTED_ORIGINS=https://apply.example.org
SESSION_SECRET=<48 random bytes, base64url, >=32 chars>
ADMIN_BOOTSTRAP_TOKEN=<random, >=24 chars>
APP_DATA_DIR=/var/lib/esme
COOKIE_SAME_SITE=lax
TRUST_PROXY=true               # only behind a proxy that sets X-Forwarded-*
LOG_LEVEL=info
```

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Startup fails if `SESSION_SECRET` is missing/short, `PUBLIC_APP_URL` is not HTTPS, a configured path is unwritable, or the database/uploads directories are inside `apps/web`. Explicit environment variables override `.env`, so platform-provided values win.

Restrict permissions:

```bash
sudo install -d -o esme -g esme -m 750 /var/lib/esme
sudo chmod 700 /var/lib/esme/db /var/lib/esme/uploads /var/lib/esme/backups
```

## 3. Build and release

On the build machine or CI:

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build          # shared + API (tsup) + web (vite)
```

Artifacts:

- API: `apps/api/dist/` (`server.js` plus `cli/*.js`), `node_modules`, `database/migrations/`, `package.json` files.
- Web: `apps/web/dist/` (static files only).

Release procedure on the API host:

1. Create a backup (`npm run db:backup` or the compiled CLI) and copy it off-server.
2. Stop the API service.
3. Deploy the new release directory; run `npm ci` (or install production dependencies).
4. Start the API. Migrations run automatically at startup and are logged. `npm run db:migrate` is available for an explicit pre-start migration.
5. Check `GET /api/v1/health` and sign in.
6. If the release fails, restore the backup and the previous release; migrations are forward-only.

CLIs in production can use the compiled entry points, e.g. `node apps/api/dist/cli/backup.js`, so they do not depend on `tsx` being installed. The root npm scripts use `tsx` from dev dependencies.

## 4. First-run bootstrap

The API does not create a default administrator. With the service stopped or after it is running:

```bash
ADMIN_BOOTSTRAP_TOKEN='<value from env>' \
  npm run admin:bootstrap -- --email you@example.org --name "Your Name" --token '<value>'
```

Password entry is interactive; for automation set `ADMIN_BOOTSTRAP_PASSWORD` in the process environment and remove it immediately afterwards. Bootstrap refuses to run when an active Super Admin exists. Store the password in a password manager, not in the repository or shell history.

Recovery:

```bash
npm run admin:bootstrap -- --reset you@example.org --email you@example.org
```

This revokes that administrator's sessions and audits the reset.

## 5. Process supervision (systemd example)

```ini
[Unit]
Description=ESME Recruitment OS API
After=network.target

[Service]
Type=simple
User=esme
Group=esme
WorkingDirectory=/opt/esme
EnvironmentFile=/etc/esme/esme.env
ExecStart=/usr/bin/node /opt/esme/apps/api/dist/server.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/esme

[Install]
WantedBy=multi-user.target
```

Keep `EnvironmentFile` mode `0600`, owned by root. One service, one process.

## 6. Reverse proxy and TLS

Caddy example (automatic certificates):

```caddyfile
apply.example.org {
    encode zstd gzip
    request_body {
        max_size 25MB
    }

    @api path /api/*
    handle @api {
        reverse_proxy 127.0.0.1:4000
    }

    handle {
        root * /var/www/esme-web
        try_files {path} /index.html
        file_server
    }
}
```

Nginx notes:

- `client_max_body_size` must be **larger** than `MAX_UPLOAD_SIZE_BYTES` (e.g. `25m`), otherwise multipart uploads fail at the proxy.
- Proxy `/api/` with `proxy_set_header Host $host;`, `X-Forwarded-For $proxy_add_x_forwarded_for;`, `X-Forwarded-Proto $scheme;`, then set `TRUST_PROXY=true`.
- Do not cache `/api/` responses; the API already sends `Cache-Control: no-store`.
- Serve `apps/web/dist` with a SPA fallback to `index.html`, but keep `/api` out of the fallback.
- Add HSTS at the proxy in addition to the API's own header.

If the SPA and API share an origin (recommended), leave `VITE_API_BASE_URL=/api/v1` and `COOKIE_SAME_SITE=lax`.

## 7. Frontend deployment

Build with:

```bash
VITE_API_BASE_URL=/api/v1 npm run build -w @esme/web
```

Upload `apps/web/dist` to the static host. The build is a SPA: the host must return `index.html` for unknown paths (`/apply`, `/privacy`, `/admin/...`) while serving real assets normally.

Brand assets included: `esme-logo.png`, favicons and `apple-touch-icon`.

## 8. Vercel (frontend only)

A ready-to-adapt template is in `deploy/vercel/vercel.json.template`. Copy it to the repository root as `vercel.json`, replace `api.example.org` with the real API host, then:

1. Import the repository into Vercel.
2. Framework preset: Vite. Root directory: repository root (workspaces).
3. Build command: `npm run build:shared && npm run build -w @esme/web`.
4. Output directory: `apps/web/dist`.
5. Set `PUBLIC_APP_URL` and `TRUSTED_ORIGINS` on the API to the Vercel production domain, and `COOKIE_SAME_SITE=lax`.

The template proxies `/api/*` to the API so the browser only sees one origin. Keep `VITE_API_BASE_URL=/api/v1`; do **not** point the frontend directly at `https://api.example.org`, because the session cookie would become third-party and modern browsers may block it.

Caveats:

- **Never deploy the API to Vercel functions.** The filesystem is ephemeral and instances do not share SQLite or uploads.
- Vercel's proxy/function body-size limits may be lower than the 5 MB default upload. Verify a real upload through the deployment; if it fails, host the frontend on the same server as the API or lower `MAX_UPLOAD_SIZE_BYTES` within policy.
- Cold starts and rewrites add latency; monitor the API directly at its own health endpoint.

## 9. Why not serverless for the API

SQLite requires a writable, durable file and a single writer. Serverless functions:

- have an ephemeral filesystem that is discarded between invocations;
- may run concurrently in different instances with no shared disk;
- cannot guarantee that uploads and database rows remain consistent.

A managed database plus managed object storage would solve this, but both are explicitly excluded by the project constraints. Use a persistent-disk host.

## 10. Health, logs and monitoring

- `GET /api/v1/health` is unauthenticated and returns `200` with `{status:"ok",database:"ok",storage:"ok",time}` or `503` with `degraded` when the database or storage check fails. Point external monitoring at it.
- Logs are JSON (Pino). Cookies, authorization and CSRF headers are redacted. Ship logs off-server and retain them according to policy.
- Monitor disk usage: SQLite WAL, uploads and backups all grow. Set an alert well before the volume fills.
- The API also exposes `/api/v1/admin/system` for authenticated diagnostics (storage reconciliation, integrity, counts) and `npm run storage:verify` for scheduled checks.

## 11. Upgrades and rollback

- Migrations are applied on startup, are forward-only and are checksum-verified. Never edit an applied migration; add a new one.
- Always take and verify a backup before upgrading.
- To roll back: stop the API, restore the pre-upgrade backup with `npm run db:restore -- --from <dir> --yes --force`, deploy the previous release, start the service.
- Restore is destructive to the current database/uploads. Stop the API first and confirm `--force`.

## 12. Pre-launch checklist

- [ ] Persistent volume mounted at `APP_DATA_DIR`, owned by the service user, mode `750`/`700`.
- [ ] `NODE_ENV=production`, HTTPS `PUBLIC_APP_URL`, strong `SESSION_SECRET`, strong `ADMIN_BOOTSTRAP_TOKEN`.
- [ ] `.env` not committed, not readable by other users.
- [ ] Reverse proxy body limit above the upload limit; `/api` not cached; SPA fallback excludes `/api`.
- [ ] TLS certificate valid; HSTS enabled.
- [ ] API runs as a single supervised process.
- [ ] Super Admin bootstrapped, bootstrap password stored securely.
- [ ] Backup job scheduled and **a restore rehearsed** into a scratch directory.
- [ ] Off-server copy of backups configured.
- [ ] Health monitoring and disk alerts configured.
- [ ] Cycle created and opened intentionally; closing tested.
- [ ] Public submission with real files tested against the production domain.
- [ ] Document download tested as each role; anonymous access returns `401`.
- [ ] Logs checked for secrets; retention policy reviewed.

## 13. Post-launch checks

- Submit a test application and confirm the reference, dashboard row, document download and CSV export.
- Confirm the backup created after launch contains the test application.
- Review `audit_logs` for `auth.login_success`, `application.submitted` and `document.accessed`.
- Close the test cycle or remove the test data according to policy (retention defaults are disabled; deletion is deliberate).

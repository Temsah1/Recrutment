# ESME Recruitment OS

A complete recruitment platform for the ESME Cairo University Student Chapter.

Applicants use a public landing page and a six-step application form with private document uploads. Authorized chapter administrators review applications in a private dashboard with role-based access, validated status transitions, notes, CSV export, audit logging, backup/restore tooling and retention controls.

> **Build status:** implemented, typechecked, linted, unit/integration/E2E tested and built locally. It has **not** been deployed. No commits were pushed and no production environment was touched. See the verification summary in the handoff report and `docs/DEPLOYMENT.md` for the deployment gate.

---

## 1. What this system does

### Public experience

- **Landing page** — hero with live cycle status, departments, process, guidelines, FAQ, privacy summary and CTAs.
- **Six-step application** — personal details, academic background, department preference, motivation/links, documents, review and consent.
- **Private documents** — national ID (PDF) and university ID (JPEG/PNG/WebP). Files are validated on the server (size, MIME allow-list and file signature) and stored outside the public web root under random UUID names.
- **Submission safeguards** — one application per email per cycle, idempotency key to make retries safe, rate limiting, consent with the privacy-policy version recorded, and a public reference number (`ESME-YYYY-XXXX-XXXX-XXXX`).
- **Cycle-aware form** — the form opens only when the current cycle status is `open` and the current time is inside its dates. Closing a cycle immediately blocks new submissions.

### Administration

- **Authentication** — Argon2id password hashing, server-side sessions with SHA-256-hashed tokens, HttpOnly/SameSite cookies, CSRF header, origin allow-list, login rate limiting and a 15-minute lockout after five failures.
- **RBAC** — `super_admin`, `recruitment_admin`, `reviewer` with a tested permission matrix.
- **Dashboard** — totals, status breakdown, department distribution, recent activity.
- **Applicants** — search, filters, pagination, sorting, assignment, bulk status changes, detail view.
- **Review workflow** — validated status transitions with optimistic concurrency, internal notes, document open/download (permission-checked and audited).
- **CSV export** — UTF-8 BOM, RFC 4180 quoting and spreadsheet formula-injection neutralisation.
- **Configuration** — recruitment settings, cycles, departments, administrators, audit log, system health.
- **System tools** — storage reconciliation, SQLite integrity, WAL-safe backups with SHA-256 manifests, restore CLI, retention preview and guarded cleanup.
- **Audit log** — append-only database triggers block updates and deletes; actions record actor, entity, metadata and request ID.

### Deliberate constraints

- **SQLite is the only application database.** No Postgres, MySQL, MongoDB, Supabase, Firebase, Turso, Neon or similar service is used or required.
- **No managed object storage.** Uploads live on a private persistent filesystem.
- **No mock production data.** Demo data exists only as an explicitly invoked, non-production seed command.
- **No hardcoded production credentials.** Administrators are created through a one-time bootstrap that refuses to run once an active Super Admin exists.

---

## 2. Repository layout

```
.
├── apps/
│   ├── api/                  Fastify API, SQLite, storage, CLIs, API tests
│   │   ├── src/
│   │   │   ├── app.ts        Fastify factory (plugins, hooks, routes)
│   │   │   ├── server.ts     Process entry point
│   │   │   ├── config.ts     Environment validation
│   │   │   ├── db/           Connection, migrations, seed, row types
│   │   │   ├── routes/       Public, auth, admin routes
│   │   │   ├── services/     Auth, applications, storage, backup, diagnostics…
│   │   │   ├── plugins/      Auth guards, error handling
│   │   │   └── cli/          migrate, bootstrap-admin, backup, restore, verify, seed
│   │   └── test/             Vitest integration tests against real SQLite
│   └── web/                  React + TypeScript + Vite + Tailwind frontend
│       ├── src/pages/        Public and admin pages
│       ├── src/lib/          API client, form schema, formatting, copy
│       └── public/           Logo, favicons
├── packages/
│   └── shared/               Zod schemas, status rules, RBAC, CSV, i18n
├── database/migrations/      Checksummed, immutable SQL migrations
├── e2e/                      Playwright journeys A–E
├── deploy/vercel/            Vercel frontend rewrite template
├── docs/                     Architecture, security, deployment, backup, operations
├── scripts/e2e-reset.mjs     Isolated E2E data-directory reset
├── playwright.config.ts      Isolated E2E servers (API :4100, web :5273)
├── var/                      Local runtime data (gitignored)
└── .env.example              Environment template (no secrets)
```

The ESME Cairo University Student Chapter logo supplied for the project is used as `apps/web/public/esme-logo.png` with derived favicons.

---

## 3. Requirements

- Node.js **20.11+** (verified on Node 24.18.0)
- npm 10+
- A platform with a **persistent filesystem** for the API: SQLite database, private uploads and backups must survive restarts and deploys.
- Native build tools for `better-sqlite3` if a prebuilt binary is unavailable for your platform.

The frontend can be hosted on a static/CDN host (including Vercel). The API cannot run as a stateless serverless function because SQLite and private uploads require persistent disk; see `docs/DEPLOYMENT.md`.

---

## 4. Quick start (development)

```bash
npm install
cp .env.example .env          # then set SESSION_SECRET and ADMIN_BOOTSTRAP_TOKEN
npm run admin:bootstrap        # one-time Super Admin creation (interactive or env vars)
npm run dev                    # API :4000 + web :5173
```

Open <http://localhost:5173> for the public site and <http://localhost:5173/admin/login> for the dashboard.

The default data location is `var/app/` (database, private uploads, backups). Override with `APP_DATA_DIR`.

### Bootstrap the first administrator

```bash
npm run admin:bootstrap -- --email you@example.org --name "Your Name"
```

Password entry is interactive. In non-interactive environments provide `ADMIN_BOOTSTRAP_PASSWORD`; if `ADMIN_BOOTSTRAP_TOKEN` is configured, pass its value with `--token` (or have it in the environment). Bootstrap is refused when an active Super Admin already exists.

Recovery for a lost Super Admin password:

```bash
ADMIN_BOOTSTRAP_PASSWORD='...' npm run admin:bootstrap -- --reset you@example.org --email you@example.org
```

This revokes all sessions for that administrator and records an audit entry.

### Demo data (non-production only)

```bash
npm run seed:demo
```

The command is intended for local evaluation only; it must never be run against production data.

---

## 5. Environment variables

All variables are read and validated at startup. Explicit environment variables take precedence over `.env` files, so a stale `.env` cannot override a platform-provided `PORT` or secret.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `NODE_ENV` | prod: yes | `development` | `production` enables HTTPS/origin/secret checks. |
| `HOST` | no | `127.0.0.1` | API bind address. Use `0.0.0.0` behind a proxy/container. |
| `PORT` | no | `4000` | API port. |
| `APP_DATA_DIR` | no | `<repo>/var/app` | Base directory for database, uploads and backups. |
| `DATABASE_PATH` | no | `$APP_DATA_DIR/db/esme-recruitment.sqlite` | SQLite file. Must be outside `apps/web`. |
| `PRIVATE_UPLOADS_DIR` | no | `$APP_DATA_DIR/uploads` | Private document storage. Must be outside `apps/web`. |
| `BACKUP_DIR` | no | `$APP_DATA_DIR/backups` | Backup output directory. |
| `MIGRATIONS_DIR` | no | `<repo>/database/migrations` | SQL migration folder. |
| `PUBLIC_APP_URL` | prod: yes | `http://localhost:5173` | Public site origin; must be HTTPS in production. |
| `TRUSTED_ORIGINS` | no | — | Extra comma-separated origins allowed for CORS/unsafe requests. |
| `SESSION_SECRET` | prod: yes | dev-only fallback | ≥32 characters in production; signs/hashes session tokens. |
| `SESSION_MAX_AGE_SECONDS` | no | `43200` (12 h) | Absolute session lifetime. |
| `SESSION_IDLE_TIMEOUT_SECONDS` | no | `3600` (1 h) | Idle session timeout. |
| `COOKIE_SAME_SITE` | no | `lax` | `lax`, `strict` or `none`. Use `none` + HTTPS only for cross-site deployments. |
| `TRUST_PROXY` | no | `false` | Set `true` only behind a trusted reverse proxy. |
| `ADMIN_BOOTSTRAP_TOKEN` | prod: yes | — | ≥24 characters; authorises CLI bootstrap/reset. |
| `MAX_UPLOAD_SIZE_BYTES` | no | `5242880` (5 MB) | Server-side upload limit (bounded 10 KB–20 MB). |
| `RECRUITMENT_TIMEZONE` | no | `Africa/Cairo` | Default display timezone. |
| `LOG_LEVEL` | no | `debug` / `info` in prod | Pino log level. |
| `ENV_FILE` | no | — | Additional env file to load first (explicit env still wins). |
| `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_BOOTSTRAP_PASSWORD` | bootstrap only | — | Non-interactive bootstrap inputs. Never commit these. |
| `VITE_API_BASE_URL` | web build | `/api/v1` | Frontend API base. Keep relative when proxying `/api`. |
| `VITE_DEV_API_TARGET` | dev | `http://127.0.0.1:4000` | Vite dev proxy target. |

Copy `.env.example` and replace every placeholder before deploying. Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

---

## 6. Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Build shared package, start API (:4000) and web (:5173). |
| `npm run build` | Typecheck/build shared, API (`tsup`) and web (`vite`). |
| `npm start` | Run the compiled API (`apps/api/dist/server.js`). |
| `npm run typecheck` | TypeScript project checks for all workspaces. |
| `npm run lint` | ESLint over the repository. |
| `npm test` | Shared + API + web unit/integration tests (real SQLite where relevant). |
| `npm run test:e2e` | Playwright journeys A–E against isolated API/web servers. |
| `npm run db:migrate` | Apply pending migrations. |
| `npm run admin:bootstrap` | Create the first Super Admin / reset a password. |
| `npm run db:backup` | Create a WAL-safe backup with checksum manifest. |
| `npm run db:restore -- --from <dir> --yes` | Restore into an empty target; add `--force` to replace. |
| `npm run storage:verify` | Database integrity, storage reconciliation and retention summary. |
| `npm run seed:demo` | Insert demo data (non-production only). |

---

## 7. Data and storage

```
APP_DATA_DIR/
├── db/esme-recruitment.sqlite   SQLite (WAL mode, foreign keys ON)
├── uploads/<yyyy>/<mm>/<uuid>   Private documents, random names, date-sharded
└── backups/<UTC timestamp>/     database.sqlite, uploads/, manifest.json
```

- Uploads are **never** served as static files. Every download goes through an authenticated, permission-checked, audited API route.
- File names, MIME type and magic bytes are validated; original names are stored as metadata only.
- Temporary upload files are written under `.tmp`, atomically renamed and cleaned on startup/interval.
- Migrations are applied automatically at startup and by the CLI. Applied migration checksums are stored; changing a previously applied migration is rejected.
- Audit logs are append-only at the database level.

---

## 8. Testing

Verified on 2026-10-29 (local Windows 10, Node 24.18.0):

| Suite | Location | Result |
| --- | --- | --- |
| Shared unit (schemas, RBAC, status matrix, CSV, validation) | `packages/shared/test` | 49 passed |
| API integration (real SQLite, migrations, multipart, auth, RBAC, audit, backup/restore) | `apps/api/test` | 44 passed |
| Web unit (formatting, form mapping, API client) | `apps/web/src/**/*.test.ts` | 20 passed |
| E2E Journeys A–E (Chromium) | `e2e/` | 5 passed |
| Typecheck / lint / production build | all workspaces | passed |

E2E uses an isolated data directory (`var/e2e`), boots its own API on `:4100` and web dev server on `:5273`, and runs serially because the journeys share state. Do not run it against development or production data.

Additional manual verification performed during the build:

- API restart: same application reference, status and document remained available after a full process restart.
- CLI backup → restore into a fresh directory → integrity check, row counts, document count and `storage:verify` all matched.
- Anonymous document download returned `401`; authenticated download returned `200` with the expected bytes.

---

## 9. Deployment status and limits

- **GO only with a persistent-disk host** for the API (VPS, container with a volume, bare metal). SQLite + private uploads cannot be made durable on Vercel serverless functions.
- **Vercel is supported for the frontend only.** Use the rewrite template in `deploy/vercel/` or set `VITE_API_BASE_URL`; cross-site cookie requirements are documented in `docs/DEPLOYMENT.md`.
- Run **one API instance** with this SQLite setup. Multiple writers across hosts are not supported; local multiple processes on the same disk are serialised by SQLite but are not a scaling strategy.
- Configure HTTPS, DNS, process supervision, log retention, off-server backup copying and monitoring before opening a cycle.

No production deployment, DNS change, push or git history rewrite was performed. Deployment requires explicit authorization.

---

## 10. Operational documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Security model](docs/SECURITY.md)
- [Deployment guide](docs/DEPLOYMENT.md)
- [Backup and restore](docs/BACKUP_AND_RESTORE.md)
- [Operations runbook (25 topics)](docs/OPERATIONS.md)

---

## 11. License and ownership

Internal project for the ESME Cairo University Student Chapter. The ESME name and logo are used for the chapter's recruitment portal. No license is granted for third-party reuse of the branding.

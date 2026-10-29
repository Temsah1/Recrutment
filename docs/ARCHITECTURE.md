# Architecture

ESME Recruitment OS is an npm-workspaces monorepo with a React single-page app, a Fastify API and a SQLite database. The API is the only component that touches data; the browser never sees a database file or a storage path.

```
Browser ──HTTPS──> reverse proxy ──> Fastify API (:4000) ──> SQLite file (WAL)
                        │                    │
                        └──> static SPA      └──> private uploads directory
                             (Vite build)          (outside any web root)
```

## 1. Components

| Component | Location | Responsibility |
| --- | --- | --- |
| `@esme/shared` | `packages/shared` | Zod schemas, status transition matrix, RBAC permissions, CSV serialisation, constants, copy/i18n. Consumed by both API and web. |
| `@esme/api` | `apps/api` | Fastify 5 server: config validation, SQLite connection/migrations, auth, uploads, admin routes, CLIs, backup/restore, retention. |
| `@esme/web` | `apps/web` | React 18 + TypeScript + Vite + Tailwind SPA with public pages and the private admin dashboard. |
| Migrations | `database/migrations` | Checksummed, immutable SQL applied on API start and by `db:migrate`. |
| E2E | `e2e` | Playwright journeys A–E against isolated API/web servers. |

The API is stateless apart from its disk. The web app is fully static and can be served by any CDN, including Vercel, as long as `/api` is proxied to the API.

## 2. Request flows

### 2.1 Public application submission

1. `GET /api/v1/public/config` returns cycle status, departments, privacy version and upload rules.
2. The six-step form (`/apply`) validates client-side with shared Zod schemas, then sends `multipart/form-data` to `POST /api/v1/public/applications` with an optional `Idempotency-Key` header (UUID).
3. The route applies a 10-requests/hour limiter per IP, parses fields and two files, and hands off to `submitApplication`.
4. The service:
   - rejects submissions when the current cycle is not `open`/`closed by date`, or when the deadline passed;
   - enforces one application per normalised email per cycle (`UNIQUE` index);
   - reuses an existing application if the idempotency key was already stored;
   - validates file size, declared MIME allow-list and magic bytes;
   - writes uploads to `uploads/<yyyy>/<mm>/<uuid>` via `.tmp` + atomic rename;
   - inserts applicant, application, document rows and the initial status-history row in one SQLite transaction;
   - records `application.submitted` in the audit log;
   - generates a public reference `ESME-YYYY-XXXX-XXXX-XXXX`.
5. On a database failure the newly written files are removed; on a duplicate or idempotent replay the response is the original reference, not an error.

### 2.2 Admin authentication and sessions

1. `POST /api/v1/auth/login` verifies Argon2id, resets the failure counter and issues a random 32-byte token.
2. The database stores only `SHA-256(token)` as the session id, plus a separate CSRF token, timestamps, IP and user agent.
3. The token is set as an `HttpOnly` cookie; the CSRF token is returned in the body and kept in memory by the SPA, then sent as `x-esme-csrf` on every unsafe request.
4. Every authenticated request resolves the session, enforces absolute expiry (default 12 h) and idle expiry (default 1 h), checks that the administrator is still active, and touches `last_seen_at` at most every 30 s.
5. Unsafe requests from a disallowed `Origin`/`Referer` are rejected with `403` before route handling.
6. Logout deletes the session row. Password changes and password resets revoke every session for that administrator.

### 2.3 Review and status change

1. `PATCH /api/v1/applications/:id/status` requires `applications.status`.
2. The transition is checked against the shared matrix (see §6), the optional `expectedVersion` is compared with `row_version` (optimistic concurrency, `409` on mismatch), and the update, history row and audit entry run in one immediate transaction.
3. The response is the new status and version; the SPA refreshes the record.

### 2.4 Document download

`GET /api/v1/documents/:id/download` requires `documents.download` (Super Admin, Recruitment Admin), looks the record up in SQLite, reads the file by its stored random name and streams it with `Content-Disposition: attachment` (or `inline` only when explicitly requested for a preview, with a sandboxing CSP). Access is audited as `document.accessed`. There is no public/static path to uploads.

### 2.5 CSV export

`GET /api/v1/exports/applications.csv` requires `exports.create`, streams a UTF-8 CSV with BOM, RFC 4180 quoting and neutralisation of cells beginning with `= + - @`, tab or carriage return. The export is audited.

### 2.6 Backup, restore and retention

- Backup uses SQLite's online backup API (consistent under WAL), then copies `uploads/` and writes `manifest.json` with the database SHA-256, integrity result, migration list and counts. Existing backup directories are never overwritten.
- Restore verifies the manifest checksum and `integrity_check`, refuses a non-empty target unless `--force`, and replaces the database plus uploads.
- Retention preview lists decided applications (`accepted`/`rejected`) older than `retention.days`. Cleanup is disabled by default and requires `enabled: true` plus the literal confirmation `DELETE`; it deletes applications (cascading to documents, history, notes), orphaned applicants and stored files, and audits counts only.

## 3. Data model

| Table | Purpose | Key constraints |
| --- | --- | --- |
| `administrators` | Admin accounts | unique lower-cased email, role, active flag, failure counter, `locked_until` |
| `admin_sessions` | Server sessions | PK = SHA-256 of the cookie token, CSRF token, expiry, last seen |
| `recruitment_cycles` | Recruitment periods | status `draft/open/closed/archived`, start/end dates, one active cycle |
| `departments` | Department catalogue | unique slug, active flag, display order |
| `applicants` | Applicant identity | unique email; one applicant can apply to multiple cycles |
| `applications` | One submission per applicant per cycle | unique `(applicant_id, recruitment_cycle_id)`, unique public reference, unique idempotency key, `row_version` |
| `application_documents` | Document metadata | storage name (UUID), original name, MIME, size, SHA-256, type |
| `application_status_history` | Append-only status trail | old/new status, reason, actor, timestamp |
| `application_notes` | Internal notes | author, body, timestamp |
| `audit_logs` | Security/operation trail | actor, action, entity, metadata JSON, request id; DB triggers reject UPDATE/DELETE |
| `app_settings` | JSON settings document | single row with schema validation on write |

Foreign keys are enabled on every connection; WAL journaling is configured at startup. Migrations record a version and checksum; editing an already-applied migration is rejected.

## 4. Storage layout

```
APP_DATA_DIR/
├── db/esme-recruitment.sqlite (+ -wal, -shm)
├── uploads/<yyyy>/<mm>/<uuid>.<ext>
├── uploads/.tmp/                  incomplete uploads, cleaned periodically
└── backups/<UTC timestamp>/       database.sqlite, uploads/, manifest.json
```

Configuration refuses a database or upload directory inside `apps/web`, so a misconfiguration cannot publish private files through the frontend.

## 5. Authentication and authorisation

- Passwords: Argon2id (19 MiB, t=2, p=1, 32-byte hash).
- Sessions: opaque 32-byte token, hashed at rest, `HttpOnly` + `SameSite` cookie, CSRF header required for unsafe methods.
- Lockout: five failed attempts set `locked_until` for 15 minutes; unknown accounts run a dummy Argon2 verify to reduce timing difference.
- Role matrix (see [SECURITY.md](SECURITY.md) for the full table): Super Admin has every permission; Recruitment Admin manages applications, cycles and exports; Reviewer can read applications and add notes.

## 6. Application state machine

```
pending ──> reviewing ──> shortlisted ──> accepted
   │            │  ▲            │            │
   │            │  └────────────┘            │
   ├──> shortlisted                          │
   └──> rejected <── reviewing <── rejected  │
              ▲            ▲                  │
              └────────────┴──────────────────┘
```

Exact allowed targets:

| From | Allowed to |
| --- | --- |
| `pending` | `reviewing`, `shortlisted`, `rejected` |
| `reviewing` | `pending`, `shortlisted`, `accepted`, `rejected` |
| `shortlisted` | `reviewing`, `accepted`, `rejected` |
| `accepted` | `shortlisted`, `rejected` |
| `rejected` | `reviewing`, `shortlisted` |

Same-state changes are rejected. Decisions can be corrected, and every change is recorded in history and the audit log.

## 7. Idempotency and concurrency

- **Submission idempotency:** the client sends a UUID in `Idempotency-Key` (or `idempotencyKey` in the payload). A replay returns the stored reference. A race between two identical requests is resolved by the unique index and a re-read.
- **Duplicate protection:** `(applicant_id, recruitment_cycle_id)` is unique. A second submission from the same email in the same cycle returns the existing reference.
- **Status updates:** the SPA passes the `version` it displayed; the API compares it with `row_version` and returns `409` if another administrator changed the row first.
- **SQLite concurrency:** one API process is the supported topology. WAL allows concurrent readers, and write transactions are serialised by SQLite. Multiple API hosts writing the same file over a network filesystem are not supported.

## 8. API surface

All routes are under `/api/v1`. Administrative routes use the additional prefix `/admin`.

| Area | Routes |
| --- | --- |
| Public | `GET /public/config`, `GET /public/departments`, `POST /public/applications`, `GET /health` |
| Auth | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password` |
| Applications | `GET /admin/dashboard`, `GET /admin/applications`, `GET /admin/applications/:id`, `GET /admin/applications/:id/documents`, `PATCH /admin/applications/:id/status`, `PATCH /admin/applications/:id/assignee`, `POST /admin/applications/:id/notes`, `POST /admin/applications/bulk-status`, `GET /admin/reviewers` |
| Documents / export | `GET /admin/documents/:id/download`, `GET /admin/exports/applications.csv` |
| Configuration | `GET/PATCH /admin/settings`, `GET/POST /admin/departments`, `PATCH /admin/departments/:id`, `GET/POST /admin/cycles`, `PATCH /admin/cycles/:id`, `POST /admin/cycles/:id/activate` |
| Administration | `GET/POST /admin/administrators`, `PATCH /admin/administrators/:id`, `POST /admin/administrators/:id/password-reset`, `GET /admin/audit-logs` |
| System | `GET /admin/system`, `POST /admin/system/retention/preview`, `POST /admin/system/retention/cleanup`, `POST /admin/backups` |

Errors use a stable envelope (`error.code`, `error.message`, optional `error.details`); validation failures return `400` with field details, authentication failures `401`, authorisation failures `403`, conflicts `409`, and lockout `423`. Request IDs are generated per request for server logs and audit metadata, not returned in response bodies.

## 9. Frontend structure

- `src/pages/public`: landing, application wizard, success, privacy, 404.
- `src/pages/admin`: login, dashboard, applicants, applicant detail, cycles, departments, settings, administrators, audit log, system, change password, access denied.
- `src/lib/api.ts`: fetch/XHR client with CSRF header, 401 handling and typed errors; `VITE_API_BASE_URL` defaults to `/api/v1`, and the dev server proxies `/api` to `VITE_DEV_API_TARGET`.
- Routes under `/admin` are guarded by session lookup (`/auth/me`); the API remains the authority for every operation.

## 10. Deployment topology

Supported production topology:

```
Internet
  ├── CDN / static host ──> apps/web build (HTML, JS, CSS, logo)
  └── HTTPS reverse proxy ──> one Fastify API process ──> persistent volume
                                                          ├── SQLite
                                                          ├── private uploads
                                                          └── backups
```

The API needs a writable persistent disk and a long-running process. It cannot be deployed as a stateless Vercel function: serverless filesystems are ephemeral and instances do not share SQLite or uploads. See [DEPLOYMENT.md](DEPLOYMENT.md).

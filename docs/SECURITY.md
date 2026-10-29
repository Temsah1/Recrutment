# Security model

This document describes what the system protects, the controls that are implemented, and the limits an operator must cover outside the application.

## 1. Assets and threat model

**Assets**

- Applicant personal data: name, email, phone, academic details, motivation text, links.
- Identity documents: National ID (PDF) and University ID (image). These are the most sensitive files in the system.
- Administrator credentials, session tokens and the CSRF token.
- The SQLite database, private uploads and backup directories.
- The audit trail and status history.

**Adversaries and failure modes considered**

| Threat | Control |
| --- | --- |
| Anonymous internet user probing admin endpoints | Authentication on every admin route, uniform `401`, rate-limited login. |
| Credential stuffing / password guessing | Argon2id, five-attempt lockout for 15 minutes, login limiter 8/min, dummy hash for unknown accounts. |
| Stolen session cookie | `HttpOnly` cookie, hashed-at-rest token, idle + absolute expiry, session revocation on password change/reset, logout deletion. |
| CSRF from a malicious site | `SameSite` cookie, CSRF header compared in constant time, Origin/Referer allow-list for unsafe methods. |
| Unauthorised document access | No static upload route; downloads require `documents.download`, are streamed by the API and audited. |
| Malicious upload (wrong type, disguised executable, oversized file) | Size bounds, declared MIME allow-list per document type, magic-byte inspection, random UUID storage names, no execution path, `.tmp` + atomic rename. |
| Applicant spam / duplicate submissions | 10 submissions/hour/IP, one application per email per cycle, idempotency key, cycle status/deadline checks. |
| Insider tampering with the audit trail | Database triggers reject `UPDATE` and `DELETE` on `audit_logs`. |
| Path traversal / arbitrary file write | Storage names are generated UUIDs; user-supplied names are metadata only. Config refuses uploads inside the web root. |
| Spreadsheet formula injection in exports | Cells starting with `= + - @`, tab or carriage return are prefixed/neutralised. |
| Secret leakage in logs | Pino redaction for cookie, authorization, CSRF and `set-cookie` headers. |

**Out of scope for the application** — operating-system patching, disk encryption, network firewalls, TLS termination, WAF, malware scanning of uploaded files, email deliverability and physical security. These are deployment responsibilities (see [DEPLOYMENT.md](DEPLOYMENT.md)).

## 2. Role-based access control

Roles: `super_admin`, `recruitment_admin`, `reviewer`.

| Permission | Super Admin | Recruitment Admin | Reviewer |
| --- | :---: | :---: | :---: |
| `applications.view` | yes | yes | yes |
| `applications.view_all` | yes | yes | — |
| `applications.status` | yes | yes | — |
| `applications.assign` | yes | yes | — |
| `applications.notes` | yes | yes | yes |
| `documents.view` (metadata) | yes | yes | yes |
| `documents.download` | yes | yes | — |
| `exports.create` | yes | yes | — |
| `departments.manage` | yes | — | — |
| `settings.manage` | yes | — | — |
| `settings.security` | yes | — | — |
| `cycles.manage` | yes | yes | — |
| `administrators.manage` | yes | — | — |
| `audit.view` | yes | — | — |
| `backups.run` | yes | — | — |
| `retention.manage` | yes | — | — |

Rules enforced server-side:

- A non-Super-Admin can never create, promote to, or modify a Super Admin (`canAssignRole`).
- A Super Admin cannot deactivate or demote their own account through the administrators API (self-lockout guard).
- Reviewers see the applications assigned to them by default; `applications.view_all` widens the list.
- Every admin route declares the permission it requires; the SPA also hides unavailable actions, but the API is authoritative.

## 3. Authentication and sessions

| Control | Implementation |
| --- | --- |
| Password hashing | Argon2id, 19,456 KiB memory, 2 iterations, parallelism 1, 32-byte output. |
| Password policy | Minimum 12 characters on creation/reset; maximum 200. |
| Session token | 32 random bytes (`base64url`), sent as an `HttpOnly` cookie; only its SHA-256 is stored. |
| Cookie flags | `HttpOnly`, `SameSite` from config (default `lax`), `Secure` in production, `Path=/`, `Max-Age` = absolute session lifetime. |
| Absolute expiry | Default 12 hours (`SESSION_MAX_AGE_SECONDS`). |
| Idle expiry | Default 1 hour (`SESSION_IDLE_TIMEOUT_SECONDS`); `last_seen_at` refreshed at most every 30 s. |
| Revocation | Logout deletes the row; password change/reset deletes all sessions for that administrator; deactivation invalidates access on the next request. |
| Brute force | Five failures set `locked_until` to now + 15 minutes; successful login clears the counter. |
| Enumeration resistance | Unknown emails still run a dummy Argon2 verify; responses do not reveal whether the email exists. |
| Bootstrap | CLI-only, refuses when an active Super Admin exists; production requires `ADMIN_BOOTSTRAP_TOKEN` (≥24 chars). |

There is no "remember me" and no client-side token storage; the SPA keeps the CSRF token in memory only.

## 4. CSRF and origin policy

1. Every unsafe request (`POST`, `PATCH`, `PUT`, `DELETE`) must carry `x-esme-csrf` matching the session's CSRF token, compared in constant time.
2. An `onRequest` hook rejects unsafe browser requests whose `Origin` (or `Referer`) is not in `TRUSTED_ORIGINS`, `PUBLIC_APP_URL` or the API's own host.
3. CORS reflects only trusted origins and allows credentials.
4. Cookies default to `SameSite=Lax`. A cross-site frontend requires `COOKIE_SAME_SITE=none` over HTTPS; this weakens the cookie-level CSRF defence, so the header check and origin allow-list remain mandatory.

## 5. Rate limits

| Endpoint | Limit |
| --- | --- |
| `POST /auth/login` | 8 per minute per IP |
| `POST /auth/change-password` | 10 per minute |
| `POST /public/applications` | 10 per hour per IP |
| Backup creation | 3 per hour |
| Retention cleanup | 4 per hour |
| Other routes | No global limiter; a 120/min default is configured but `global: false` |

Limits are per process and in-memory. Behind a proxy, set `TRUST_PROXY=true` only when the proxy overwrites `X-Forwarded-For`; otherwise clients can spoof their address.

## 6. Upload handling

- National ID: `application/pdf` only. University ID: `image/jpeg`, `image/png` or `image/webp`.
- Files must be between 10 KB and the configured maximum (default 5 MB, hard ceiling 20 MB). Multipart also limits 2 files, 30 fields and 40 parts.
- The server checks the declared MIME type, the extension expected for that type, and the file's magic bytes before accepting it.
- Stored names are random UUIDs under date-sharded directories. The original filename is metadata and is never used as a path.
- Writes go to `.tmp` and are renamed atomically; abandoned temporary files are cleaned on startup and periodically, and excluded from backups.
- Uploads are outside `apps/web`; configuration refuses a path inside the web root. There is no directory listing or static handler.
- Downloads default to `Content-Disposition: attachment`. An explicit `?disposition=inline` exists for the in-dashboard preview; it is limited to the allow-listed PDF/image types and served with `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox; default-src 'none'` and `Cache-Control: no-store`.

## 7. HTTP headers and responses

- Helmet with HSTS in production (`max-age=15552000; includeSubDomains`), `Referrer-Policy: no-referrer`, and a restrictive CSP on JSON responses (`default-src 'none'; frame-ancestors 'none'`).
- API responses are `Cache-Control: no-store`.
- Request IDs are generated per request and recorded in server logs and audit metadata. They are not returned in error bodies, to avoid leaking internal correlation data.
- Errors do not include stack traces, SQL or filesystem paths in production responses.
- The JSON body limit is 1 MiB; multipart limits are applied separately.

## 8. Audit logging

- Admin authentication events, application submission, status changes, assignment, notes, document access, exports, settings/department/cycle/administrator changes, backups, retention preview and cleanup are recorded.
- Each entry stores actor (nullable for public submissions), action, entity, metadata, request ID and timestamp.
- Triggers `audit_logs_no_update` and `audit_logs_no_delete` abort any `UPDATE` or `DELETE`.
- Note: an attacker with direct filesystem access to SQLite can drop triggers or edit the file; audit immutability is a database-level control, not tamper-proof storage. Ship backups off-server and restrict file permissions.

## 9. Secrets and configuration

- `SESSION_SECRET` is mandatory in production (≥32 chars). `ADMIN_BOOTSTRAP_TOKEN` must be ≥24 characters. The API refuses to start in production with a missing/short secret or a non-HTTPS `PUBLIC_APP_URL`.
- No default administrator, password or API key exists in source. Bootstrap credentials are supplied interactively or via environment variables at run time.
- `.env` files are gitignored; `.env.example` contains placeholders only.
- Explicit process environment variables override `.env` files, so a platform-provided `PORT` or secret cannot be clobbered by a stale file.
- Rotation: changing `SESSION_SECRET` is currently only used for configuration integrity (session ids are random and hashed directly); rotate it as part of incident response and revoke sessions by resetting administrator passwords or clearing `admin_sessions`.

## 10. Data protection and retention

- Database, uploads and backups live under `APP_DATA_DIR`; operators must restrict permissions to the API service account and exclude the directory from web servers.
- Backups contain the full database and all private uploads. Treat a backup as equally sensitive as production data, encrypt it at rest and copy it off-server.
- Retention cleanup is **disabled by default**. When enabled, only `accepted`/`rejected` applications older than the configured days are eligible, and the operation requires the literal confirmation `DELETE`.
- The privacy notice shown at submission is versioned; the accepted version is stored on the application.

## 11. Known limitations

- No multi-factor authentication.
- No email verification, notification or password-reset-by-email flow; recovery is an administrator or CLI action.
- Uploads are not virus-scanned; add a scanner at the storage boundary if required by policy.
- SQLite is not encrypted by the application. Use OS/volume encryption and restrictive permissions.
- Rate limiting is in-memory and per process; it is not a substitute for a network WAF or DDoS protection.
- The API trusts its local disk. Do not place the SQLite file on a network share or run multiple API hosts against it.
- CSV exports are plaintext files downloaded by administrators; the browser and workstation become part of the data boundary.
- No automatic dependency or secret scanning is configured; add it to CI.

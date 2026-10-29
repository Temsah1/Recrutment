# Operations runbook

Practical procedures for running the system. Commands assume the repository root and that the API service is supervised (see [DEPLOYMENT.md](DEPLOYMENT.md)). Compiled CLIs live in `apps/api/dist/cli/`; the npm aliases use `tsx` and require dev dependencies.

## 1. Daily and weekly checks

**Daily during an open cycle:** open the dashboard, confirm submissions and status counts look sane, check `GET /api/v1/health`, confirm last night's backup exists off-server, and review the audit log for unexpected `auth.login_failed` clusters.

**Weekly:** run `npm run storage:verify`, check disk usage and backup age, review administrator accounts, and confirm retention settings have not been enabled unintentionally.

## 2. Restarting the API

```bash
sudo systemctl restart esme-api
curl -fsS https://apply.example.org/api/v1/health
```

The API applies pending migrations and seeds default settings/departments on start. Restarting does not delete data. Never run two API processes against the same database.

## 3. Interpreting the health endpoint

`GET /api/v1/health` returns `200` when SQLite responds to `SELECT 1` and the uploads directory is writable. `503` with `status: "degraded"` identifies `database` and/or `storage` as `error`. Check the service logs, disk space and permissions first. The endpoint is unauthenticated by design; expose it only through your normal HTTPS proxy.

## 4. Logs and request IDs

Logs are JSON with a per-request ID. The UI shows a stable error code and message but not the request ID; correlate by timestamp, administrator, route and the error code in the logs. Cookies, authorization and CSRF headers are redacted. Set `LOG_LEVEL=info` in production; increase temporarily for diagnosis, then revert to avoid logging request detail.

## 5. Admin login failures and lockouts

Five failed attempts lock an account for 15 minutes. The response is `423 account_locked`. Wait for the window or ask a Super Admin to unlock by resetting the password (this also revokes sessions). “Invalid email or password” does not reveal whether the account exists. Login is limited to 8 attempts/minute per IP; a `429` means the limiter, not a lockout.

## 6. Creating and managing administrators

Super Admin → Administrators → create with email, display name, role and a password of at least 12 characters. Only a Super Admin can grant the Super Admin role. A Super Admin cannot deactivate their own account or change their own role. Deactivation invalidates existing sessions on the next request. Prefer deactivation over deletion; deactivating the last active Super Admin is blocked.

## 7. Recovering a Super Admin password

```bash
ADMIN_BOOTSTRAP_TOKEN='<token>' npm run admin:bootstrap -- \
  --reset admin@example.org --email admin@example.org
```

Enter the new password at the prompt (or set `ADMIN_BOOTSTRAP_PASSWORD` for automation and unset it afterwards). This unlocks the account, reactivates it, revokes all its sessions and writes an audit entry.

## 8. Opening a recruitment cycle

Admin → Cycles. Create or edit the current cycle, set status `open`, set `opensAt`/`closesAt` if the window should be time-bounded, and save. Use **Activate** to make it the current cycle; there is exactly one current cycle. The public config and form reflect the change immediately. Verify on the public landing page that the CTA changes to “Apply now”.

## 9. Changing dates or closing early

Edit the cycle and set `closesAt` in the past, or set status `closed`. New submissions are refused immediately; existing applications remain readable. To reopen, return the status to `open` and fix the dates. Closing a cycle does not change application statuses or send notifications.

## 10. Landing page and form copy

Admin → Settings → recruitment: title, headline, description, deadline, confirmation title/message and timezone. Changes are schema-validated, audited and appear on the public site after refresh. Keep the privacy notice and confirmation message consistent with the current policy.

## 11. Privacy notice and consent versions

Admin → Settings → privacy: edit the notice and set a new version string whenever the text materially changes. New submissions record the version they accepted. Changing the version does **not** retroactively change consent records for existing applications.

## 12. Departments

Admin → Settings/Departments: create or edit name, slug, description, active flag and display order. Inactive departments disappear from the public form but remain referenced by existing applications. Do not rename a slug casually; it is an identifier used by the public config.

## 13. Duplicate, missing or stuck applications

- A duplicate email in the same cycle is rejected and returns the existing reference. Search the email in Applicants to find it.
- A repeated POST with the same idempotency key returns the original reference (`200`, `replayed: true`).
- If a submitter reports an error after uploading, search first; do not ask them to submit again blindly, which risks a duplicate.
- If the reference is lost, search by email or name. References are also visible in the detail page and CSV export.

## 14. Assigning reviewers and bulk actions

On the applicant detail page, choose an assigned reviewer (Recruitment Admin/Super Admin). Reviewers only see applications assigned to them; unassigned applications are visible to roles with `applications.view_all`. Bulk status changes apply the same transition validation to each selected application; failures are reported per item.

## 15. Status changes and corrections

Use the status form on the detail page. Only transitions in the published matrix are accepted. The form sends the version it displayed; if another administrator changed the record, the API returns `409` and you must reload before retrying. Every change stores old/new status, reason, actor and timestamp.

## 16. Internal notes

Notes are visible only to administrators, never to applicants. Add them on the detail page (max 4,000 characters). Notes are audited once per addition. Reviewers can add notes; they cannot change status or download documents.

## 17. Document access and missing files

Downloads are permission-checked and audited. If the UI reports a missing file, run `npm run storage:verify`. Missing files usually mean uploads were not restored with the database, a backup was copied incompletely, or retention cleanup removed files while rows remained. Restore the matching backup rather than deleting the row by hand.

## 18. CSV exports and spreadsheet safety

Exports include a UTF-8 BOM for Excel, quote fields per RFC 4180 and neutralise cells beginning with `=`, `+`, `-`, `@`, tab or carriage return. Treat the file as sensitive PII: store it in an access-controlled location and delete it when no longer needed. Each export is audited.

## 19. Backup routine

```bash
npm run db:backup
```

Backups land in `BACKUP_DIR/<timestamp>/` with a manifest. Copy each generation off-server, encrypt it at rest and rotate old copies. Take a backup before every deploy, migration, restore or mass status change. Backups contain identity documents and must be protected accordingly. See [BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md).

## 20. Restore rehearsal and recovery

Stop the API, verify the backup, then restore with `--yes` (and `--force` to replace existing data). Rehearse quarterly into a scratch `APP_DATA_DIR` first. After restore, run `storage:verify`, start the API, sign in, open an application, download a document and review the audit log before reopening submissions. Restore is destructive and irreversible.

## 21. Retention preview and cleanup

Admin → System → Retention preview. The preview is read-only, audited and lists `accepted`/`rejected` applications older than `retention.days`. Cleanup is disabled by default; to enable it, change the retention setting deliberately after a policy review. Cleanup requires the literal confirmation `DELETE` and permanently removes applications, dependent rows, orphaned applicants and files. It writes counts only to the audit log. Take a backup first.

## 22. Storage reconciliation

```bash
npm run storage:verify
```

Reports database integrity and size, uploads writability, document count and bytes, missing files, orphaned files, migration versions, retention summary and row counts. Exit code is non-zero when problems are found. Orphaned files can be investigated and removed manually; missing files require backup restoration. The authenticated System page shows the same diagnostics.

## 23. Disk space and WAL growth

SQLite WAL and `-shm` files live beside the database. Backups duplicate the entire data set. Monitor free space and alert at 20%. If space is low: copy and prune old off-server backups, remove stale `.tmp` uploads (the API cleans files older than 24 hours every 15 minutes), and archive media outside `APP_DATA_DIR`. Do not delete `-wal`/`-shm` while the API is running.

## 24. Upgrades and migrations

1. Take and verify a backup; copy it off-server.
2. Stop the API.
3. Deploy the new code and run `npm ci` if dependencies changed.
4. Start the API; migrations apply automatically and are logged.
5. Check health, sign in, submit a test application if the form changed.
6. Roll back by restoring the pre-upgrade backup and the previous release. Migrations cannot be reversed in place.

## 25. Security incident response

1. **Contain:** stop the API or block the proxy, deactivate suspicious administrators and reset passwords (revokes sessions).
2. **Preserve:** copy logs, the database and the affected backup directory; do not edit audit rows.
3. **Assess:** determine whether identity documents, credentials or the database file were exposed; use `audit_logs`, request IDs and `document.accessed` entries.
4. **Rotate:** `SESSION_SECRET`, `ADMIN_BOOTSTRAP_TOKEN`, administrator passwords; remove leaked `.env` files.
5. **Recover:** restore a verified backup if integrity is in doubt, then verify storage and audit continuity.
6. **Notify:** follow the chapter's data-protection obligations for applicant PII. The application does not send notifications.

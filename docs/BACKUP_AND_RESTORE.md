# Backup and restore

SQLite plus private uploads means a database-only dump is not a valid backup. The built-in backup captures both, plus a manifest that lets a restore prove what it is restoring.

## 1. What a backup contains

```
BACKUP_DIR/<YYYYMMDD-HHMMSS>[-N]/
├── database.sqlite     Consistent SQLite snapshot (online backup API, WAL-safe)
├── uploads/            Private documents, same date-sharded layout, .tmp excluded
└── manifest.json       Checksums, integrity result, migrations and counts
```

`manifest.json` records:

```json
{
  "application": "esme-recruitment-os",
  "createdAt": "2026-10-29T18:42:11.000Z",
  "database": { "file": "database.sqlite", "sizeBytes": 0, "sha256": "…", "integrity": "ok" },
  "migrations": ["001_init"],
  "documents": { "rows": 0 },
  "uploads": { "directory": "uploads", "files": 0, "bytes": 0 }
}
```

- The database snapshot is taken with SQLite's backup API, so it is consistent even with WAL active.
- `integrity_check` and `foreign_key_check` run against the copied database and are recorded in the manifest; the CLI prints the result so a damaged snapshot is visible immediately.
- Existing backup directories are never overwritten; a collision gets a `-2`, `-3` suffix.
- Backups are **unencrypted** by the application. Encrypt them at rest and restrict access; a backup contains the same PII and identity documents as production.

## 2. Creating a backup

```bash
npm run db:backup
# or, with the compiled CLI and no tsx dependency:
node apps/api/dist/cli/backup.js
```

Output includes the directory, database size and integrity, document rows and upload file count. A non-`ok` integrity value means the SQLite snapshot is already damaged; investigate before relying on it.

Schedule recommendations:

- At least daily during an open cycle, and before every deploy, migration or bulk change.
- More frequently (every few hours) near a deadline or during heavy review.
- Copy each backup **off the API host** (object storage, another server or an encrypted archive) — a backup on the same disk does not survive disk loss.
- Retain according to policy; rotate old copies deliberately.

Avoid running a backup at the same moment as retention cleanup or a restore. Upload files are copied after the database snapshot, so a concurrent deletion can leave a referenced file missing from the copy. Normal submissions are safe: a file is written before its row is committed.

## 3. Verifying a backup

```bash
npm run storage:verify    # live system: integrity, storage reconciliation, counts
```

To verify a backup before trusting it, restore it into a scratch `APP_DATA_DIR` (see §4) and run `storage:verify` against that directory. `verifyBackupDirectory` is also invoked automatically by restore and checks:

- `manifest.json` and `database.sqlite` exist;
- `PRAGMA integrity_check` returns `ok`;
- the database SHA-256 matches the manifest (when present).

## 4. Restore

**Restore is destructive.** It replaces the target database and the entire uploads directory. Stop the API first.

```bash
# 1. Stop the API service (systemd example)
sudo systemctl stop esme-api

# 2. Restore into the configured APP_DATA_DIR
npm run db:restore -- --from /path/to/backup --yes

# Replacing an existing database/uploads requires --force
npm run db:restore -- --from /path/to/backup --yes --force
```

Without `--force`, restore refuses when the target database already exists. Restore then:

1. verifies the manifest and checksum;
2. removes `database.sqlite`, `-wal` and `-shm` from the target;
3. copies the backup database;
4. deletes and recreates the uploads directory, then copies the backup uploads;
5. opens the restored database read-only and runs `integrity_check`;
6. reports document rows and upload file count.

After restoring:

```bash
npm run storage:verify      # expect no missing files and no problems
sudo systemctl start esme-api
```

Then sign in, confirm the dashboard totals, open an application, download a document and check the audit log before reopening submissions.

### Rehearsal without touching production

Restore into a separate directory by overriding the data paths:

```bash
APP_DATA_DIR=/tmp/esme-restore \
DATABASE_PATH=/tmp/esme-restore/db/esme-recruitment.sqlite \
PRIVATE_UPLOADS_DIR=/tmp/esme-restore/uploads \
BACKUP_DIR=/tmp/esme-restore/backups \
  npm run db:restore -- --from /path/to/backup --yes
```

This is the recommended quarterly drill. A backup that has never been restored is an assumption, not a recovery plan.

## 5. Disaster recovery targets

| Metric | Suggested target | How |
| --- | --- | --- |
| RPO (data loss) | 1 hour during a cycle | Hourly backup + off-server copy. |
| RTO (downtime) | < 1 hour | Pre-provisioned host, documented restore, tested backup location. |
| Retention | Per policy | Keep daily/weekly/monthly generations; delete expired copies securely. |

Adjust to the chapter's actual tolerance. The application does not schedule backups itself; use cron, systemd timers or the hosting scheduler.

Example cron entry:

```cron
15 * * * * cd /opt/esme && /usr/bin/node apps/api/dist/cli/backup.js >> /var/log/esme-backup.log 2>&1
```

Add an off-server sync step after the backup and alert if it fails. Monitor free disk space: each backup duplicates the database and all uploads, so storage grows by roughly the full data size per generation until old backups are pruned.

## 6. Key and credential recovery

- **Lost Super Admin password:** `npm run admin:bootstrap -- --reset <email> --email <email>` with `ADMIN_BOOTSTRAP_TOKEN`; revokes sessions and audits the reset.
- **Suspected session compromise:** reset the administrator's password (revokes sessions) or deactivate the account. Clearing `admin_sessions` invalidates every session.
- **Leaked `SESSION_SECRET`:** replace it, restart the API, and reset administrator passwords to revoke sessions. Session ids are random and hashed directly, so the secret is not the only protection, but treat leakage as an incident.
- **Lost bootstrap token:** change `ADMIN_BOOTSTRAP_TOKEN` in the environment and restart; the CLI compares against the running configuration.
- **Database corruption:** stop the API, keep the damaged files for forensics, restore the most recent verified backup, run `storage:verify`.

## 7. Limitations

- No point-in-time recovery within the backup interval; RPO equals the backup cadence.
- No incremental backups; each generation is a full copy of the database and uploads.
- The application does not encrypt, upload or prune backups. Encryption, off-site transfer and retention are operator responsibilities.
- Restore is whole-system only: it cannot merge a single application or document back into a running database.

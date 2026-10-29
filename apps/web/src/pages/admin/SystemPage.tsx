import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Database,
  HardDrive,
  RefreshCw,
  Server,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import type { SystemDiagnosticsDTO } from '@esme/shared';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { CardSkeleton, SkeletonText } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../auth/AuthProvider';
import { api, ApiError } from '../../lib/api';
import { useDocumentTitle } from '../../lib/hooks';
import { formatBytes, formatDateTime, relativeTime } from '../../lib/format';
import { cn } from '../../lib/cn';

interface RetentionPreview {
  enabled: boolean;
  cutoff: string | null;
  applications: { id: number; reference: string; status: string; decidedAt: string | null }[];
  documentCount: number;
  applicantCount: number;
  totalApplications: number;
}

function StatusPill({ ok, okLabel, failLabel }: { ok: boolean; okLabel: string; failLabel: string }) {
  return (
    <Badge tone={ok ? 'success' : 'danger'} dot>
      {ok ? okLabel : failLabel}
    </Badge>
  );
}

function Metric({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'warning' | 'danger';
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-4',
        tone === 'default' && 'border-line bg-white',
        tone === 'warning' && 'border-warning-100 bg-warning-50',
        tone === 'danger' && 'border-danger-100 bg-danger-50',
      )}
    >
      <p className="text-2xs font-semibold uppercase tracking-[0.1em] text-muted">{label}</p>
      <p className="mt-1.5 font-display text-2xl font-semibold text-navy-900">{value}</p>
      {hint ? <p className="mt-1 text-2xs leading-relaxed text-muted">{hint}</p> : null}
    </div>
  );
}

export function SystemPage() {
  useDocumentTitle('System & backups · ESME Recruitment');
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = useAuth();

  const query = useQuery<SystemDiagnosticsDTO>({
    queryKey: ['admin', 'system'],
    queryFn: () => api.system(),
    refetchOnWindowFocus: false,
  });

  const [backupResult, setBackupResult] = useState<{
    createdAt: string;
    databaseBytes: number;
    documentRows: number;
    uploadFiles: number;
    integrity: string;
  } | null>(null);

  const [preview, setPreview] = useState<RetentionPreview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const backupMutation = useMutation({
    mutationFn: () => api.createBackup(),
    onSuccess: async (result) => {
      setBackupResult(result);
      toast.success('Backup created', 'Database, uploaded documents and checksums were written to the backup directory.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'system'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'audit-logs'] }),
      ]);
    },
    onError: (error) => {
      toast.error('Backup failed', error instanceof ApiError ? error.message : 'Check server logs and try again.');
    },
  });

  const previewMutation = useMutation({
    mutationFn: () => api.previewRetention(),
    onSuccess: (result) => {
      setPreview(result);
      setPreviewOpen(true);
      setActionError(null);
    },
    onError: (error) => {
      toast.error('Preview failed', error instanceof ApiError ? error.message : 'Try again.');
    },
  });

  const cleanupMutation = useMutation({
    mutationFn: () => api.cleanupRetention(confirmText),
    onSuccess: async (result) => {
      setCleanupOpen(false);
      setConfirmText('');
      setPreview(null);
      toast.success(
        'Retention cleanup completed',
        `${result.deletedApplications} application(s), ${result.deletedDocuments} document(s) and ${result.deletedFiles} file(s) were deleted.`,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'system'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'applications'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'audit-logs'] }),
      ]);
    },
    onError: (error) => {
      setActionError(error instanceof ApiError ? error.message : 'Cleanup failed.');
    },
  });

  if (query.isLoading) {
    return (
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
        <div className="card p-6">
          <SkeletonText lines={6} />
        </div>
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="card p-8 text-center">
        <p className="text-sm font-semibold text-navy-900">System diagnostics could not be loaded</p>
        <p className="mt-1 text-xs text-muted">
          {query.error instanceof ApiError ? query.error.message : 'Check the API connection.'}
        </p>
        <Button className="mt-4" variant="outline" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const data = query.data;
  const storageProblem =
    !data.storage.ready ||
    !data.storage.writable ||
    data.reconciliation.missingFiles.length > 0;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administration"
        title="System & backups"
        description="Storage health, database migrations, integrity checks and retention tooling. All actions here are audited."
        actions={
          <>
            <Button variant="outline" onClick={() => void query.refetch()} isLoading={query.isFetching}>
              <RefreshCw className="h-4 w-4" aria-hidden />
              Refresh
            </Button>
            <Button onClick={() => backupMutation.mutate()} isLoading={backupMutation.isPending}>
              <Archive className="h-4 w-4" aria-hidden />
              Create backup
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Database"
          value={formatBytes(data.database.sizeBytes)}
          hint={`SQLite · WAL mode · ${data.database.ok ? 'responsive' : 'not responding'}`}
          tone={data.database.ok ? 'default' : 'danger'}
        />
        <Metric
          label="Private documents"
          value={data.storage.documentCount.toLocaleString()}
          hint={`${formatBytes(data.storage.totalBytes)} stored on the private filesystem`}
          tone={storageProblem ? 'warning' : 'default'}
        />
        <Metric
          label="Applications"
          value={data.counts.applications.toLocaleString()}
          hint="Across all recruitment cycles"
        />
        <Metric
          label="Audit entries"
          value={data.counts.auditEntries.toLocaleString()}
          hint="Append-only; updates and deletes are blocked by triggers"
        />
      </div>

      {backupResult ? (
        <div className="card border-success-100 bg-success-50/40 p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success-600" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-navy-900">Backup completed</p>
              <p className="mt-1 text-xs text-muted">
                {formatDateTime(backupResult.createdAt)} · {relativeTime(backupResult.createdAt)} · integrity{' '}
                <span className="font-mono text-navy-800">{backupResult.integrity}</span>
              </p>
              <p className="mt-1.5 text-2xs leading-relaxed text-navy-700">
                {formatBytes(backupResult.databaseBytes)} database · {backupResult.documentRows} document record(s) ·{' '}
                {backupResult.uploadFiles} file(s). The backup includes a manifest with SHA-256 checksums.
              </p>
              <p className="mt-2 text-2xs text-muted">
                Server-local copy only. Copy it off the server according to the backup runbook.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setBackupResult(null)}
              className="ml-auto shrink-0 text-2xs font-semibold text-success-700 hover:underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="card p-5 sm:p-6" aria-labelledby="infrastructure">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-ember-600" aria-hidden />
            <h2 id="infrastructure" className="font-display text-lg font-semibold text-navy-900">
              Infrastructure
            </h2>
          </div>
          <dl className="mt-4 space-y-3 text-xs">
            <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
              <dt className="inline-flex items-center gap-2 text-muted">
                <Database className="h-3.5 w-3.5" aria-hidden /> SQLite database
              </dt>
              <dd>
                <StatusPill ok={data.database.ready && data.database.ok} okLabel="Ready" failLabel="Problem" />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
              <dt className="inline-flex items-center gap-2 text-muted">
                <HardDrive className="h-3.5 w-3.5" aria-hidden /> Private storage mounted
              </dt>
              <dd>
                <StatusPill ok={data.storage.ready} okLabel="Ready" failLabel="Missing" />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
              <dt className="inline-flex items-center gap-2 text-muted">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Storage writable
              </dt>
              <dd>
                <StatusPill ok={data.storage.writable} okLabel="Writable" failLabel="Read-only" />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="inline-flex items-center gap-2 text-muted">
                <Archive className="h-3.5 w-3.5" aria-hidden /> Backup directory
              </dt>
              <dd>
                <Badge tone="neutral">Configured on server</Badge>
              </dd>
            </div>
          </dl>
          <p className="mt-4 rounded-lg bg-navy-900/[0.03] p-3 text-2xs leading-relaxed text-muted">
            Backups are written to the private server directory configured by <code className="font-mono">BACKUP_DIR</code>.
            They are not downloadable from this dashboard and must be copied off-server by an operator.
          </p>
        </section>

        <section className="card p-5 sm:p-6" aria-labelledby="reconciliation">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-ember-600" aria-hidden />
            <h2 id="reconciliation" className="font-display text-lg font-semibold text-navy-900">
              Integrity
            </h2>
          </div>
          <div className="mt-4 space-y-3">
            {data.reconciliation.missingFiles.length > 0 ? (
              <div className="rounded-xl border border-danger-100 bg-danger-50 p-3.5">
                <p className="inline-flex items-center gap-2 text-xs font-semibold text-danger-700">
                  <XCircle className="h-4 w-4" aria-hidden />
                  {data.reconciliation.missingFiles.length} document file(s) missing
                </p>
                <ul className="mt-2 space-y-1 text-2xs text-danger-700">
                  {data.reconciliation.missingFiles.slice(0, 8).map((file) => (
                    <li key={file.documentId} className="font-mono">
                      #{file.documentId} · {file.type}
                    </li>
                  ))}
                </ul>
                {data.reconciliation.missingFiles.length > 8 ? (
                  <p className="mt-1 text-2xs text-danger-700">and {data.reconciliation.missingFiles.length - 8} more…</p>
                ) : null}
                <p className="mt-2 text-2xs leading-relaxed text-danger-700">
                  Restore the affected files from the most recent backup or contact the system operator before
                  relying on these applications.
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-xl border border-success-100 bg-success-50 p-3.5 text-2xs leading-relaxed text-success-700">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                Every active document row has a file on disk.
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-line p-3">
                <p className="text-2xs uppercase tracking-[0.1em] text-muted">Orphaned files</p>
                <p className="mt-1 text-lg font-semibold text-navy-900">{data.reconciliation.orphanedFiles}</p>
              </div>
              <div className="rounded-xl border border-line p-3">
                <p className="text-2xs uppercase tracking-[0.1em] text-muted">Temp files</p>
                <p className="mt-1 text-lg font-semibold text-navy-900">{data.reconciliation.orphanedTemporary}</p>
              </div>
            </div>
            <p className="text-2xs leading-relaxed text-muted">
              Orphaned files are not referenced by any document row. Inspect them with the storage verification
              script before removing anything manually.
            </p>
          </div>
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="card p-5 sm:p-6" aria-labelledby="migrations">
          <h2 id="migrations" className="font-display text-lg font-semibold text-navy-900">
            Applied migrations
          </h2>
          <p className="mt-1 text-xs text-muted">Migrations run once, in order, and are checksum-verified on startup.</p>
          <ol className="mt-4 space-y-2">
            {data.migrations.map((migration) => (
              <li
                key={migration.version}
                className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-xs"
              >
                <span className="inline-flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success-600" aria-hidden />
                  <span className="font-mono text-navy-900">{migration.version}</span>
                </span>
                <span className="text-2xs text-muted">{formatDateTime(migration.appliedAt)}</span>
              </li>
            ))}
            {data.migrations.length === 0 ? (
              <li className="rounded-lg border border-dashed border-line p-3 text-xs text-muted">
                No migrations have been recorded.
              </li>
            ) : null}
          </ol>
        </section>

        {can('retention.manage') ? (
          <section className="card p-5 sm:p-6" aria-labelledby="retention">
            <div className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-ember-600" aria-hidden />
              <h2 id="retention" className="font-display text-lg font-semibold text-navy-900">
                Data retention
              </h2>
            </div>
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill ok={data.retention.enabled} okLabel="Cleanup enabled" failLabel="Cleanup disabled" />
                <Badge tone="neutral">{data.retention.days} day retention</Badge>
                <Badge tone={data.retention.eligibleApplications > 0 ? 'warning' : 'success'} dot>
                  {data.retention.eligibleApplications} eligible
                </Badge>
              </div>
              <p className="text-2xs leading-relaxed text-muted">
                Eligibility is measured from the date of a final decision. Preview is required before cleanup, and
                the deletion must be confirmed by typing <strong className="text-navy-800">DELETE</strong>.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => previewMutation.mutate()}
                  isLoading={previewMutation.isPending}
                >
                  Preview eligible data
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={!data.retention.enabled || data.retention.eligibleApplications === 0}
                  onClick={() => {
                    setActionError(null);
                    setCleanupOpen(true);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Run cleanup
                </Button>
              </div>
              {!data.retention.enabled ? (
                <p className="rounded-lg bg-navy-900/[0.03] p-3 text-2xs leading-relaxed text-muted">
                  Retention cleanup is disabled. Enable it in Settings before it can run.
                </p>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>

      <div className="card flex items-start gap-3 p-4 text-2xs leading-relaxed text-muted">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-600" aria-hidden />
        <p>
          This application does not manage the web server, TLS certificates or process supervision. Use the
          deployment runbook for those tasks. The health endpoint at <code className="font-mono">/api/v1/health</code>{' '}
          reports database and storage readiness for external monitoring.
        </p>
      </div>

      <Modal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        size="lg"
        title="Retention preview"
        description="Nothing is deleted by this preview. Review the eligible applications and documents before cleanup."
        footer={
          <>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              Close
            </Button>
            <Button
              variant="danger"
              disabled={!preview || preview.applications.length === 0 || !preview.enabled}
              onClick={() => {
                setActionError(null);
                setCleanupOpen(true);
                setPreviewOpen(false);
              }}
            >
              Continue to cleanup
            </Button>
          </>
        }
      >
        {preview ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-line p-3">
                <p className="text-2xs text-muted">Applications</p>
                <p className="text-lg font-semibold text-navy-900">{preview.applications.length}</p>
              </div>
              <div className="rounded-lg border border-line p-3">
                <p className="text-2xs text-muted">Documents</p>
                <p className="text-lg font-semibold text-navy-900">{preview.documentCount}</p>
              </div>
              <div className="rounded-lg border border-line p-3">
                <p className="text-2xs text-muted">Applicants</p>
                <p className="text-lg font-semibold text-navy-900">{preview.applicantCount}</p>
              </div>
              <div className="rounded-lg border border-line p-3">
                <p className="text-2xs text-muted">Total records</p>
                <p className="text-lg font-semibold text-navy-900">{preview.totalApplications}</p>
              </div>
            </div>
            <p className="text-xs text-muted">
              Cutoff: {preview.cutoff ? formatDateTime(preview.cutoff) : 'Not available'} ·{' '}
              {preview.enabled ? 'Retention cleanup is enabled.' : 'Retention cleanup is disabled; deletion is refused.'}
            </p>
            {preview.applications.length > 0 ? (
              <div className="max-h-64 overflow-y-auto rounded-lg border border-line">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Reference</th>
                      <th>Status</th>
                      <th>Decided</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.applications.map((application) => (
                      <tr key={application.id}>
                        <td className="font-mono text-2xs text-navy-800">{application.reference}</td>
                        <td className="text-xs text-navy-700">{application.status}</td>
                        <td className="text-xs text-navy-700">{formatDateTime(application.decidedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-line p-4 text-xs text-muted">
                No applications are eligible under the current retention settings.
              </p>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={cleanupOpen}
        onOpenChange={(open) => {
          setCleanupOpen(open);
          if (!open) {
            setConfirmText('');
            setActionError(null);
          }
        }}
        title="Run retention cleanup"
        description="This permanently deletes eligible applications, their notes, status history, document records and stored files. It cannot be undone."
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setCleanupOpen(false);
                setConfirmText('');
              }}
              disabled={cleanupMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={confirmText !== 'DELETE'}
              isLoading={cleanupMutation.isPending}
              onClick={() => cleanupMutation.mutate()}
            >
              Delete permanently
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {actionError ? (
            <p role="alert" className="rounded-lg border border-danger-100 bg-danger-50 p-3 text-xs font-medium text-danger-700">
              {actionError}
            </p>
          ) : null}
          <div className="rounded-lg border border-warning-100 bg-warning-50 p-3 text-2xs leading-relaxed text-warning-700">
            Create a backup first if you might need these records. The cleanup is recorded in the audit log with
            counts only.
          </div>
          <label className="block">
            <span className="field-label">Type DELETE to confirm</span>
            <input
              className="input font-mono"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder="DELETE"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        </div>
      </Modal>
    </div>
  );
}

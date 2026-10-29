import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FilterX, ScrollText, Search, ShieldCheck } from 'lucide-react';
import type { AuditListDTO } from '@esme/shared';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { Pagination } from '../../components/ui/Pagination';
import { Avatar } from '../../components/ui/Avatar';
import { api, ApiError } from '../../lib/api';
import { useDebouncedValue, useDocumentTitle } from '../../lib/hooks';
import { formatDateTime, humanizeAction, relativeTime } from '../../lib/format';

const PAGE_SIZE = 50;

const commonActions = [
  'auth.login_success',
  'auth.login_failed',
  'auth.logout',
  'auth.password_changed',
  'application.status_changed',
  'application.note_added',
  'application.assigned',
  'document.accessed',
  'export.created',
  'settings.updated',
  'department.created',
  'department.updated',
  'cycle.created',
  'cycle.updated',
  'cycle.activated',
  'administrator.created',
  'administrator.updated',
  'administrator.password_reset',
  'backup.created',
  'retention.previewed',
  'retention.cleaned',
];

export function AuditLogPage() {
  useDocumentTitle('Audit log · ESME Recruitment');
  const [params, setParams] = useSearchParams();

  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);
  const action = params.get('action') ?? '';
  const actorId = params.get('actor') ?? '';

  const [actionDraft, setActionDraft] = useState(action);
  const debouncedAction = useDebouncedValue(actionDraft, 350);

  const updateParams = useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === '') next.delete(key);
        else next.set(key, value);
      }
      if (!('page' in patch)) next.delete('page');
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  useEffect(() => {
    if (debouncedAction === action) return;
    updateParams({ action: debouncedAction.trim() || undefined });
  }, [debouncedAction, action, updateParams]);

  const query = useQuery({
    queryKey: ['admin', 'audit-logs', page, action, actorId],
    queryFn: () =>
      api.auditLogs({
        page,
        pageSize: PAGE_SIZE,
        action: action || undefined,
        actorId: actorId ? Number(actorId) : undefined,
      }),
    placeholderData: keepPreviousData,
  });

  const adminsQuery = useQuery({
    queryKey: ['admin', 'administrators'],
    queryFn: () => api.getAdministrators(),
    staleTime: 5 * 60_000,
  });

  const data: AuditListDTO | undefined = query.data;
  const filtersActive = Boolean(action || actorId);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administration"
        title="Audit log"
        description="An append-only record of sign-ins, decisions, document access, settings changes and exports. Entries cannot be edited or deleted from the application."
      />

      <div className="card p-4 sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <label className="block">
            <span className="mb-1 block text-2xs font-semibold uppercase tracking-[0.1em] text-muted">
              Exact action
            </span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted" aria-hidden />
              <input
                list="audit-actions"
                className="input h-10 pl-9 text-[13px]"
                value={actionDraft}
                onChange={(event) => setActionDraft(event.target.value)}
                placeholder="e.g. application.status_changed"
              />
              <datalist id="audit-actions">
                {commonActions.map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-2xs font-semibold uppercase tracking-[0.1em] text-muted">
              Administrator
            </span>
            <select
              className="select h-10 text-[13px]"
              value={actorId}
              onChange={(event) => updateParams({ actor: event.target.value })}
            >
              <option value="">All administrators</option>
              {(adminsQuery.data?.items ?? []).map((admin) => (
                <option key={admin.id} value={String(admin.id)}>
                  {admin.displayName}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            {filtersActive ? (
              <Button
                variant="outline"
                onClick={() => {
                  setActionDraft('');
                  setParams(new URLSearchParams(), { replace: true });
                }}
              >
                <FilterX className="h-4 w-4" aria-hidden />
                Clear
              </Button>
            ) : null}
          </div>
        </div>
        <p className="mt-3 border-t border-line pt-3 text-2xs text-muted">
          The action filter is an exact match. Use the suggestions or copy a value from an entry below.
        </p>
      </div>

      {query.isLoading ? (
        <TableSkeleton rows={10} columns={4} />
      ) : query.isError ? (
        <div className="card p-8 text-center">
          <p className="text-sm font-semibold text-navy-900">Audit log could not be loaded</p>
          <p className="mt-1 text-xs text-muted">
            {query.error instanceof ApiError ? query.error.message : 'Check the API connection.'}
          </p>
          <Button className="mt-4" variant="outline" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={filtersActive ? Search : ScrollText}
          title={filtersActive ? 'No entries match this filter' : 'No audit entries yet'}
          description={
            filtersActive
              ? 'Try a different exact action value or clear the filters.'
              : 'Administrative activity will appear here as soon as it happens.'
          }
          action={
            filtersActive ? (
              <Button
                variant="outline"
                onClick={() => {
                  setActionDraft('');
                  setParams(new URLSearchParams(), { replace: true });
                }}
              >
                Clear filters
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <div className="table-shell overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="w-44">When</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th className="w-16">Details</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((entry) => (
                  <tr key={entry.id} className="align-top">
                    <td className="whitespace-nowrap">
                      <p className="text-xs text-navy-800">{formatDateTime(entry.createdAt)}</p>
                      <p className="text-2xs text-muted">{relativeTime(entry.createdAt)}</p>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <Avatar name={entry.actor?.displayName ?? 'System'} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-navy-900">
                            {entry.actor?.displayName ?? 'System'}
                          </p>
                          <p className="text-2xs text-muted">{entry.actor ? `ID ${entry.actor.id}` : 'No actor'}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <p className="text-xs font-medium text-navy-900">{humanizeAction(entry.action)}</p>
                      <button
                        type="button"
                        className="mt-0.5 font-mono text-2xs text-muted transition hover:text-ember-700"
                        onClick={() => {
                          setActionDraft(entry.action);
                          updateParams({ action: entry.action });
                        }}
                        title="Filter by this action"
                      >
                        {entry.action}
                      </button>
                    </td>
                    <td className="text-xs text-navy-700">
                      <p>{entry.entityType}</p>
                      {entry.entityId ? <p className="font-mono text-2xs text-muted">#{entry.entityId}</p> : null}
                    </td>
                    <td>
                      {entry.metadata ? (
                        <details className="text-2xs">
                          <summary className="cursor-pointer font-semibold text-navy-800 hover:text-ember-700">
                            View
                          </summary>
                          <pre className="mt-2 max-h-48 max-w-xs overflow-auto rounded-lg bg-navy-950 p-2.5 text-[10px] leading-relaxed text-navy-100">
                            {JSON.stringify(entry.metadata, null, 2)}
                          </pre>
                        </details>
                      ) : (
                        <span className="text-2xs text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Pagination
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              itemLabel="entries"
              onPageChange={(nextPage) => updateParams({ page: String(nextPage) })}
            />
          </div>

          <div className="card flex items-start gap-3 p-4 text-2xs leading-relaxed text-muted">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success-600" aria-hidden />
            <p>
              Audit rows are protected by database triggers that reject updates and deletes. Sensitive values such as
              passwords, session tokens and document contents are never recorded.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

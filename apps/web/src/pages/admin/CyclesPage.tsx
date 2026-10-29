import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  Pencil,
  Plus,
  Users,
} from 'lucide-react';
import {
  CYCLE_STATUSES,
  type CycleDTO,
  type CycleStatus,
} from '@esme/shared';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge, CycleStatusBadge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/EmptyState';
import { CardSkeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { api, ApiError } from '../../lib/api';
import { useDocumentTitle } from '../../lib/hooks';
import { formatDateTime, formatDateTimeWithZone, fromLocalInputValue, toLocalInputValue } from '../../lib/format';
import { cn } from '../../lib/cn';

interface CycleForm {
  name: string;
  status: CycleStatus;
  opensAt: string;
  closesAt: string;
  privacyPolicyVersion: string;
}

const emptyForm: CycleForm = {
  name: '',
  status: 'draft',
  opensAt: '',
  closesAt: '',
  privacyPolicyVersion: '',
};

const statusHints: Record<CycleStatus, string> = {
  draft: 'Hidden from applicants. Prepare the cycle before opening.',
  open: 'Applications are accepted while the current cycle is open and inside its dates.',
  closed: 'The public form is closed. Existing applications remain reviewable.',
  archived: 'Kept for records. Applications stay available to administrators.',
};

export function CyclesPage() {
  useDocumentTitle('Recruitment cycles · ESME Recruitment');
  const toast = useToast();
  const queryClient = useQueryClient();

  const cyclesQuery = useQuery({
    queryKey: ['admin', 'cycles'],
    queryFn: () => api.getCycles(),
  });

  const configQuery = useQuery({
    queryKey: ['public', 'config'],
    queryFn: ({ signal }) => api.getPublicConfig(signal),
    staleTime: 60_000,
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CycleDTO | null>(null);
  const [form, setForm] = useState<CycleForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!modalOpen) return;
    if (editing) {
      setForm({
        name: editing.name,
        status: editing.status,
        opensAt: toLocalInputValue(editing.opensAt),
        closesAt: toLocalInputValue(editing.closesAt),
        privacyPolicyVersion: editing.privacyPolicyVersion,
      });
    } else {
      setForm({ ...emptyForm, privacyPolicyVersion: configQuery.data?.privacy.version ?? '' });
    }
    setFormError(null);
  }, [modalOpen, editing, configQuery.data?.privacy.version]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        status: form.status,
        opensAt: fromLocalInputValue(form.opensAt),
        closesAt: fromLocalInputValue(form.closesAt),
        privacyPolicyVersion: form.privacyPolicyVersion.trim() || undefined,
      };
      if (payload.name.length < 2) throw new ApiError(0, 'validation', 'Give the cycle a name.');
      if (payload.opensAt && payload.closesAt && new Date(payload.opensAt) >= new Date(payload.closesAt)) {
        throw new ApiError(0, 'validation', 'The opening time must be before the closing time.');
      }
      return editing ? api.updateCycle(editing.id, payload) : api.createCycle(payload);
    },
    onSuccess: async () => {
      setModalOpen(false);
      toast.success(editing ? 'Cycle updated' : 'Cycle created', 'Changes are applied to the public site immediately.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'cycles'] }),
        queryClient.invalidateQueries({ queryKey: ['public', 'config'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] }),
      ]);
    },
    onError: (error) => {
      setFormError(error instanceof ApiError ? error.message : 'The cycle could not be saved.');
    },
  });

  const activateMutation = useMutation({
    mutationFn: (id: number) => api.activateCycle(id),
    onSuccess: async () => {
      toast.success('Current cycle changed', 'The public form and new applications now use this cycle.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'cycles'] }),
        queryClient.invalidateQueries({ queryKey: ['public', 'config'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] }),
      ]);
    },
    onError: (error) => {
      toast.error('Cycle could not be activated', error instanceof ApiError ? error.message : 'Try again.');
    },
  });

  const currentCycleId = configQuery.data?.recruitment.cycleId ?? null;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Recruitment"
        title="Recruitment cycles"
        description="Each cycle groups the applications submitted during one recruitment window. Only the current cycle is used by the public form."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden />
            New cycle
          </Button>
        }
      />

      {cyclesQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : cyclesQuery.isError ? (
        <div className="card p-8 text-center">
          <p className="text-sm font-semibold text-navy-900">Cycles could not be loaded</p>
          <p className="mt-1 text-xs text-muted">
            {cyclesQuery.error instanceof ApiError ? cyclesQuery.error.message : 'Check the API connection.'}
          </p>
          <Button className="mt-4" variant="outline" onClick={() => void cyclesQuery.refetch()}>
            Retry
          </Button>
        </div>
      ) : (cyclesQuery.data?.items.length ?? 0) === 0 ? (
        <EmptyState
          icon={CalendarPlus}
          title="No recruitment cycles yet"
          description="Create a cycle, set its dates and open it when you are ready to accept applications."
          action={
            <Button
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Create the first cycle
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {[...(cyclesQuery.data?.items ?? [])]
            .sort((a, b) => b.id - a.id)
            .map((cycle) => {
              const isCurrent = cycle.id === currentCycleId;
              return (
                <article
                  key={cycle.id}
                  className={cn(
                    'card p-5 sm:p-6',
                    isCurrent && 'ring-2 ring-ember-500/70',
                  )}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-display text-lg font-semibold text-navy-900">{cycle.name}</h2>
                        <CycleStatusBadge status={cycle.status} />
                        {isCurrent ? (
                          <Badge tone="accent" dot>
                            Current cycle
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-muted">
                        {statusHints[cycle.status]}
                      </p>
                      <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                          <dt className="text-2xs font-semibold uppercase tracking-[0.1em] text-muted">Opens</dt>
                          <dd className="mt-0.5 text-navy-900">
                            {cycle.opensAt ? formatDateTime(cycle.opensAt) : 'Not set'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-2xs font-semibold uppercase tracking-[0.1em] text-muted">Closes</dt>
                          <dd className="mt-0.5 text-navy-900">{formatDateTime(cycle.closesAt) || 'No deadline'}</dd>
                        </div>
                        <div>
                          <dt className="text-2xs font-semibold uppercase tracking-[0.1em] text-muted">Applications</dt>
                          <dd className="mt-0.5 inline-flex items-center gap-1.5 text-navy-900">
                            <Users className="h-3.5 w-3.5 text-muted" aria-hidden />
                            {cycle.applicationCount.toLocaleString()}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-2xs font-semibold uppercase tracking-[0.1em] text-muted">Privacy version</dt>
                          <dd className="mt-0.5 font-mono text-navy-900">{cycle.privacyPolicyVersion}</dd>
                        </div>
                      </dl>
                      <p className="mt-3 text-2xs text-muted">
                        Created {formatDateTimeWithZone(cycle.createdAt, 'Africa/Cairo')} · last updated{' '}
                        {formatDateTime(cycle.updatedAt)}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      {!isCurrent ? (
                        <Button
                          variant="outline"
                          size="sm"
                          isLoading={activateMutation.isPending && activateMutation.variables === cycle.id}
                          onClick={() => activateMutation.mutate(cycle.id)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                          Make current
                        </Button>
                      ) : null}
                      <Button
                        variant="subtle"
                        size="sm"
                        onClick={() => {
                          setEditing(cycle);
                          setModalOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                        Edit
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
        </div>
      )}

      <div className="card flex items-start gap-3 p-4 text-xs leading-relaxed text-muted">
        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-ember-600" aria-hidden />
        <p>
          The public form is open only when the current cycle status is <strong className="text-navy-800">Open</strong>{' '}
          and the current time is inside the opening and closing window. If a cycle has no dates, the deadline in
          Settings is used as a fallback.
        </p>
      </div>

      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={editing ? 'Edit recruitment cycle' : 'New recruitment cycle'}
        description="Cycle dates and status control whether the public application form accepts submissions."
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saveMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={() => saveMutation.mutate()} isLoading={saveMutation.isPending}>
              {editing ? 'Save changes' : 'Create cycle'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError ? (
            <p role="alert" className="rounded-lg border border-danger-100 bg-danger-50 p-3 text-xs font-medium text-danger-700">
              {formError}
            </p>
          ) : null}
          <label className="block">
            <span className="field-label">Cycle name</span>
            <input
              className="input"
              value={form.name}
              maxLength={80}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Fall 2026 Recruitment"
            />
          </label>
          <label className="block">
            <span className="field-label">Status</span>
            <select
              className="select"
              value={form.status}
              onChange={(event) =>
                setForm((current) => ({ ...current, status: event.target.value as CycleStatus }))
              }
            >
              {CYCLE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </option>
              ))}
            </select>
            <span className="field-hint">{statusHints[form.status]}</span>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="field-label">Opens at (local time)</span>
              <input
                type="datetime-local"
                className="input"
                value={form.opensAt}
                onChange={(event) => setForm((current) => ({ ...current, opensAt: event.target.value }))}
              />
              <span className="field-hint">Leave empty to open immediately.</span>
            </label>
            <label className="block">
              <span className="field-label">Closes at (local time)</span>
              <input
                type="datetime-local"
                className="input"
                value={form.closesAt}
                onChange={(event) => setForm((current) => ({ ...current, closesAt: event.target.value }))}
              />
              <span className="field-hint">Leave empty to inherit the Settings deadline.</span>
            </label>
          </div>
          <label className="block">
            <span className="field-label">Privacy policy version</span>
            <input
              className="input"
              value={form.privacyPolicyVersion}
              maxLength={60}
              onChange={(event) =>
                setForm((current) => ({ ...current, privacyPolicyVersion: event.target.value }))
              }
              placeholder="2026-01"
            />
            <span className="field-hint">
              Stored on each application submitted during this cycle. Cannot be changed later in the submission record.
            </span>
          </label>
        </div>
      </Modal>
    </div>
  );
}

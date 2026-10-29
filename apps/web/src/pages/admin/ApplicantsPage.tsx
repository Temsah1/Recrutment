import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowRight,
  CheckSquare,
  ChevronRight,
  Download,
  FilterX,
  Inbox,
  Search,
} from 'lucide-react';
import {
  ACADEMIC_YEARS,
  APPLICATION_STATUSES,
  STATUS_LABELS,
  type ApplicationListDTO,
  type ApplicationStatus,
  type ApplicationSummaryDTO,
} from '@esme/shared';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button, buttonStyles } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { Pagination } from '../../components/ui/Pagination';
import { Avatar } from '../../components/ui/Avatar';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../auth/AuthProvider';
import { api, ApiError } from '../../lib/api';
import { useDebouncedValue, useDocumentTitle } from '../../lib/hooks';
import { formatDateTime, relativeTime } from '../../lib/format';
import { cn } from '../../lib/cn';
import { EASE, bezier } from '../../lib/motion';

const PAGE_SIZE = 20;

const sortOptions = [
  { value: 'newest', label: 'Newest first', sort: 'submitted_at', order: 'desc' },
  { value: 'oldest', label: 'Oldest first', sort: 'submitted_at', order: 'asc' },
  { value: 'name', label: 'Name A–Z', sort: 'full_name', order: 'asc' },
  { value: 'year', label: 'Academic year', sort: 'academic_year', order: 'asc' },
  { value: 'status', label: 'Status', sort: 'status', order: 'asc' },
] as const;

function FilterSelect({
  label,
  value,
  onChange,
  children,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1 block text-2xs font-semibold uppercase tracking-[0.1em] text-muted">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="select h-9 py-0 text-[13px]"
      >
        {children}
      </select>
    </label>
  );
}

function SelectionCheckbox({
  checked,
  onChange,
  label,
  indeterminate = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  indeterminate?: boolean;
}) {
  return (
    <input
      type="checkbox"
      className="checkbox"
      checked={checked}
      ref={(element) => {
        if (element) element.indeterminate = indeterminate && !checked;
      }}
      onChange={(event) => onChange(event.target.checked)}
      aria-label={label}
    />
  );
}

export function ApplicantsPage() {
  useDocumentTitle('Applicants · ESME Recruitment');
  const { can } = useAuth();
  const toast = useToast();
  const reduceMotion = useReducedMotion();
  const [params, setParams] = useSearchParams();

  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);
  const q = params.get('q') ?? '';
  const statusParam = params.get('status') ?? '';
  const status = (APPLICATION_STATUSES as readonly string[]).includes(statusParam)
    ? (statusParam as ApplicationStatus)
    : '';
  const departmentSlug = params.get('department') ?? '';
  const academicYear = params.get('year') ?? '';
  const cycleId = params.get('cycle') ?? '';
  const reviewerId = params.get('reviewer') ?? '';
  const unassigned = params.get('unassigned') === 'true';
  const sortValue = sortOptions.some((option) => option.value === params.get('sort'))
    ? (params.get('sort') as string)
    : 'newest';
  const sortOption = sortOptions.find((option) => option.value === sortValue) ?? sortOptions[0];

  const [searchDraft, setSearchDraft] = useState(q);
  const debouncedSearch = useDebouncedValue(searchDraft, 350);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<ApplicationStatus>('reviewing');
  const [bulkReason, setBulkReason] = useState('');
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);

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
    if (debouncedSearch === q) return;
    const next = new URLSearchParams(params);
    if (debouncedSearch) next.set('q', debouncedSearch);
    else next.delete('q');
    next.delete('page');
    setParams(next, { replace: true });
  }, [debouncedSearch, params, q, setParams]);

  useEffect(() => {
    setSelected(new Set());
  }, [page, q, status, departmentSlug, academicYear, cycleId, reviewerId, unassigned, sortValue]);

  const queryParams = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      q: q || undefined,
      status: status || undefined,
      departmentSlug: departmentSlug || undefined,
      academicYear: academicYear || undefined,
      cycleId: cycleId || undefined,
      reviewerId: reviewerId || undefined,
      unassigned: unassigned ? 'true' : undefined,
      sort: sortOption.sort,
      order: sortOption.order,
    }),
    [page, q, status, departmentSlug, academicYear, cycleId, reviewerId, unassigned, sortOption],
  );

  const applicationsQuery = useQuery({
    queryKey: ['admin', 'applications', queryParams],
    queryFn: ({ signal }) => api.applications(queryParams, signal),
    placeholderData: keepPreviousData,
  });

  const departmentsQuery = useQuery({
    queryKey: ['admin', 'departments'],
    queryFn: () => api.getDepartments(),
    staleTime: 5 * 60_000,
  });

  const cyclesQuery = useQuery({
    queryKey: ['admin', 'cycles'],
    queryFn: () => api.getCycles(),
    enabled: can('cycles.manage'),
  });

  const reviewersQuery = useQuery({
    queryKey: ['admin', 'reviewers'],
    queryFn: () => api.reviewers(),
    enabled: can('applications.assign'),
    staleTime: 5 * 60_000,
  });

  const data: ApplicationListDTO | undefined = applicationsQuery.data;
  const filtersActive = Boolean(q || status || departmentSlug || academicYear || cycleId || reviewerId || unassigned);

  function clearFilters() {
    setSearchDraft('');
    const next = new URLSearchParams();
    if (sortValue !== 'newest') next.set('sort', sortValue);
    setParams(next, { replace: true });
  }

  function toggleAll(checked: boolean) {
    if (!data) return;
    setSelected(checked ? new Set(data.items.map((item) => item.id)) : new Set());
  }

  function toggleOne(id: number, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function runExport() {
    setExporting(true);
    try {
      await api.exportCsv({ ...queryParams, page: undefined, pageSize: undefined });
      toast.success('Export ready', 'The CSV download should begin now.');
    } catch (error) {
      toast.error('Export failed', error instanceof ApiError ? error.message : 'Try again.');
    } finally {
      setExporting(false);
    }
  }

  async function applyBulkStatus() {
    if (selected.size === 0) return;
    setBulkSubmitting(true);
    try {
      const result = await api.bulkStatus(
        [...selected],
        bulkStatus,
        bulkReason.trim() || 'Bulk update from applicants list',
      );
      if (result.failed === 0) {
        toast.success('Applications updated', `${result.succeeded} application(s) now ${STATUS_LABELS[bulkStatus].toLowerCase()}.`);
      } else {
        toast.info(
          'Partially updated',
          `${result.succeeded} updated, ${result.failed} could not be changed under the status rules.`,
        );
      }
      setBulkOpen(false);
      setBulkReason('');
      setSelected(new Set());
      await applicationsQuery.refetch();
    } catch (error) {
      toast.error('Bulk update failed', error instanceof ApiError ? error.message : 'Try again.');
    } finally {
      setBulkSubmitting(false);
    }
  }

  const allSelected = Boolean(data && data.items.length > 0 && data.items.every((item) => selected.has(item.id)));
  const someSelected = Boolean(data && data.items.some((item) => selected.has(item.id)));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Applicants"
        title="All applications"
        description={
          can('applications.view_all')
            ? 'Search, filter and review every application across cycles.'
            : 'Applications assigned to you. Ask a recruitment admin to assign more.'
        }
        actions={
          can('exports.create') ? (
            <Button variant="outline" onClick={() => void runExport()} isLoading={exporting}>
              <Download className="h-4 w-4" aria-hidden />
              Export CSV
            </Button>
          ) : null
        }
      />

      <div className="card p-4 sm:p-5">
        <div className="space-y-3">
          <div className="relative">
            <label htmlFor="applicant-search" className="mb-1 block text-2xs font-semibold uppercase tracking-[0.1em] text-muted">
              Search
            </label>
            <Search className="pointer-events-none absolute bottom-2.5 left-3 h-4 w-4 text-muted" aria-hidden />
            <input
              id="applicant-search"
              type="search"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Name, email, phone or reference"
              className="input h-9 py-0 pl-9 text-[13px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            <FilterSelect
              label="Status"
              value={status}
              onChange={(value) => updateParams({ status: value })}
            >
              <option value="">All statuses</option>
              {APPLICATION_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {STATUS_LABELS[option]}
                </option>
              ))}
            </FilterSelect>

            <FilterSelect
              label="Department"
              value={departmentSlug}
              onChange={(value) => updateParams({ department: value })}
            >
              <option value="">All departments</option>
              {(departmentsQuery.data?.items ?? []).map((department) => (
                <option key={department.id} value={department.slug}>
                  {department.name}
                </option>
              ))}
            </FilterSelect>

            <FilterSelect
              label="Academic year"
              value={academicYear}
              onChange={(value) => updateParams({ year: value })}
            >
              <option value="">All years</option>
              {ACADEMIC_YEARS.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </FilterSelect>

            {can('cycles.manage') ? (
              <FilterSelect
                label="Cycle"
                value={cycleId}
                onChange={(value) => updateParams({ cycle: value })}
              >
                <option value="">All cycles</option>
                {(cyclesQuery.data?.items ?? []).map((cycle) => (
                  <option key={cycle.id} value={String(cycle.id)}>
                    {cycle.name}
                  </option>
                ))}
              </FilterSelect>
            ) : null}

            {can('applications.assign') ? (
              <FilterSelect
                label="Reviewer"
                value={reviewerId}
                onChange={(value) => updateParams({ reviewer: value, unassigned: undefined })}
              >
                <option value="">Any reviewer</option>
                {(reviewersQuery.data?.items ?? []).map((reviewer) => (
                  <option key={reviewer.id} value={String(reviewer.id)}>
                    {reviewer.displayName}
                  </option>
                ))}
              </FilterSelect>
            ) : null}

            <FilterSelect
              label="Sort"
              value={sortValue}
              onChange={(value) => updateParams({ sort: value })}
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </FilterSelect>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3">
          {can('applications.assign') ? (
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-navy-800">
              <input
                type="checkbox"
                className="checkbox"
                checked={unassigned}
                onChange={(event) =>
                  updateParams({
                    unassigned: event.target.checked ? 'true' : undefined,
                    reviewer: undefined,
                  })
                }
              />
              Unassigned only
            </label>
          ) : null}
          {filtersActive ? (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-auto inline-flex items-center gap-1.5 text-2xs font-semibold text-navy-800 transition hover:text-ember-700"
            >
              <FilterX className="h-3.5 w-3.5" aria-hidden />
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      {selected.size > 0 && can('applications.status') ? (
        <div className="flex flex-col gap-2 rounded-xl border border-navy-900 bg-navy-950 px-4 py-3 text-white sm:flex-row sm:items-center sm:justify-between">
          <p className="inline-flex items-center gap-2 text-xs font-semibold">
            <CheckSquare className="h-4 w-4 text-ember-400" aria-hidden />
            {selected.size} application(s) selected
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-navy-200 transition hover:bg-white/10 hover:text-white"
            >
              Clear selection
            </button>
            <button
              type="button"
              onClick={() => setBulkOpen(true)}
              className="rounded-lg bg-ember-500 px-3 py-1.5 text-xs font-semibold text-navy-950 transition hover:bg-ember-400"
            >
              Change status
            </button>
          </div>
        </div>
      ) : null}

      {applicationsQuery.isLoading ? (
        <TableSkeleton rows={8} columns={6} />
      ) : applicationsQuery.isError ? (
        <div className="card p-8 text-center">
          <p className="text-sm font-semibold text-navy-900">Applications could not be loaded</p>
          <p className="mt-1 text-xs text-muted">
            {applicationsQuery.error instanceof ApiError
              ? applicationsQuery.error.message
              : 'Check the API connection and try again.'}
          </p>
          <Button className="mt-4" variant="outline" onClick={() => void applicationsQuery.refetch()}>
            Retry
          </Button>
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={filtersActive ? Search : Inbox}
          title={filtersActive ? 'No applications match these filters' : 'No applications yet'}
          description={
            filtersActive
              ? 'Try removing a filter or searching for a different name, email or reference.'
              : 'Applications submitted through the public form will appear here.'
          }
          action={
            filtersActive ? (
              <Button variant="outline" onClick={clearFilters}>
                Clear all filters
              </Button>
            ) : (
              <Link to="/apply" target="_blank" rel="noreferrer" className={buttonStyles({ variant: 'primary', size: 'md' })}>
                Open public form
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            )
          }
        />
      ) : (
        <>
          <div className="table-shell hidden lg:block">
            <table className="table-base">
              <thead>
                <tr>
                  {can('applications.status') ? (
                    <th className="w-10">
                      <SelectionCheckbox
                        checked={allSelected}
                        indeterminate={someSelected}
                        onChange={toggleAll}
                        label="Select all applications on this page"
                      />
                    </th>
                  ) : null}
                  <th>Applicant</th>
                  <th>Department</th>
                  <th>Year</th>
                  <th>Status</th>
                  <th>Reviewer</th>
                  <th>Submitted</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((application, index) => (
                  <motion.tr
                    key={application.id}
                    initial={reduceMotion ? false : { opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: reduceMotion ? 0 : 0.26,
                      delay: reduceMotion ? 0 : Math.min(index * 0.025, 0.25),
                      ease: bezier(EASE.emphasized),
                    }}
                  >
                    {can('applications.status') ? (
                      <td>
                        <SelectionCheckbox
                          checked={selected.has(application.id)}
                          onChange={(checked) => toggleOne(application.id, checked)}
                          label={`Select ${application.fullName}`}
                        />
                      </td>
                    ) : null}
                    <td>
                      <div className="flex items-center gap-3">
                        <Avatar name={application.fullName} size="sm" />
                        <div className="min-w-0">
                          <Link
                            to={`/admin/applicants/${application.id}`}
                            className="block truncate font-semibold text-navy-900 hover:text-ember-700"
                          >
                            {application.fullName}
                          </Link>
                          <p className="truncate text-2xs text-muted">{application.email}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <p className="text-xs font-medium text-navy-900">
                        {application.primaryDepartment?.name ?? '—'}
                      </p>
                      {application.secondaryDepartment ? (
                        <p className="text-2xs text-muted">2nd: {application.secondaryDepartment.name}</p>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap text-xs text-navy-700">{application.academicYear}</td>
                    <td>
                      <StatusBadge status={application.status} />
                    </td>
                    <td className="whitespace-nowrap text-xs text-navy-700">
                      {application.assignedReviewer?.displayName ?? (
                        <span className="text-muted">Unassigned</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      <p className="text-xs text-navy-700">{relativeTime(application.submittedAt)}</p>
                      <p className="font-mono text-2xs text-muted">{application.reference}</p>
                    </td>
                    <td>
                      <Link
                        to={`/admin/applicants/${application.id}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-navy-900/5 hover:text-navy-900"
                        aria-label={`Open application from ${application.fullName}`}
                      >
                        <ChevronRight className="h-4 w-4" aria-hidden />
                      </Link>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 lg:hidden">
            {data.items.map((application, index) => (
              <motion.div
                key={application.id}
                initial={reduceMotion ? false : { opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: reduceMotion ? 0 : 0.26,
                  delay: reduceMotion ? 0 : Math.min(index * 0.03, 0.24),
                  ease: bezier(EASE.emphasized),
                }}
              >
                <ApplicantCard
                  application={application}
                  selected={selected.has(application.id)}
                  selectable={can('applications.status')}
                  onSelect={(checked) => toggleOne(application.id, checked)}
                />
              </motion.div>
            ))}
          </div>

          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            itemLabel="applications"
            onPageChange={(nextPage) => updateParams({ page: String(nextPage) })}
          />
        </>
      )}

      <Modal
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        title="Change status for selected applications"
        description={`${selected.size} application(s) will be updated. Each change is validated against the allowed status transitions and recorded in the audit log.`}
        footer={
          <>
            <Button variant="outline" onClick={() => setBulkOpen(false)} disabled={bulkSubmitting}>
              Cancel
            </Button>
            <Button onClick={() => void applyBulkStatus()} isLoading={bulkSubmitting}>
              Apply status
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <span className="field-label">New status</span>
            <select
              className="select"
              value={bulkStatus}
              onChange={(event) => setBulkStatus(event.target.value as ApplicationStatus)}
            >
              {APPLICATION_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {STATUS_LABELS[option]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="field-label">Reason (stored in status history)</span>
            <textarea
              className="textarea min-h-[5rem]"
              value={bulkReason}
              maxLength={500}
              onChange={(event) => setBulkReason(event.target.value)}
              placeholder="Optional context for this bulk change"
            />
          </label>
          <p className="rounded-lg bg-warning-50 p-3 text-2xs leading-relaxed text-warning-700">
            Some applications may reject the change if the transition is not allowed from their current state.
            The result will show how many succeeded.
          </p>
        </div>
      </Modal>
    </div>
  );
}

function ApplicantCard({
  application,
  selected,
  selectable,
  onSelect,
}: {
  application: ApplicationSummaryDTO;
  selected: boolean;
  selectable: boolean;
  onSelect: (checked: boolean) => void;
}) {
  return (
    <div className={cn('rounded-2xl border border-line bg-white p-4 transition duration-200 hover:-translate-y-0.5 hover:border-navy-200 hover:shadow-soft', selected && 'border-navy-900 ring-2 ring-navy-900/10')}>
      <div className="flex items-start gap-3">
        {selectable ? (
          <SelectionCheckbox
            checked={selected}
            onChange={onSelect}
            label={`Select ${application.fullName}`}
          />
        ) : null}
        <Avatar name={application.fullName} size="sm" />
        <div className="min-w-0 flex-1">
          <Link to={`/admin/applicants/${application.id}`} className="block truncate text-sm font-semibold text-navy-900">
            {application.fullName}
          </Link>
          <p className="truncate text-2xs text-muted">{application.email}</p>
        </div>
        <StatusBadge status={application.status} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3 text-2xs">
        <div>
          <dt className="text-muted">Department</dt>
          <dd className="truncate font-medium text-navy-900">{application.primaryDepartment?.name ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-muted">Year</dt>
          <dd className="truncate font-medium text-navy-900">{application.academicYear}</dd>
        </div>
        <div>
          <dt className="text-muted">Submitted</dt>
          <dd className="font-medium text-navy-900">{formatDateTime(application.submittedAt)}</dd>
        </div>
        <div>
          <dt className="text-muted">Reference</dt>
          <dd className="truncate font-mono text-navy-800">{application.reference}</dd>
        </div>
      </dl>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-2xs text-muted">
          {application.assignedReviewer ? `Reviewer: ${application.assignedReviewer.displayName}` : 'Unassigned'}
        </span>
        <Link
          to={`/admin/applicants/${application.id}`}
          className={buttonStyles({ variant: 'outline', size: 'sm' })}
        >
          Open
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

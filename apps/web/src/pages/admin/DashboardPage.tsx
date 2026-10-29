import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Inbox,
  Layers,
  RefreshCw,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { APPLICATION_STATUSES, type DashboardDTO } from '@esme/shared';
import { PageHeader } from '../../components/ui/PageHeader';
import { Badge, StatusBadge } from '../../components/ui/Badge';
import { Button, buttonStyles } from '../../components/ui/Button';
import { CardSkeleton, PageLoader } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { Avatar } from '../../components/ui/Avatar';
import { AnimatedCounter } from '../../components/motion/AnimatedCounter';
import { StaggerGroup, StaggerItem } from '../../components/motion/Reveal';
import { api, ApiError } from '../../lib/api';
import { EASE, bezier } from '../../lib/motion';
import { useAuth } from '../../auth/AuthProvider';
import { useDocumentTitle } from '../../lib/hooks';
import { formatDateTime, humanizeAction, relativeTime } from '../../lib/format';
import { cn } from '../../lib/cn';

const chartColors = {
  ember: '#F28C28',
  navy: '#0B1F3A',
  slate: '#93AECD',
  grid: '#E5E8ED',
  muted: '#5A687B',
};

function ChartTooltip({
  active,
  payload,
  label,
  suffix = '',
}: {
  active?: boolean;
  payload?: { value?: number | string }[];
  label?: string;
  suffix?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-panel">
      <p className="font-medium text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-navy-900">
        {payload[0]?.value ?? 0} {suffix}
      </p>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  tone = 'default',
  hint,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone?: 'default' | 'accent' | 'info' | 'warning';
  hint?: string;
}) {
  const tones = {
    default: 'bg-navy-50 text-navy-600',
    accent: 'bg-ember-50 text-ember-600',
    info: 'bg-info-50 text-info-600',
    warning: 'bg-warning-50 text-warning-600',
  } as const;
  return (
    <div className="card h-full p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-panel sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">{label}</p>
        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', tones[tone])}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <p className="mt-4 font-display text-[2rem] font-semibold leading-none text-navy-900 sm:text-[2.35rem]">
        <AnimatedCounter value={value} />
      </p>
      {hint ? <p className="mt-3 text-2xs text-muted">{hint}</p> : null}
    </div>
  );
}

function StatusOverview({ data }: { data: DashboardDTO }) {
  const total = data.counts.total;
  const reduceMotion = useReducedMotion();
  return (
    <div className="card p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-navy-900">Pipeline</h2>
          <p className="text-xs text-muted">Applications by current status</p>
        </div>
        <Badge tone="neutral">{total.toLocaleString()} total</Badge>
      </div>
      <ul className="mt-5 space-y-3">
        {APPLICATION_STATUSES.map((status) => {
          const count = data.counts[status] ?? 0;
          const share = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <li key={status}>
              <div className="flex items-center justify-between gap-3 text-xs">
                <StatusBadge status={status} />
                <span className="font-semibold tabular-nums text-navy-900">
                  {count.toLocaleString()}
                  <span className="ml-1 font-normal text-muted">({share}%)</span>
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-navy-900/[0.06]">
                <motion.div
                  className={cn(
                    'h-full origin-left rounded-full',
                    status === 'accepted'
                      ? 'bg-success-500'
                      : status === 'rejected'
                        ? 'bg-danger-500'
                        : status === 'shortlisted'
                          ? 'bg-warning-500'
                          : status === 'reviewing'
                            ? 'bg-info-500'
                            : 'bg-navy-300',
                  )}
                  initial={reduceMotion ? false : { scaleX: 0 }}
                  animate={{ scaleX: Math.max(share, count > 0 ? 2 : 0) / 100 }}
                  transition={{
                    duration: reduceMotion ? 0 : 0.7,
                    delay: reduceMotion ? 0 : 0.1,
                    ease: bezier(EASE.emphasized),
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function DashboardPage() {
  useDocumentTitle('Dashboard · ESME Recruitment');
  const { session, can } = useAuth();
  const reduceMotion = useReducedMotion();
  const query = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: ({ signal }) => api.dashboard(signal),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Command center" title="Dashboard" description="Loading recruitment activity…" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <CardSkeleton key={index} />
          ))}
        </div>
        <PageLoader label="Loading dashboard" />
      </div>
    );
  }

  if (query.isError) {
    const error = query.error;
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Command center" title="Dashboard" />
        <div className="card p-8 text-center">
          <p className="text-sm font-semibold text-navy-900">The dashboard could not be loaded</p>
          <p className="mt-1 text-xs text-muted">
            {error instanceof ApiError ? error.message : 'Check the API connection and try again.'}
          </p>
          <Button className="mt-5" variant="outline" onClick={() => void query.refetch()}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const data = query.data;
  if (!data) return null;
  const { counts, recruitment } = data;
  const isReviewer = session?.administrator.role === 'reviewer';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Command center"
        title="Dashboard"
        description={
          isReviewer
            ? 'Only applications assigned to you.'
            : 'Live overview of this recruitment cycle and the applicant pipeline.'
        }
        actions={
          <>
            <Button variant="outline" size="md" onClick={() => void query.refetch()} isLoading={query.isFetching}>
              <RefreshCw className="h-4 w-4" aria-hidden />
              Refresh
            </Button>
            <Link to="/admin/applicants" className={buttonStyles({ variant: 'primary', size: 'md' })}>
              View applicants
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3">
        <Badge tone={recruitment.open ? 'success' : 'danger'} dot>
          {recruitment.open ? 'Recruitment open' : 'Recruitment closed'}
        </Badge>
        <span className="text-xs text-muted">
          {recruitment.cycleName}
          {recruitment.deadline
            ? ` · closes ${formatDateTime(recruitment.deadline)}`
            : ' · no closing date set'}
        </span>
        {can('cycles.manage') ? (
          <Link
            to="/admin/cycles"
            className="ml-auto text-xs font-semibold text-navy-800 underline-offset-2 hover:text-ember-700 hover:underline"
          >
            Manage cycle
          </Link>
        ) : null}
      </div>

      <StaggerGroup className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" stagger={0.07} delay={0.06}>
        <StaggerItem className="h-full">
          <KpiCard label="Total applications" value={counts.total} icon={ClipboardList} hint={`${counts.assignedToMe} assigned to you`} />
        </StaggerItem>
        <StaggerItem className="h-full">
          <KpiCard label="Pending" value={counts.pending} icon={Inbox} tone="accent" hint="Not reviewed yet" />
        </StaggerItem>
        <StaggerItem className="h-full">
          <KpiCard label="Under review" value={counts.reviewing} icon={Users} tone="info" hint="In progress" />
        </StaggerItem>
        <StaggerItem className="h-full">
          <KpiCard label="Shortlisted" value={counts.shortlisted} icon={CheckCircle2} tone="warning" hint="Moving forward" />
        </StaggerItem>
      </StaggerGroup>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="card p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-navy-900">Applications over time</h2>
              <p className="text-xs text-muted">Submissions in the last 14 days</p>
            </div>
            <Badge tone="neutral">14 days</Badge>
          </div>
          <div className="mt-5 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.overTime} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="applicationsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartColors.ember} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={chartColors.ember} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value: string) =>
                    new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(
                      new Date(`${value}T00:00:00`),
                    )
                  }
                  tick={{ fontSize: 10, fill: chartColors.muted }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={18}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: chartColors.muted }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <Tooltip content={<ChartTooltip suffix="applications" />} />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke={chartColors.ember}
                  strokeWidth={2}
                  fill="url(#applicationsFill)"
                  isAnimationActive={!reduceMotion}
                  animationDuration={700}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <StatusOverview data={data} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="card p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-navy-900">Applications by department</h2>
              <p className="text-xs text-muted">Primary department preference</p>
            </div>
            <Layers className="h-4 w-4 text-muted" aria-hidden />
          </div>
          {data.byDepartment.length > 0 ? (
            <div className="mt-5 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.byDepartment}
                  layout="vertical"
                  margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
                  barCategoryGap={12}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} horizontal={false} />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 10, fill: chartColors.muted }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={122}
                    tickFormatter={(value: string) => (value.length > 15 ? `${value.slice(0, 14)}…` : value)}
                    tick={{ fontSize: 10, fill: chartColors.muted }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<ChartTooltip suffix="applications" />} cursor={{ fill: 'rgba(11,31,58,0.04)' }} />
                  <Bar
                    dataKey="count"
                    fill={chartColors.navy}
                    radius={[0, 4, 4, 0]}
                    barSize={14}
                    isAnimationActive={!reduceMotion}
                    animationDuration={700}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="mt-5">
              <EmptyState icon={Layers} title="No department data" description="Applications will appear here once submitted." />
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="card p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-semibold text-navy-900">Next closing date</h2>
              <CalendarClock className="h-4 w-4 text-muted" aria-hidden />
            </div>
            <p className="mt-3 text-2xl font-semibold text-navy-900">
              {recruitment.deadline ? formatDateTime(recruitment.deadline) : 'Not announced'}
            </p>
            <p className="mt-1 text-xs text-muted">{recruitment.cycleName}</p>
            <div className="mt-4 rounded-xl bg-paper p-3 text-2xs leading-relaxed text-muted">
              Deadlines are displayed using the configured recruitment timezone. Change the cycle or deadline in
              recruitment settings.
            </div>
          </div>

          {data.reviewers.length > 0 ? (
            <div className="card p-6">
              <h2 className="font-display text-lg font-semibold text-navy-900">Review team</h2>
              <p className="text-xs text-muted">Active administrators available for assignment</p>
              <ul className="mt-4 space-y-2.5">
                {data.reviewers.slice(0, 5).map((reviewer) => (
                  <li key={reviewer.id} className="flex items-center gap-2.5">
                    <Avatar name={reviewer.displayName} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-navy-900">
                      {reviewer.displayName}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-navy-900">Recent applications</h2>
              <p className="text-xs text-muted">Newest submissions in this scope</p>
            </div>
            <Link
              to="/admin/applicants"
              className="inline-flex items-center gap-1 text-xs font-semibold text-navy-800 hover:text-ember-700"
            >
              View all
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
          {data.recent.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Inbox}
                title="No applications yet"
                description="Applications submitted through the public form will appear here."
              />
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {data.recent.map((application, index) => (
                <motion.li
                  key={application.id}
                  initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: reduceMotion ? 0 : 0.28,
                    delay: reduceMotion ? 0 : Math.min(index * 0.04, 0.24),
                    ease: bezier(EASE.emphasized),
                  }}
                >
                  <Link
                    to={`/admin/applicants/${application.id}`}
                    className="flex items-center gap-3 px-6 py-3.5 transition hover:bg-navy-50/60"
                  >
                    <Avatar name={application.fullName} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-navy-900">{application.fullName}</p>
                      <p className="truncate text-2xs text-muted">
                        {application.primaryDepartment?.name ?? 'No department'} · {application.academicYear}
                      </p>
                    </div>
                    <div className="hidden text-right sm:block">
                      <p className="text-2xs text-muted">{relativeTime(application.submittedAt)}</p>
                      <p className="font-mono text-2xs text-navy-700">{application.reference}</p>
                    </div>
                    <StatusBadge status={application.status} />
                  </Link>
                </motion.li>
              ))}
            </ul>
          )}
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-line px-6 py-4">
            <h2 className="font-display text-lg font-semibold text-navy-900">Recent activity</h2>
            <p className="text-xs text-muted">Latest audited actions</p>
          </div>
          {data.recentActivity.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={CalendarClock}
                title="No activity recorded"
                description={
                  can('audit.view')
                    ? 'Sign-ins, status changes and document access will be listed here.'
                    : 'Detailed audit history is available to Super Admins.'
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {data.recentActivity.slice(0, 5).map((entry) => (
                <li key={entry.id} className="px-6 py-3">
                  <p className="text-xs font-medium text-navy-900">{humanizeAction(entry.action)}</p>
                  <p className="mt-0.5 text-2xs text-muted">
                    {entry.actor?.displayName ?? 'System'} · {relativeTime(entry.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="text-2xs text-muted">
        Generated {formatDateTime(data.generatedAt)} · Data reflects the server database at load time.
      </p>
    </div>
  );
}

import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ClipboardCopy,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  Github,
  Globe,
  History,
  Linkedin,
  Lock,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import {
  STATUS_LABELS,
  allowedTransitions,
  type ApplicationDetailDTO,
  type ApplicationStatus,
  type NoteDTO,
  type ReviewerRef,
} from '@esme/shared';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge, StatusBadge } from '../../components/ui/Badge';
import { Avatar } from '../../components/ui/Avatar';
import { Skeleton, SkeletonText } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../auth/AuthProvider';
import { api, ApiError, downloadDocument, openDocumentInNewTab } from '../../lib/api';
import { useDocumentTitle } from '../../lib/hooks';
import { formatBytes, formatDateTime, formatDateTimeWithZone, relativeTime } from '../../lib/format';
import { cn } from '../../lib/cn';

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-4">
      <dt className="w-40 shrink-0 text-2xs font-semibold uppercase tracking-[0.1em] text-muted">{label}</dt>
      <dd className="text-sm text-navy-900">{children}</dd>
    </div>
  );
}

function LinkOut({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-800 underline decoration-navy-300 underline-offset-4 transition hover:text-ember-700"
    >
      {icon}
      {label}
      <ExternalLink className="h-3 w-3" aria-hidden />
    </a>
  );
}

export function ApplicantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const numericId = Number(id);
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = useAuth();

  const query = useQuery({
    queryKey: ['admin', 'application', numericId],
    queryFn: ({ signal }) => api.application(numericId, signal),
    enabled: Number.isFinite(numericId) && numericId > 0,
  });

  const application = query.data;
  useDocumentTitle(application ? `${application.fullName} · ESME Recruitment` : 'Application · ESME Recruitment');

  const [nextStatus, setNextStatus] = useState<ApplicationStatus | ''>('');
  const [statusReason, setStatusReason] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    setNextStatus('');
    setStatusReason('');
  }, [application?.id, application?.status]);

  const reviewersQuery = useQuery({
    queryKey: ['admin', 'reviewers'],
    queryFn: () => api.reviewers(),
    enabled: can('applications.assign'),
    staleTime: 5 * 60_000,
  });

  function applyDetail(updated: ApplicationDetailDTO) {
    queryClient.setQueryData(['admin', 'application', numericId], updated);
    void queryClient.invalidateQueries({ queryKey: ['admin', 'applications'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
  }

  const statusMutation = useMutation({
    mutationFn: (status: ApplicationStatus) =>
      api.updateStatus(numericId, {
        status,
        reason: statusReason.trim() || undefined,
        expectedVersion: application?.version,
      }),
    onSuccess: (updated) => {
      applyDetail(updated);
      setStatusReason('');
      setNextStatus('');
      toast.success('Status updated', `The application is now ${STATUS_LABELS[updated.status].toLowerCase()}.`);
    },
    onError: async (error) => {
      if (error instanceof ApiError && error.status === 409) {
        toast.error('Someone else changed this application', 'The latest version has been loaded. Review it and try again.');
        await query.refetch();
        return;
      }
      toast.error('Status could not be changed', error instanceof ApiError ? error.message : 'Try again.');
    },
  });

  const assignMutation = useMutation({
    mutationFn: (reviewerId: number | null) => api.assign(numericId, reviewerId),
    onSuccess: (updated) => {
      applyDetail(updated);
      toast.success(
        'Reviewer updated',
        updated.assignedReviewer ? `${updated.assignedReviewer.displayName} is now responsible.` : 'The application is unassigned.',
      );
    },
    onError: (error) => {
      toast.error('Reviewer could not be updated', error instanceof ApiError ? error.message : 'Try again.');
    },
  });

  const noteMutation = useMutation({
    mutationFn: (body: string) => api.addNote(numericId, body),
    onSuccess: (note: NoteDTO) => {
      queryClient.setQueryData<ApplicationDetailDTO>(['admin', 'application', numericId], (current) =>
        current ? { ...current, notes: [note, ...current.notes] } : current,
      );
      setNoteDraft('');
      toast.success('Note saved', 'Only the recruitment team can see internal notes.');
    },
    onError: (error) => {
      toast.error('Note could not be saved', error instanceof ApiError ? error.message : 'Try again.');
    },
  });

  async function copyReference() {
    if (!application) return;
    setCopying(true);
    try {
      await navigator.clipboard.writeText(application.reference);
      toast.success('Reference copied', application.reference);
    } catch {
      toast.error('Copy failed', 'Select the reference and copy it manually.');
    } finally {
      setCopying(false);
    }
  }

  if (!Number.isFinite(numericId) || numericId <= 0) {
    return (
      <div className="card p-10 text-center">
        <p className="font-semibold text-navy-900">This application link is not valid.</p>
        <Link to="/admin/applicants" className="mt-4 inline-flex text-sm font-semibold text-ember-700 hover:underline">
          Back to applicants
        </Link>
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="card space-y-6 p-6">
            <SkeletonText lines={3} />
            <SkeletonText lines={6} />
            <SkeletonText lines={4} />
          </div>
          <div className="card space-y-4 p-6">
            <Skeleton className="h-8 w-32" />
            <SkeletonText lines={5} />
          </div>
        </div>
      </div>
    );
  }

  if (query.isError || !application) {
    const error = query.error;
    const forbidden = error instanceof ApiError && (error.status === 403 || error.status === 404);
    return (
      <div className="card mx-auto max-w-xl p-10 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-warning-50 text-warning-700">
          <AlertTriangle className="h-5 w-5" aria-hidden />
        </span>
        <h2 className="mt-4 font-display text-xl font-semibold text-navy-900">
          {forbidden ? 'Application not available to you' : 'Application could not be loaded'}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {forbidden
            ? 'It may not exist, or it is not assigned to you. Ask a recruitment admin for access.'
            : error instanceof ApiError
              ? error.message
              : 'Check the API connection and try again.'}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link
            to="/admin/applicants"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-line px-4 text-sm font-semibold text-navy-900 transition hover:bg-mist"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            All applicants
          </Link>
          {!forbidden ? (
            <Button onClick={() => void query.refetch()}>Retry</Button>
          ) : null}
        </div>
      </div>
    );
  }

  const allowed = allowedTransitions(application.status);
  const reviewers: ReviewerRef[] = reviewersQuery.data?.items ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        back={{ to: '/admin/applicants', label: 'All applicants' }}
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <UserRound className="h-3.5 w-3.5" aria-hidden />
            Application
          </span>
        }
        title={application.fullName}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-xs text-navy-800">{application.reference}</span>
            <span aria-hidden className="text-line">·</span>
            <span>{application.primaryDepartment?.name ?? 'No department'}</span>
            <span aria-hidden className="text-line">·</span>
            <span>{application.cycle?.name ?? 'Current cycle'}</span>
          </span>
        }
        actions={
          <>
            <StatusBadge status={application.status} />
            <Button variant="outline" size="sm" onClick={() => void copyReference()} isLoading={copying}>
              {!copying ? <ClipboardCopy className="h-3.5 w-3.5" aria-hidden /> : null}
              Copy reference
            </Button>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          <section className="card p-5 sm:p-6" aria-labelledby="applicant-details">
            <div className="flex items-start gap-4">
              <Avatar name={application.fullName} size="lg" />
              <div className="min-w-0 flex-1">
                <h2 id="applicant-details" className="font-display text-lg font-semibold text-navy-900">
                  Applicant information
                </h2>
                <p className="mt-1 text-xs text-muted">
                  Submitted {formatDateTime(application.submittedAt)} · {relativeTime(application.submittedAt)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={`mailto:${application.email}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-navy-900/5 px-2.5 py-1.5 text-2xs font-semibold text-navy-800 transition hover:bg-navy-900/10"
                  >
                    <Mail className="h-3 w-3" aria-hidden />
                    {application.email}
                  </a>
                  <a
                    href={`tel:${application.phone.replace(/\s+/g, '')}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-navy-900/5 px-2.5 py-1.5 text-2xs font-semibold text-navy-800 transition hover:bg-navy-900/10"
                  >
                    <Phone className="h-3 w-3" aria-hidden />
                    {application.phone}
                  </a>
                </div>
              </div>
            </div>

            <dl className="mt-5 divide-y divide-line border-t border-line">
              <DetailRow label="Full name">{application.fullName}</DetailRow>
              {application.preferredName ? (
                <DetailRow label="Preferred name">{application.preferredName}</DetailRow>
              ) : null}
              <DetailRow label="University">{application.university}</DetailRow>
              <DetailRow label="Faculty">{application.faculty}</DetailRow>
              <DetailRow label="Academic department">{application.academicDepartment}</DetailRow>
              <DetailRow label="Academic year">{application.academicYear}</DetailRow>
              <DetailRow label="Primary department">
                {application.primaryDepartment ? (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-ember-600" aria-hidden />
                    {application.primaryDepartment.name}
                  </span>
                ) : (
                  '—'
                )}
              </DetailRow>
              <DetailRow label="Second preference">
                {application.secondaryDepartment?.name ?? 'None'}
              </DetailRow>
            </dl>
          </section>

          <section className="card p-5 sm:p-6" aria-labelledby="motivation">
            <h2 id="motivation" className="font-display text-lg font-semibold text-navy-900">
              Motivation and experience
            </h2>
            <div className="mt-4 rounded-xl border border-line bg-mist/60 p-4">
              <p className="whitespace-pre-line text-sm leading-relaxed text-navy-900">
                {application.motivationStatement}
              </p>
            </div>
            {application.experience ? (
              <div className="mt-4">
                <h3 className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted">Experience</h3>
                <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-navy-800">
                  {application.experience}
                </p>
              </div>
            ) : null}
            {application.additionalInformation ? (
              <div className="mt-4">
                <h3 className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted">Additional information</h3>
                <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-navy-800">
                  {application.additionalInformation}
                </p>
              </div>
            ) : null}
            {application.githubUrl || application.linkedinUrl || application.portfolioUrl ? (
              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-4">
                {application.githubUrl ? (
                  <LinkOut href={application.githubUrl} icon={<Github className="h-3.5 w-3.5" aria-hidden />} label="GitHub" />
                ) : null}
                {application.linkedinUrl ? (
                  <LinkOut href={application.linkedinUrl} icon={<Linkedin className="h-3.5 w-3.5" aria-hidden />} label="LinkedIn" />
                ) : null}
                {application.portfolioUrl ? (
                  <LinkOut href={application.portfolioUrl} icon={<Globe className="h-3.5 w-3.5" aria-hidden />} label="Portfolio" />
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="card p-5 sm:p-6" aria-labelledby="documents">
            <div className="flex items-center justify-between gap-3">
              <h2 id="documents" className="font-display text-lg font-semibold text-navy-900">
                Documents
              </h2>
              <Badge tone="neutral">
                <Lock className="h-3 w-3" aria-hidden />
                Private
              </Badge>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Every open or download is recorded in the audit log against your account.
            </p>
            <ul className="mt-4 space-y-2">
              {application.documents.map((document) => (
                <li
                  key={document.id}
                  className="flex flex-col gap-3 rounded-xl border border-line bg-white p-3.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-navy-900/5 text-navy-800">
                      <FileText className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-navy-900">
                        {document.type === 'national_id' ? 'National ID' : 'University ID'}
                      </p>
                      <p className="truncate text-2xs text-muted">
                        {document.originalFilename} · {formatBytes(document.size)}
                      </p>
                    </div>
                  </div>
                  {can('documents.download') ? (
                    <div className="flex shrink-0 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          void openDocumentInNewTab(document.id).catch((error: unknown) => {
                            toast.error(
                              'Document could not be opened',
                              error instanceof ApiError ? error.message : 'Try downloading it instead.',
                            );
                          })
                        }
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        Open
                      </Button>
                      <Button
                        variant="subtle"
                        size="sm"
                        onClick={() =>
                          void downloadDocument(document.id, document.originalFilename).catch((error: unknown) => {
                            toast.error(
                              'Download failed',
                              error instanceof ApiError ? error.message : 'Try again.',
                            );
                          })
                        }
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden />
                        Download
                      </Button>
                    </div>
                  ) : (
                    <p className="text-2xs text-muted">Your role cannot open private documents.</p>
                  )}
                </li>
              ))}
              {application.documents.length === 0 ? (
                <li className="rounded-xl border border-dashed border-line p-4 text-xs text-muted">
                  No active documents are attached to this application.
                </li>
              ) : null}
            </ul>
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-navy-900/[0.03] p-3 text-2xs leading-relaxed text-muted">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success-600" aria-hidden />
              <span>
                Consent accepted {formatDateTime(application.consent.acceptedAt)} for privacy policy version{' '}
                <strong className="font-semibold text-navy-800">{application.consent.policyVersion}</strong>.
              </span>
            </div>
          </section>

          <section className="card p-5 sm:p-6" aria-labelledby="notes">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-ember-600" aria-hidden />
              <h2 id="notes" className="font-display text-lg font-semibold text-navy-900">
                Internal notes
              </h2>
              <span className="text-2xs text-muted">({application.notes.length})</span>
            </div>

            {can('applications.notes') ? (
              <form
                className="mt-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  const body = noteDraft.trim();
                  if (body.length === 0) return;
                  noteMutation.mutate(body);
                }}
              >
                <label htmlFor="note-body" className="field-label">
                  Add a note
                </label>
                <textarea
                  id="note-body"
                  className="textarea min-h-[6rem]"
                  maxLength={4000}
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  placeholder="Share observations with the recruitment team. Applicants never see these notes."
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-2xs tabular-nums text-muted">{noteDraft.length} / 4,000</span>
                  <Button type="submit" size="sm" isLoading={noteMutation.isPending} disabled={noteDraft.trim().length === 0}>
                    Save note
                  </Button>
                </div>
              </form>
            ) : null}

            <ul className="mt-5 space-y-3">
              {application.notes.map((note) => (
                <li key={note.id} className="animate-fade-up rounded-xl border border-line bg-mist/50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-navy-900">
                      {note.author?.displayName ?? 'Removed administrator'}
                    </span>
                    <span className="text-2xs text-muted" title={formatDateTime(note.createdAt)}>
                      {relativeTime(note.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-navy-800">{note.body}</p>
                </li>
              ))}
              {application.notes.length === 0 ? (
                <li className="rounded-xl border border-dashed border-line p-4 text-xs text-muted">
                  No notes yet. Notes are internal and share only with administrators.
                </li>
              ) : null}
            </ul>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="card p-5" aria-labelledby="decision">
            <h2 id="decision" className="font-display text-base font-semibold text-navy-900">
              Decision
            </h2>
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-mist/70 p-3">
              <div>
                <p className="text-2xs font-semibold uppercase tracking-[0.1em] text-muted">Current status</p>
                <div key={application.status} className="status-in mt-1">
                  <StatusBadge status={application.status} />
                </div>
              </div>
              <span className="font-mono text-2xs text-muted">v{application.version}</span>
            </div>

            {can('applications.status') ? (
              allowed.length > 0 ? (
                <form
                  className="mt-4 space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!nextStatus) return;
                    statusMutation.mutate(nextStatus);
                  }}
                >
                  <label className="block">
                    <span className="field-label">Move to</span>
                    <select
                      className="select"
                      value={nextStatus}
                      onChange={(event) => setNextStatus(event.target.value as ApplicationStatus | '')}
                    >
                      <option value="">Select a status…</option>
                      {allowed.map((status) => (
                        <option key={status} value={status}>
                          {STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="field-label">Reason (optional)</span>
                    <textarea
                      className="textarea min-h-[4.5rem]"
                      maxLength={1000}
                      value={statusReason}
                      onChange={(event) => setStatusReason(event.target.value)}
                      placeholder="Context stored in the status history"
                    />
                  </label>
                  <Button type="submit" fullWidth isLoading={statusMutation.isPending} disabled={!nextStatus}>
                    <Check className="h-4 w-4" aria-hidden />
                    Update status
                  </Button>
                  <p className="text-2xs leading-relaxed text-muted">
                    Changes are validated against the recruitment workflow, save only after the database write,
                    and are recorded in the audit log.
                  </p>
                </form>
              ) : (
                <p className="mt-4 rounded-lg bg-navy-900/[0.03] p-3 text-2xs leading-relaxed text-muted">
                  This status is final. A recruitment admin can still correct a decision from the applicants list.
                </p>
              )
            ) : (
              <p className="mt-4 rounded-lg bg-navy-900/[0.03] p-3 text-2xs leading-relaxed text-muted">
                Your role can review applications and add notes, but status decisions are made by recruitment
                administrators.
              </p>
            )}

            <div className="mt-5 border-t border-line pt-4">
              <label className="block">
                <span className="field-label">Assigned reviewer</span>
                {can('applications.assign') ? (
                  <select
                    className="select"
                    value={application.assignedReviewer?.id ?? ''}
                    disabled={assignMutation.isPending}
                    onChange={(event) =>
                      assignMutation.mutate(event.target.value ? Number(event.target.value) : null)
                    }
                  >
                    <option value="">Unassigned</option>
                    {reviewers.map((reviewer) => (
                      <option key={reviewer.id} value={String(reviewer.id)}>
                        {reviewer.displayName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="mt-1 text-sm text-navy-900">
                    {application.assignedReviewer?.displayName ?? 'Unassigned'}
                  </p>
                )}
              </label>
              {assignMutation.isPending ? <p className="mt-1 text-2xs text-muted">Saving…</p> : null}
            </div>
          </section>

          <section className="card p-5" aria-labelledby="history">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-ember-600" aria-hidden />
              <h2 id="history" className="font-display text-base font-semibold text-navy-900">
                Status history
              </h2>
            </div>
            <ol className="mt-4 space-y-4">
              {application.history.map((event) => (
                <li key={event.id} className="relative border-l border-line pl-4">
                  <span
                    className={cn(
                      'absolute -left-[4.5px] top-1 h-2 w-2 rounded-full ring-2 ring-white',
                      event.newStatus === 'rejected'
                        ? 'bg-danger-500'
                        : event.newStatus === 'accepted'
                          ? 'bg-success-500'
                          : 'bg-navy-400',
                    )}
                    aria-hidden
                  />
                  <p className="text-xs font-semibold text-navy-900">
                    {event.previousStatus ? `${STATUS_LABELS[event.previousStatus]} → ` : ''}
                    {STATUS_LABELS[event.newStatus]}
                  </p>
                  <p className="mt-0.5 text-2xs text-muted">
                    {event.changedBy?.displayName ?? 'System'} · {formatDateTime(event.createdAt)}
                  </p>
                  {event.reason ? (
                    <p className="mt-1.5 rounded-lg bg-mist/70 p-2 text-2xs leading-relaxed text-navy-800">
                      {event.reason}
                    </p>
                  ) : null}
                </li>
              ))}
              <li className="relative border-l border-line pl-4">
                <span className="absolute -left-[4.5px] top-1 h-2 w-2 rounded-full bg-ember-500 ring-2 ring-white" aria-hidden />
                <p className="text-xs font-semibold text-navy-900">Application submitted</p>
                <p className="mt-0.5 text-2xs text-muted">{formatDateTime(application.createdAt)}</p>
              </li>
            </ol>
          </section>

          <section className="card p-5" aria-labelledby="metadata">
            <div className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-muted" aria-hidden />
              <h2 id="metadata" className="font-display text-base font-semibold text-navy-900">
                Record
              </h2>
            </div>
            <dl className="mt-3 space-y-2 text-2xs">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Reference</dt>
                <dd className="font-mono text-navy-800">{application.reference}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Cycle</dt>
                <dd className="text-navy-800">{application.cycle?.name ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Submitted</dt>
                <dd className="text-right text-navy-800">{formatDateTimeWithZone(application.submittedAt, 'Africa/Cairo')}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Last updated</dt>
                <dd className="text-right text-navy-800">{formatDateTime(application.updatedAt)}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}

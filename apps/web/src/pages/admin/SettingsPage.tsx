import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarClock,
  ExternalLink,
  FileCheck2,
  Info,
  Lock,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
import {
  DEFAULT_SETTINGS,
  UPLOAD_LIMITS,
  type AppSettings,
} from '@esme/shared';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Skeleton, SkeletonText } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../auth/AuthProvider';
import { api, ApiError } from '../../lib/api';
import { useDocumentTitle } from '../../lib/hooks';
import { fromLocalInputValue, toLocalInputValue } from '../../lib/format';
import { cn } from '../../lib/cn';

const MIME_OPTIONS: Record<'national_id' | 'university_id', { value: string; label: string }[]> = {
  national_id: [{ value: 'application/pdf', label: 'PDF' }],
  university_id: [
    { value: 'image/jpeg', label: 'JPEG' },
    { value: 'image/png', label: 'PNG' },
    { value: 'image/webp', label: 'WebP' },
  ],
};

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
  aside,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-navy-900/5 text-navy-800">
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <h2 className="font-display text-lg font-semibold text-navy-900">{title}</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">{description}</p>
          </div>
        </div>
        {aside}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3.5 transition hover:border-navy-200',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <input
        type="checkbox"
        className="checkbox mt-0.5"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <span className="block text-xs font-semibold text-navy-900">{label}</span>
        {hint ? <span className="mt-0.5 block text-2xs leading-relaxed text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

export function SettingsPage() {
  useDocumentTitle('Settings · ESME Recruitment');
  const toast = useToast();
  const { can } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.getSettings(),
  });

  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [original, setOriginal] = useState<AppSettings | null>(null);
  const [maxSizeMb, setMaxSizeMb] = useState('5');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!query.data) return;
    setDraft(query.data.settings);
    setOriginal(query.data.settings);
    setMaxSizeMb(String(Math.round((query.data.settings.documents.maxSizeBytes / (1024 * 1024)) * 10) / 10));
    setFormError(null);
  }, [query.data]);

  const dirty = useMemo(() => {
    if (!draft || !original) return false;
    const normalisedSize = Math.round(Number(maxSizeMb) * 1024 * 1024);
    return JSON.stringify(draft) !== JSON.stringify(original) || normalisedSize !== draft.documents.maxSizeBytes;
  }, [draft, original, maxSizeMb]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draft) throw new ApiError(0, 'validation', 'Settings are still loading.');
      const size = Math.round(Number(maxSizeMb) * 1024 * 1024);
      if (!Number.isFinite(size) || size < UPLOAD_LIMITS.minBytes || size > UPLOAD_LIMITS.hardMaxBytes) {
        throw new ApiError(0, 'validation', 'Maximum upload size must be between 10 KB and 20 MB.');
      }
      if (draft.privacy.text.trim().length < 50) {
        throw new ApiError(0, 'validation', 'The privacy notice must be at least 50 characters.');
      }
      if (!draft.privacy.version.trim()) {
        throw new ApiError(0, 'validation', 'A privacy policy version is required.');
      }
      if (draft.documents.nationalIdTypes.length === 0) {
        throw new ApiError(0, 'validation', 'Select at least one national ID format.');
      }
      if (draft.documents.universityIdTypes.length === 0) {
        throw new ApiError(0, 'validation', 'Select at least one university ID format.');
      }

      const settings: Partial<AppSettings> = {
        recruitment: draft.recruitment,
        documents: { ...draft.documents, maxSizeBytes: size },
        privacy: draft.privacy,
        form: draft.form,
      };
      if (can('settings.security')) settings.retention = draft.retention;
      return api.updateSettings(settings);
    },
    onSuccess: async (result) => {
      setDraft(result.settings);
      setOriginal(result.settings);
      setMaxSizeMb(String(Math.round((result.settings.documents.maxSizeBytes / (1024 * 1024)) * 10) / 10));
      setFormError(null);
      toast.success('Settings saved', 'The public site and application form now use these values.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['public', 'config'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] }),
      ]);
    },
    onError: (error) => {
      const message = error instanceof ApiError ? error.message : 'Settings could not be saved.';
      setFormError(message);
      toast.error('Settings not saved', message);
    },
  });

  if (query.isLoading || !draft) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-9 w-56" />
        <div className="card space-y-4 p-6">
          <SkeletonText lines={4} />
        </div>
        <div className="card space-y-4 p-6">
          <SkeletonText lines={8} />
        </div>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="card p-8 text-center">
        <p className="text-sm font-semibold text-navy-900">Settings could not be loaded</p>
        <p className="mt-1 text-xs text-muted">
          {query.error instanceof ApiError ? query.error.message : 'Check the API connection.'}
        </p>
        <Button className="mt-4" variant="outline" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  function updateRecruitment(patch: Partial<AppSettings['recruitment']>) {
    setDraft((current) => (current ? { ...current, recruitment: { ...current.recruitment, ...patch } } : current));
  }
  function updateDocuments(patch: Partial<AppSettings['documents']>) {
    setDraft((current) => (current ? { ...current, documents: { ...current.documents, ...patch } } : current));
  }
  function updatePrivacy(patch: Partial<AppSettings['privacy']>) {
    setDraft((current) => (current ? { ...current, privacy: { ...current.privacy, ...patch } } : current));
  }
  function updateForm(patch: Partial<AppSettings['form']>) {
    setDraft((current) => (current ? { ...current, form: { ...current.form, ...patch } } : current));
  }
  function updateRetention(patch: Partial<AppSettings['retention']>) {
    setDraft((current) => (current ? { ...current, retention: { ...current.retention, ...patch } } : current));
  }

  function toggleMime(type: 'national_id' | 'university_id', mime: string, checked: boolean) {
    if (!draft) return;
    const current = type === 'national_id' ? draft.documents.nationalIdTypes : draft.documents.universityIdTypes;
    const next = checked ? [...new Set([...current, mime])] : current.filter((item) => item !== mime);
    if (type === 'national_id') updateDocuments({ nationalIdTypes: next });
    else updateDocuments({ universityIdTypes: next });
  }

  const privacyVersionChanged =
    original && draft.privacy.version !== original.privacy.version;

  return (
    <div className="space-y-5 pb-24">
      <PageHeader
        eyebrow="Administration"
        title="Settings"
        description="Public copy, application requirements and privacy wording. Changes take effect immediately after saving."
        actions={
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-[13px] font-semibold text-navy-900 transition hover:bg-mist"
          >
            View public site
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        }
      />

      {formError ? (
        <div role="alert" className="rounded-xl border border-danger-100 bg-danger-50 p-4 text-xs leading-relaxed text-danger-700">
          <p className="font-semibold">Settings were not saved</p>
          <p className="mt-0.5">{formError}</p>
        </div>
      ) : null}

      <SectionCard
        icon={CalendarClock}
        title="Recruitment message"
        description="Shown on the public landing page. The open/closed state comes from the current cycle, not from this text."
        aside={<Badge tone="neutral">Public</Badge>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="field-label">Recruitment title</span>
            <input
              className="input"
              value={draft.recruitment.title}
              maxLength={120}
              onChange={(event) => updateRecruitment({ title: event.target.value })}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="field-label">Headline</span>
            <input
              className="input"
              value={draft.recruitment.headline}
              maxLength={160}
              onChange={(event) => updateRecruitment({ headline: event.target.value })}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="field-label">Description</span>
            <textarea
              className="textarea min-h-[6rem]"
              value={draft.recruitment.description}
              maxLength={1200}
              onChange={(event) => updateRecruitment({ description: event.target.value })}
            />
            <span className="field-hint">{draft.recruitment.description.length} / 1,200 characters</span>
          </label>
          <label className="block">
            <span className="field-label">Overall deadline (optional)</span>
            <input
              type="datetime-local"
              className="input"
              value={toLocalInputValue(draft.recruitment.deadline)}
              onChange={(event) => updateRecruitment({ deadline: fromLocalInputValue(event.target.value) })}
            />
            <span className="field-hint">Used only when the current cycle has no closing date.</span>
          </label>
          <label className="block">
            <span className="field-label">Timezone</span>
            <input
              className="input font-mono text-xs"
              value={draft.recruitment.timezone}
              maxLength={60}
              onChange={(event) => updateRecruitment({ timezone: event.target.value })}
              placeholder="Africa/Cairo"
            />
            <span className="field-hint">IANA timezone used for displayed dates.</span>
          </label>
          <label className="block">
            <span className="field-label">Confirmation title</span>
            <input
              className="input"
              value={draft.recruitment.confirmationTitle}
              maxLength={120}
              onChange={(event) => updateRecruitment({ confirmationTitle: event.target.value })}
            />
          </label>
          <label className="block">
            <span className="field-label">Confirmation message</span>
            <textarea
              className="textarea min-h-[5rem]"
              value={draft.recruitment.confirmationMessage}
              maxLength={1200}
              onChange={(event) => updateRecruitment({ confirmationMessage: event.target.value })}
            />
          </label>
        </div>
      </SectionCard>

      <SectionCard
        icon={SlidersHorizontal}
        title="Application form"
        description="Control which optional parts of the form are shown to applicants."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle
            label="Allow a second department preference"
            hint="Applicants may pick an optional backup department."
            checked={draft.form.allowSecondaryPreference}
            onChange={(value) => updateForm({ allowSecondaryPreference: value })}
          />
          <Toggle
            label="Require experience"
            hint="Makes the experience field mandatory for submission."
            checked={draft.form.requireExperience}
            onChange={(value) => updateForm({ requireExperience: value })}
          />
          <Toggle
            label="Show additional information field"
            hint="An optional free-text area for anything else."
            checked={draft.form.additionalInformationEnabled}
            onChange={(value) => updateForm({ additionalInformationEnabled: value })}
          />
          <Toggle
            label="Allow universities other than Cairo University"
            hint="When off, the university field is fixed to Cairo University."
            checked={draft.form.allowOtherUniversities}
            onChange={(value) => updateForm({ allowOtherUniversities: value })}
          />
        </div>
      </SectionCard>

      <SectionCard
        icon={FileCheck2}
        title="Documents"
        description="Requirements are shown on the form and enforced again on the server, including file signature checks."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">Maximum file size (MB)</span>
            <input
              type="number"
              min={UPLOAD_LIMITS.minBytes / (1024 * 1024)}
              max={UPLOAD_LIMITS.hardMaxBytes / (1024 * 1024)}
              step="any"
              className="input"
              value={maxSizeMb}
              onChange={(event) => setMaxSizeMb(event.target.value)}
            />
            <span className="field-hint">Between 0.01 and 20 MB. Applies to each uploaded document.</span>
          </label>
          <div className="rounded-xl border border-line p-3.5 text-2xs leading-relaxed text-muted">
            <p className="inline-flex items-center gap-1.5 font-semibold text-navy-900">
              <Lock className="h-3.5 w-3.5" aria-hidden />
              Private storage
            </p>
            <p className="mt-1">
              Uploaded files are stored outside the public web root with randomized names. Only authorized
              administrators can open them, and every access is audited.
            </p>
          </div>
          <div className="space-y-2">
            <Toggle
              label="National ID required"
              checked={draft.documents.nationalIdRequired}
              onChange={(value) => updateDocuments({ nationalIdRequired: value })}
            />
            <div className="flex flex-wrap gap-2">
              {MIME_OPTIONS.national_id.map((option) => (
                <label key={option.value} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-2xs">
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={draft.documents.nationalIdTypes.includes(option.value)}
                    onChange={(event) => toggleMime('national_id', option.value, event.target.checked)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Toggle
              label="University ID required"
              checked={draft.documents.universityIdRequired}
              onChange={(value) => updateDocuments({ universityIdRequired: value })}
            />
            <div className="flex flex-wrap gap-2">
              {MIME_OPTIONS.university_id.map((option) => (
                <label key={option.value} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-2xs">
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={draft.documents.universityIdTypes.includes(option.value)}
                    onChange={(event) => toggleMime('university_id', option.value, event.target.checked)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        icon={ShieldCheck}
        title="Privacy notice"
        description="Applicants must accept this notice before submitting. Each application records the version that was shown."
        aside={
          <Badge tone={privacyVersionChanged ? 'warning' : 'info'} dot>
            {privacyVersionChanged ? 'Version changed' : `v${draft.privacy.version}`}
          </Badge>
        }
      >
        <div className="space-y-4">
          <label className="block sm:max-w-xs">
            <span className="field-label">Policy version</span>
            <input
              className="input font-mono text-xs"
              value={draft.privacy.version}
              maxLength={60}
              onChange={(event) => updatePrivacy({ version: event.target.value })}
            />
            <span className="field-hint">Use a new version whenever the wording changes.</span>
          </label>
          <label className="block">
            <span className="field-label">Privacy notice text</span>
            <textarea
              className="textarea min-h-[16rem] font-sans text-[13px] leading-relaxed"
              value={draft.privacy.text}
              maxLength={20000}
              onChange={(event) => updatePrivacy({ text: event.target.value })}
            />
            <span className="field-hint">{draft.privacy.text.length.toLocaleString()} / 20,000 characters</span>
          </label>
          {privacyVersionChanged ? (
            <p className="rounded-lg bg-warning-50 p-3 text-2xs leading-relaxed text-warning-700">
              Changing the version does not alter consent already recorded on submitted applications. They keep the
              version they accepted.
            </p>
          ) : null}
        </div>
      </SectionCard>

      {can('settings.security') ? (
        <SectionCard
          icon={Info}
          title="Retention"
          description="Allows deletion of closed applications past the retention period. Preview always runs first on the System page."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Toggle
              label="Enable retention cleanup"
              hint="When off, the cleanup action is refused on the server."
              checked={draft.retention.enabled}
              onChange={(value) => updateRetention({ enabled: value })}
            />
            <label className="block">
              <span className="field-label">Retention period (days)</span>
              <input
                type="number"
                min={30}
                max={3650}
                className="input"
                value={draft.retention.days}
                onChange={(event) => updateRetention({ days: Number(event.target.value) || DEFAULT_SETTINGS.retention.days })}
              />
              <span className="field-hint">Measured from the date a final decision was recorded.</span>
            </label>
          </div>
        </SectionCard>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 backdrop-blur-lg lg:left-64">
        <div className="mx-auto flex max-w-[86rem] flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p className="text-2xs text-muted">
            {dirty ? 'You have unsaved changes.' : 'All changes saved.'}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!dirty || saveMutation.isPending}
              onClick={() => {
                if (!original) return;
                setDraft(original);
                setMaxSizeMb(String(Math.round((original.documents.maxSizeBytes / (1024 * 1024)) * 10) / 10));
                setFormError(null);
              }}
            >
              Discard
            </Button>
            <Button size="sm" onClick={() => saveMutation.mutate()} isLoading={saveMutation.isPending} disabled={!dirty}>
              <Save className="h-3.5 w-3.5" aria-hidden />
              Save settings
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

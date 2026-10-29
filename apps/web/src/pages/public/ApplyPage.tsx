import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardCheck,
  FileText,
  Image as ImageIcon,
  Loader2,
  LockKeyhole,
  Paperclip,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  ACADEMIC_YEARS,
  DOCUMENT_TYPE_LABELS,
  en,
  type DocumentType,
  type PublicConfig,
} from '@esme/shared';
import { Button, buttonStyles } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { CheckboxField, SelectField, TextAreaField, TextField } from '../../components/ui/Field';
import { PageLoader } from '../../components/ui/Skeleton';
import { AnimatedHeading } from '../../components/motion/AnimatedHeading';
import { useToast } from '../../components/ui/Toast';
import { Breadcrumbs } from '../../components/ui/PageHeader';
import { applyCopy, landingCopy } from '../../lib/copy';
import { useDocumentTitle } from '../../lib/hooks';
import { usePublicConfig } from '../../lib/public';
import { uploadApplication, ApiError } from '../../lib/api';
import { formatBytes, formatDateTimeWithZone } from '../../lib/format';
import { cn } from '../../lib/cn';
import { EASE, bezier, transition as motionTransition } from '../../lib/motion';
import {
  APPLY_STEPS,
  applicationFormSchema,
  buildSubmissionPayload,
  emptyApplication,
  stepForField,
  type ApplicationFormValues,
} from '../../lib/application-form';

type DocumentFiles = Record<DocumentType, File | null>;
type DocumentErrors = Partial<Record<DocumentType, string>>;

function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function mimeLabel(mime: string): string {
  const labels: Record<string, string> = {
    'application/pdf': 'PDF',
    'image/jpeg': 'JPEG',
    'image/png': 'PNG',
    'image/webp': 'WebP',
  };
  return labels[mime] ?? mime;
}

function acceptedFormats(types: readonly string[]): string {
  return types.map(mimeLabel).join(', ');
}

function FileUpload({
  id,
  label,
  description,
  required,
  allowedTypes,
  maxBytes,
  file,
  error,
  onSelect,
  onRemove,
  disabled,
}: {
  id: string;
  label: string;
  description: string;
  required: boolean;
  allowedTypes: readonly string[];
  maxBytes: number;
  file: File | null;
  error?: string;
  onSelect: (file: File) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (selected) onSelect(selected);
    event.target.value = '';
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    const selected = event.dataTransfer.files?.[0];
    if (selected) onSelect(selected);
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label htmlFor={id} className="flex items-center gap-1.5 text-sm font-medium text-navy-900">
          {label}
          {required ? (
            <span className="text-ember-600" aria-label="required">
              *
            </span>
          ) : (
            <span className="text-2xs font-normal uppercase tracking-wide text-muted">Optional</span>
          )}
        </label>
        <Badge tone="neutral">{acceptedFormats(allowedTypes)}</Badge>
      </div>
      <p className="mb-2.5 text-xs leading-relaxed text-muted">{description}</p>

      {file ? (
        <div className="animate-fade-up flex items-center gap-3 rounded-2xl border border-line bg-white p-3.5">
          {preview ? (
            <img src={preview} alt="" className="h-12 w-12 rounded-lg object-cover ring-1 ring-line" />
          ) : (
            <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-navy-50 text-navy-600">
              <FileText className="h-5 w-5" aria-hidden />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-navy-900">{file.name}</p>
            <p className="text-2xs text-muted">
              {formatBytes(file.size)} · {mimeLabel(file.type) || 'file'}
            </p>
          </div>
          <Badge tone="success" dot className="hidden sm:inline-flex">
            Ready
          </Badge>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            className="rounded-lg px-2 py-1 text-xs font-semibold text-navy-700 transition hover:bg-navy-900/5 disabled:opacity-50"
          >
            Replace
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="rounded-lg p-1.5 text-muted transition hover:bg-danger-50 hover:text-danger-600 disabled:opacity-50"
            aria-label={`Remove ${label}`}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : (
        <div
          onDragOver={(event) => {
            event.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={cn(
            'rounded-2xl border border-dashed p-1 transition-colors duration-200',
            dragging ? 'border-ember-500 bg-ember-50' : 'border-navy-200 bg-paper hover:border-navy-300',
            error && 'border-danger-500 bg-danger-50/40',
          )}
        >
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            className="flex w-full items-center gap-3.5 rounded-xl px-3.5 py-4 text-left transition hover:bg-white/70 disabled:opacity-60"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-white text-navy-700">
              <Upload className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-navy-900">Choose a file or drag it here</span>
              <span className="mt-0.5 block text-2xs text-muted">
                {acceptedFormats(allowedTypes)} · up to {formatBytes(maxBytes)}
              </span>
            </span>
            <span className="hidden text-2xs font-semibold text-ember-700 sm:block">Browse</span>
          </button>
        </div>
      )}

      <input
        ref={inputRef}
        id={id}
        type="file"
        className="sr-only"
        accept={allowedTypes.join(',')}
        onChange={handleInputChange}
        disabled={disabled}
        tabIndex={-1}
      />
      {error ? (
        <p className="field-error" role="alert">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}

function StepAside({ step, total }: { step: number; total: number }) {
  const percent = Math.round(((step + 1) / total) * 100);
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-28 space-y-4">
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          <div className="flex items-end justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-muted">Application</p>
              <p className="mt-1 font-display text-lg font-semibold text-navy-900">
                Step {step + 1} of {total}
              </p>
            </div>
            <span className="font-display text-2xl tabular-nums text-navy-300">
              {String(step + 1).padStart(2, '0')}
            </span>
          </div>

          <ol className="relative px-3 py-4">
            <span className="absolute bottom-7 left-[1.68rem] top-7 w-px bg-line" aria-hidden />
            {APPLY_STEPS.map((item, index) => {
              const complete = index < step;
              const current = index === step;
              return (
                <li
                  key={item.id}
                  aria-current={current ? 'step' : undefined}
                  className={cn(
                    'relative flex items-center gap-3 rounded-lg px-2 py-2 text-[13px] transition-colors',
                    current && 'bg-navy-50/80 font-semibold text-navy-900',
                    !current && !complete && 'text-muted',
                  )}
                >
                  <span
                    className={cn(
                      'relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-2xs font-semibold',
                      complete && 'bg-navy-900 text-white',
                      current && 'bg-ember-500 text-navy-950',
                      !complete && !current && 'border border-line bg-white text-muted',
                    )}
                    aria-hidden
                  >
                    {complete ? <Check className="h-3 w-3" /> : index + 1}
                  </span>
                  <span className="min-w-0 truncate">{applyCopy.stepLabels[item.id]}</span>
                </li>
              );
            })}
          </ol>

          <div className="border-t border-line px-5 py-3">
            <div className="flex items-center justify-between text-2xs text-muted">
              <span>Progress</span>
              <span className="tabular-nums">{percent}%</span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-navy-900/[0.07]">
              <div
                className="h-full origin-left rounded-full bg-ember-500 transition-transform duration-500 ease-emphasized"
                style={{ transform: `scaleX(${percent / 100})` }}
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-paper p-5">
          <div className="flex items-center gap-2 text-navy-900">
            <ShieldCheck className="h-4 w-4 text-success-600" aria-hidden />
            <p className="text-sm font-semibold">Private by design</p>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            Documents are private to authorized recruitment administrators.
          </p>
          <Link
            to="/privacy"
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-navy-800 underline-offset-2 hover:underline"
          >
            {applyCopy.privacyLink}
            <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        </div>

        <p className="px-1 text-2xs leading-relaxed text-muted">{applyCopy.saveNote}</p>
      </div>
    </aside>
  );
}

function ReviewRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-2xs font-semibold uppercase tracking-[0.1em] text-muted sm:pt-0.5">{label}</dt>
      <dd className="break-words text-sm text-navy-900">{value || <span className="text-muted">Not provided</span>}</dd>
    </div>
  );
}

function ReviewSection({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-paper/60 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-navy-700">{title}</h3>
        <button
          type="button"
          onClick={onEdit}
          className="text-xs font-semibold text-ember-700 underline-offset-2 hover:underline"
        >
          Edit
        </button>
      </div>
      <dl className="mt-2 divide-y divide-line/70">{children}</dl>
    </section>
  );
}

function ClosedState({ config }: { config: PublicConfig }) {
  const isEarly = config.recruitment.closedReason === 'not_open_yet';
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-ember-wash opacity-70" aria-hidden />
      <div className="container-narrow relative py-16 sm:py-24">
        <div className="rounded-[2rem] border border-line bg-white p-8 shadow-soft sm:p-12">
          <div className="flex items-center gap-3">
            <span className="font-display text-sm tabular-nums text-navy-300">—</span>
            <span className="h-px w-8 bg-ember-500" aria-hidden />
            <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-ember-700">
              {config.recruitment.cycleName}
            </span>
          </div>
          <h1 className="display-section mt-4 font-semibold text-navy-900">
            {isEarly ? 'Applications open soon' : applyCopy.closed.title}
          </h1>
          <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-muted">
            {isEarly ? landingCopy.closed.earlyBody : applyCopy.closed.body}
          </p>
          {config.recruitment.opensAt && isEarly ? (
            <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-navy-50 px-3 py-1.5 text-xs font-medium text-navy-700">
              <LockKeyhole className="h-3.5 w-3.5" aria-hidden />
              Planned opening: {formatDateTimeWithZone(config.recruitment.opensAt, config.recruitment.timezone)}
            </p>
          ) : null}
          <p className="mt-5 max-w-lg border-l-2 border-ember-500 pl-4 text-xs leading-relaxed text-navy-700">
            {landingCopy.closed.contactNote}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to="/" className={buttonStyles({ variant: 'primary', size: 'md' })}>
              {landingCopy.closed.backHome}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link to="/privacy" className={buttonStyles({ variant: 'outline', size: 'md' })}>
              Privacy notice
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ApplyPage() {
  useDocumentTitle('Apply · ESME Recruitment');
  const { data: config, isLoading, isError, refetch } = usePublicConfig();
  const [searchParams] = useSearchParams();
  const preselected = searchParams.get('department');
  const navigate = useNavigate();
  const toast = useToast();
  const reduceMotion = useReducedMotion();
  const formCardRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState(0);
  const [documents, setDocuments] = useState<DocumentFiles>({
    national_id: null,
    university_id: null,
  });
  const [documentErrors, setDocumentErrors] = useState<DocumentErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [idempotencyKey] = useState(createIdempotencyKey);

  const form = useForm<ApplicationFormValues>({
    resolver: zodResolver(applicationFormSchema),
    defaultValues: emptyApplication,
    mode: 'onTouched',
  });

  const values = form.watch();
  const primarySlug = values.primaryDepartmentSlug;

  useEffect(() => {
    if (!config || !preselected) return;
    if (config.departments.some((department) => department.slug === preselected)) {
      form.setValue('primaryDepartmentSlug', preselected, { shouldValidate: true });
    }
  }, [config, preselected, form]);

  useEffect(() => {
    if (values.secondaryDepartmentSlug && values.secondaryDepartmentSlug === primarySlug) {
      form.setValue('secondaryDepartmentSlug', '');
    }
  }, [primarySlug, values.secondaryDepartmentSlug, form]);

  const dirty = form.formState.isDirty || Boolean(documents.national_id || documents.university_id);

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirty || isSubmitting) return;
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty, isSubmitting]);

  const stepId = APPLY_STEPS[step]?.id ?? 'personal';
  const stepLabel = applyCopy.stepLabels[stepId];
  const totalSteps = APPLY_STEPS.length;

  const primaryDepartment = useMemo(
    () => config?.departments.find((department) => department.slug === values.primaryDepartmentSlug),
    [config, values.primaryDepartmentSlug],
  );
  const secondaryDepartment = useMemo(
    () => config?.departments.find((department) => department.slug === values.secondaryDepartmentSlug),
    [config, values.secondaryDepartmentSlug],
  );

  function scrollToForm() {
    formCardRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }

  function validateDocument(type: DocumentType, file: File): string | null {
    if (!config) return 'Recruitment settings are not available.';
    const requirement = type === 'national_id' ? config.documents.nationalId : config.documents.universityId;
    if (!requirement.allowedTypes.includes(file.type)) {
      return `Choose a ${acceptedFormats(requirement.allowedTypes)} file for ${DOCUMENT_TYPE_LABELS[type]}.`;
    }
    if (file.size === 0) return 'This file appears to be empty. Choose a different file.';
    if (file.size > config.documents.maxSizeBytes) {
      return `This file is larger than ${formatBytes(config.documents.maxSizeBytes)}. Compress it and try again.`;
    }
    return null;
  }

  function selectDocument(type: DocumentType, file: File) {
    const error = validateDocument(type, file);
    setDocumentErrors((current) => ({ ...current, [type]: error ?? undefined }));
    if (error) {
      setDocuments((current) => ({ ...current, [type]: null }));
      return;
    }
    setDocuments((current) => ({ ...current, [type]: file }));
  }

  function validateDocumentsStep(): boolean {
    if (!config) return false;
    const errors: DocumentErrors = {};
    if (config.documents.nationalId.required && !documents.national_id) {
      errors.national_id = 'Upload your national ID to continue.';
    }
    if (config.documents.universityId.required && !documents.university_id) {
      errors.university_id = 'Upload your university ID card to continue.';
    }
    setDocumentErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleNext() {
    if (!config) return;
    const definition = APPLY_STEPS[step];
    if (!definition) return;

    if (definition.id === 'documents' && !validateDocumentsStep()) {
      scrollToForm();
      return;
    }

    if (definition.id === 'links' && config.form.requireExperience) {
      if (form.getValues('experience').trim().length < 10) {
        form.setError('experience', {
          message: 'Describe your relevant experience (at least 10 characters)',
        });
        scrollToForm();
        return;
      }
    }

    const fields = [...definition.fields] as (keyof ApplicationFormValues)[];
    const valid = fields.length === 0 ? true : await form.trigger(fields);
    if (!valid) {
      scrollToForm();
      return;
    }
    setSubmitError(null);
    setStep((current) => Math.min(totalSteps - 1, current + 1));
    scrollToForm();
  }

  function handleBack() {
    setSubmitError(null);
    setStep((current) => Math.max(0, current - 1));
    scrollToForm();
  }

  function jumpTo(target: number) {
    setStep(target);
    scrollToForm();
  }

  async function onSubmit(rawValues: ApplicationFormValues) {
    if (!config) return;
    if (!validateDocumentsStep()) {
      setStep(4);
      scrollToForm();
      return;
    }

    setIsSubmitting(true);
    setProgress(0);
    setSubmitError(null);

    const formData = new FormData();
    formData.append(
      'payload',
      JSON.stringify(
        buildSubmissionPayload(rawValues, {
          requireExperience: config.form.requireExperience,
          additionalInformationEnabled: config.form.additionalInformationEnabled,
        }),
      ),
    );
    if (documents.national_id) formData.append('national_id', documents.national_id);
    if (documents.university_id) formData.append('university_id', documents.university_id);

    try {
      const result = await uploadApplication(formData, {
        idempotencyKey,
        onProgress: (value) => setProgress(value),
      });
      navigate('/apply/success', {
        replace: true,
        state: { reference: result.reference, submittedAt: result.submittedAt },
      });
    } catch (error) {
      setIsSubmitting(false);
      if (error instanceof ApiError) {
        if (error.details.length > 0) {
          const first = error.details[0];
          if (first) {
            if (first.path === 'national_id' || first.path === 'university_id') {
              setDocumentErrors((current) => ({ ...current, [first.path]: first.message }));
              setStep(4);
            } else {
              form.setError(first.path as keyof ApplicationFormValues, { message: first.message });
              setStep(stepForField(first.path));
            }
            scrollToForm();
          }
        }
        setSubmitError(error.message);
        toast.error('Submission failed', error.message);
      } else {
        setSubmitError('Something went wrong while submitting. Your answers are still here — try again.');
        toast.error('Submission failed', 'Your answers are still on this page.');
      }
    }
  }

  const stepsDone = step;
  const stepPercent = Math.round(((step + 1) / totalSteps) * 100);

  if (isLoading) {
    return (
      <div className="container-narrow py-16">
        <PageLoader label="Loading application form" />
      </div>
    );
  }

  if (isError || !config) {
    return (
      <div className="container-narrow py-16 sm:py-24">
        <div className="card p-8 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-warning-50 text-warning-600">
            <AlertTriangle className="h-5 w-5" aria-hidden />
          </span>
          <h1 className="mt-5 font-display text-2xl font-semibold text-navy-900">
            The application form is unavailable
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            We could not load the recruitment configuration. This is usually temporary.
          </p>
          <Button className="mt-6" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (!config.recruitment.open) {
    return <ClosedState config={config} />;
  }

  const allowedYears = (config.form.academicYears.length > 0 ? config.form.academicYears : ACADEMIC_YEARS) as readonly string[];
  const documentRequirements = [
    {
      type: 'national_id' as const,
      requirement: config.documents.nationalId,
      description: 'A clear PDF copy of your national ID. This is used only to verify your identity.',
    },
    {
      type: 'university_id' as const,
      requirement: config.documents.universityId,
      description: 'A clear photo or scan of your university ID card, with your name and photo visible.',
    },
  ];

  return (
    <div className="bg-mist/50">
      <div className="relative overflow-hidden border-b border-line bg-white">
        <div className="pointer-events-none absolute inset-0 bg-ember-wash opacity-60" aria-hidden />
        <div className="container-page relative py-8 sm:py-10">
          <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Application' }]} />
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="flex items-center gap-3 text-2xs font-semibold uppercase tracking-[0.18em] text-navy-500">
                <span className="h-px w-7 bg-ember-500" aria-hidden />
                {config.recruitment.title}
              </p>
              <AnimatedHeading as="h1" className="display-section mt-3 font-semibold text-navy-900">
                {applyCopy.title}
              </AnimatedHeading>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">{applyCopy.subtitle}</p>
            </div>
            <div className="flex flex-col items-start gap-2.5 sm:items-end">
              <Badge tone="success" dot>
                {config.recruitment.cycleName}
              </Badge>
              <p className="rounded-full border border-line bg-white/80 px-3 py-1.5 text-2xs text-muted">
                {config.recruitment.deadline
                  ? `${applyCopy.deadlineLabel} ${formatDateTimeWithZone(config.recruitment.deadline, config.recruitment.timezone)}`
                  : 'No closing date announced'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container-page py-8 sm:py-12">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-10">
          <div ref={formCardRef}>
            <div className="mb-6 flex items-center gap-3 lg:hidden">
              <div className="flex flex-1 gap-1" aria-hidden>
                {APPLY_STEPS.map((item, index) => (
                  <span
                    key={item.id}
                    className={cn(
                      'h-1 flex-1 rounded-full transition-colors duration-300',
                      index <= step ? 'bg-ember-500' : 'bg-navy-900/10',
                    )}
                  />
                ))}
              </div>
              <span className="text-2xs tabular-nums text-muted">{stepPercent}%</span>
            </div>

            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.55, delay: reduceMotion ? 0 : 0.06, ease: bezier(EASE.emphasized) }}
              className="card overflow-hidden"
            >
              <div className="relative border-b border-line bg-white/80 px-5 py-4 sm:px-7">                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-ember-700">
                      Step {step + 1} of {totalSteps}
                    </p>
                    <h2 className="mt-1 font-display text-xl font-semibold text-navy-900">{stepLabel}</h2>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="hidden items-center gap-1.5 text-2xs text-muted sm:flex">
                      <ClipboardCheck className="h-3.5 w-3.5" aria-hidden />
                      {stepsDone} of {totalSteps} complete
                    </span>
                    <span className="font-display text-3xl tabular-nums leading-none text-navy-200">
                      {String(step + 1).padStart(2, '0')}
                    </span>
                  </div>
                </div>
                <div className="absolute inset-x-0 bottom-0 h-px bg-navy-900/[0.06]" aria-hidden>
                  <div
                    className="h-full origin-left bg-ember-500 transition-transform duration-500 ease-emphasized"
                    style={{ transform: `scaleX(${stepPercent / 100})` }}
                  />
                </div>
              </div>

              <form onSubmit={form.handleSubmit(onSubmit)} noValidate aria-busy={isSubmitting}>
                <div className="px-5 py-6 sm:px-7 sm:py-8">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={stepId}
                      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                      transition={reduceMotion ? { duration: 0 } : motionTransition.standard}
                    >
                      {step === 0 ? (
                        <div className="grid gap-5 sm:grid-cols-2">
                          <TextField
                            label="Full legal name"
                            required
                            placeholder="As written on your national ID"
                            autoComplete="name"
                            error={form.formState.errors.fullName?.message}
                            hint="Use the same spelling as your national ID."
                            {...form.register('fullName')}
                          />
                          <TextField
                            label="Preferred name"
                            optional
                            placeholder="How should we address you?"
                            autoComplete="nickname"
                            error={form.formState.errors.preferredName?.message}
                            {...form.register('preferredName')}
                          />
                          <TextField
                            label="Email address"
                            type="email"
                            inputMode="email"
                            required
                            placeholder="you@example.com"
                            autoComplete="email"
                            error={form.formState.errors.email?.message}
                            hint="The team will use this address to contact you."
                            {...form.register('email')}
                          />
                          <TextField
                            label="Phone number"
                            type="tel"
                            inputMode="tel"
                            required
                            placeholder="+20 10 1234 5678"
                            autoComplete="tel"
                            error={form.formState.errors.phone?.message}
                            hint="Include your country code if you are outside Egypt."
                            {...form.register('phone')}
                          />
                        </div>
                      ) : null}

                      {step === 1 ? (
                        <div className="grid gap-5 sm:grid-cols-2">
                          <TextField
                            label="University"
                            required
                            autoComplete="organization"
                            error={form.formState.errors.university?.message}
                            hint={
                              config.form.allowOtherUniversities
                                ? 'Cairo University students are the default, but other universities may apply.'
                                : 'Applications are limited to Cairo University students.'
                            }
                            readOnly={!config.form.allowOtherUniversities}
                            {...form.register('university')}
                          />
                          <TextField
                            label="Faculty"
                            required
                            placeholder="e.g. Faculty of Engineering"
                            error={form.formState.errors.faculty?.message}
                            {...form.register('faculty')}
                          />
                          <TextField
                            label="Academic department or major"
                            required
                            placeholder="e.g. Computer Engineering"
                            error={form.formState.errors.academicDepartment?.message}
                            {...form.register('academicDepartment')}
                          />
                          <SelectField
                            label="Academic year"
                            required
                            error={form.formState.errors.academicYear?.message}
                            {...form.register('academicYear')}
                          >
                            <option value="">Select your year</option>
                            {allowedYears.map((year) => (
                              <option key={year} value={year}>
                                {year}
                              </option>
                            ))}
                          </SelectField>
                        </div>
                      ) : null}

                      {step === 2 ? (
                        <div className="space-y-6">
                          <fieldset>
                            <legend className="text-sm font-medium text-navy-900">
                              Primary department <span className="text-ember-600">*</span>
                            </legend>
                            <p className="mt-1 text-xs text-muted">
                              Your primary choice is considered first by the recruitment team.
                            </p>
                            <div className="mt-3 grid gap-2.5">
                              {config.departments.map((department) => {
                                const selected = values.primaryDepartmentSlug === department.slug;
                                return (
                                  <label
                                    key={department.id}
                                    className={cn(
                                      'flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition',
                                      selected
                                        ? 'border-navy-900 bg-navy-50/70 ring-1 ring-navy-900'
                                        : 'border-line bg-white hover:border-navy-300',
                                    )}
                                  >
                                    <input
                                      type="radio"
                                      className="mt-1 h-4 w-4 shrink-0 accent-ember-600"
                                      value={department.slug}
                                      {...form.register('primaryDepartmentSlug')}
                                    />
                                    <span className="min-w-0">
                                      <span className="block text-sm font-semibold text-navy-900">
                                        {department.name}
                                      </span>
                                      <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                                        {department.description}
                                      </span>
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                            {form.formState.errors.primaryDepartmentSlug ? (
                              <p className="field-error" role="alert">
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                                {form.formState.errors.primaryDepartmentSlug.message}
                              </p>
                            ) : null}
                          </fieldset>

                          {config.form.allowSecondaryPreference ? (
                            <SelectField
                              label="Secondary department"
                              optional
                              error={form.formState.errors.secondaryDepartmentSlug?.message}
                              hint="Optional. Choose a different department only if you would genuinely consider it."
                              {...form.register('secondaryDepartmentSlug')}
                            >
                              <option value="">No second preference</option>
                              {config.departments
                                .filter((department) => department.slug !== values.primaryDepartmentSlug)
                                .map((department) => (
                                  <option key={department.id} value={department.slug}>
                                    {department.name}
                                  </option>
                                ))}
                            </SelectField>
                          ) : null}
                        </div>
                      ) : null}

                      {step === 3 ? (
                        <div className="space-y-5">
                          <div className="grid gap-5 sm:grid-cols-3">
                            <TextField
                              label="GitHub"
                              optional
                              type="url"
                              inputMode="url"
                              placeholder="https://github.com/username"
                              error={form.formState.errors.githubUrl?.message}
                              {...form.register('githubUrl')}
                            />
                            <TextField
                              label="LinkedIn"
                              optional
                              type="url"
                              inputMode="url"
                              placeholder="https://linkedin.com/in/username"
                              error={form.formState.errors.linkedinUrl?.message}
                              {...form.register('linkedinUrl')}
                            />
                            <TextField
                              label="Portfolio"
                              optional
                              type="url"
                              inputMode="url"
                              placeholder="https://your-site.com"
                              error={form.formState.errors.portfolioUrl?.message}
                              {...form.register('portfolioUrl')}
                            />
                          </div>

                          <TextAreaField
                            label="Why do you want to join ESME?"
                            required
                            rows={7}
                            placeholder="Tell us what you want to build, learn or contribute in your chosen department."
                            error={form.formState.errors.motivationStatement?.message}
                            hint="Be specific and honest. A clear motivation matters more than polished wording."
                            counter={{ value: values.motivationStatement.length, max: 4000 }}
                            {...form.register('motivationStatement')}
                          />

                          <TextAreaField
                            label="Relevant experience or skills"
                            required={config.form.requireExperience}
                            optional={!config.form.requireExperience}
                            rows={4}
                            placeholder="Projects, coursework, competitions, tools you use."
                            error={form.formState.errors.experience?.message}
                            hint="Short and specific is enough — links can go in the fields above."
                            counter={{ value: values.experience.length, max: 2000 }}
                            {...form.register('experience')}
                          />

                          {config.form.additionalInformationEnabled ? (
                            <TextAreaField
                              label="Anything else we should know?"
                              optional
                              rows={3}
                              error={form.formState.errors.additionalInformation?.message}
                              counter={{ value: values.additionalInformation.length, max: 2000 }}
                              {...form.register('additionalInformation')}
                            />
                          ) : null}
                        </div>
                      ) : null}

                      {step === 4 ? (
                        <div className="space-y-7">
                          <div className="flex items-start gap-3 rounded-xl bg-navy-50 p-4 text-xs leading-relaxed text-navy-800">
                            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-navy-600" aria-hidden />
                            <p>{applyCopy.documentHelp}</p>
                          </div>

                          {documentRequirements.map(({ type, requirement, description }) => (
                            <FileUpload
                              key={type}
                              id={`document-${type}`}
                              label={DOCUMENT_TYPE_LABELS[type]}
                              description={description}
                              required={requirement.required}
                              allowedTypes={requirement.allowedTypes}
                              maxBytes={config.documents.maxSizeBytes}
                              file={documents[type]}
                              error={documentErrors[type]}
                              disabled={isSubmitting}
                              onSelect={(file) => selectDocument(type, file)}
                              onRemove={() => {
                                setDocuments((current) => ({ ...current, [type]: null }));
                                setDocumentErrors((current) => ({ ...current, [type]: undefined }));
                              }}
                            />
                          ))}

                          <p className="flex items-center gap-2 text-2xs text-muted">
                            <ImageIcon className="h-3.5 w-3.5" aria-hidden />
                            Accepted formats and size limits are configured by the recruitment team and verified
                            on the server.
                          </p>
                        </div>
                      ) : null}

                      {step === 5 ? (
                        <div className="space-y-5">
                          {submitError ? (
                            <div className="rounded-xl border border-danger-100 bg-danger-50 p-4" role="alert">
                              <p className="flex items-center gap-2 text-sm font-semibold text-danger-700">
                                <AlertTriangle className="h-4 w-4" aria-hidden />
                                We could not submit your application
                              </p>
                              <p className="mt-1 text-xs leading-relaxed text-danger-700">{submitError}</p>
                              <p className="mt-2 text-2xs text-danger-700/80">
                                Your answers are still on this page. Press Submit application to try again.
                              </p>
                            </div>
                          ) : (
                            <div className="flex items-start gap-3 rounded-xl border border-line bg-paper p-4">
                              <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-ember-600" aria-hidden />
                              <p className="text-xs leading-relaxed text-navy-800">
                                {applyCopy.reviewNoteTitle}. {applyCopy.confirmAccuracy}
                              </p>
                            </div>
                          )}

                          <div className="grid gap-4">
                            <ReviewSection title="Personal information" onEdit={() => jumpTo(0)}>
                              <ReviewRow label="Full name" value={values.fullName} />
                              <ReviewRow label="Preferred name" value={values.preferredName} />
                              <ReviewRow label="Email" value={values.email} />
                              <ReviewRow label="Phone" value={values.phone} />
                            </ReviewSection>

                            <ReviewSection title="Academic information" onEdit={() => jumpTo(1)}>
                              <ReviewRow label="University" value={values.university} />
                              <ReviewRow label="Faculty" value={values.faculty} />
                              <ReviewRow label="Department" value={values.academicDepartment} />
                              <ReviewRow label="Year" value={values.academicYear} />
                            </ReviewSection>

                            <ReviewSection title="Department preference" onEdit={() => jumpTo(2)}>
                              <ReviewRow
                                label="Primary"
                                value={primaryDepartment?.name ?? values.primaryDepartmentSlug}
                              />
                              <ReviewRow label="Secondary" value={secondaryDepartment?.name ?? ''} />
                            </ReviewSection>

                            <ReviewSection title="Links and motivation" onEdit={() => jumpTo(3)}>
                              <ReviewRow label="GitHub" value={values.githubUrl} />
                              <ReviewRow label="LinkedIn" value={values.linkedinUrl} />
                              <ReviewRow label="Portfolio" value={values.portfolioUrl} />
                              <div className="grid gap-0.5 py-2 sm:grid-cols-[10rem_1fr] sm:gap-4">
                                <dt className="text-2xs font-semibold uppercase tracking-[0.1em] text-muted">
                                  Motivation
                                </dt>
                                <dd className="whitespace-pre-wrap break-words text-sm leading-relaxed text-navy-900">
                                  {values.motivationStatement}
                                </dd>
                              </div>
                              {values.experience ? (
                                <div className="grid gap-0.5 py-2 sm:grid-cols-[10rem_1fr] sm:gap-4">
                                  <dt className="text-2xs font-semibold uppercase tracking-[0.1em] text-muted">
                                    Experience
                                  </dt>
                                  <dd className="whitespace-pre-wrap break-words text-sm leading-relaxed text-navy-900">
                                    {values.experience}
                                  </dd>
                                </div>
                              ) : null}
                            </ReviewSection>

                            <ReviewSection title="Documents" onEdit={() => jumpTo(4)}>
                              <ReviewRow
                                label="National ID"
                                value={
                                  documents.national_id ? (
                                    <span className="inline-flex items-center gap-2">
                                      <Paperclip className="h-3.5 w-3.5 text-muted" aria-hidden />
                                      {documents.national_id.name}
                                    </span>
                                  ) : (
                                    'Not uploaded'
                                  )
                                }
                              />
                              <ReviewRow
                                label="University ID"
                                value={
                                  documents.university_id ? (
                                    <span className="inline-flex items-center gap-2">
                                      <Paperclip className="h-3.5 w-3.5 text-muted" aria-hidden />
                                      {documents.university_id.name}
                                    </span>
                                  ) : (
                                    'Not uploaded'
                                  )
                                }
                              />
                            </ReviewSection>
                          </div>

                          <div className="rounded-xl border border-line bg-white p-4">
                            <CheckboxField
                              name={form.register('consentAccepted').name}
                              inputRef={form.register('consentAccepted').ref}
                              onChange={form.register('consentAccepted').onChange}
                              onBlur={form.register('consentAccepted').onBlur}
                              label={
                                <>
                                  {en.form.consentLabel}{' '}
                                  <Link
                                    to="/privacy"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="font-semibold text-navy-900 underline underline-offset-2 hover:text-ember-700"
                                  >
                                    {applyCopy.privacyLink}
                                  </Link>
                                  .
                                </>
                              }
                              checked={values.consentAccepted}
                              error={form.formState.errors.consentAccepted?.message}
                            />
                          </div>
                          <p className="text-2xs leading-relaxed text-muted">
                            {applyCopy.successNote} Submitting an application does not mean you have been
                            accepted.
                          </p>
                        </div>
                      ) : null}
                    </motion.div>
                  </AnimatePresence>
                </div>

                <div className="border-t border-line bg-white/90 px-5 py-4 sm:px-7">
                  {isSubmitting ? (
                    <div className="mb-4" aria-live="polite">
                      <div className="flex items-center justify-between text-xs font-medium text-navy-800">
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          {progress < 100 ? 'Uploading your application…' : 'Processing your application…'}
                        </span>
                        <span className="tabular-nums">{progress}%</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-navy-900/10">
                        <div
                          className="h-full origin-left rounded-full bg-ember-500 transition-transform duration-300"
                          style={{ transform: `scaleX(${Math.max(6, progress) / 100})` }}
                        />
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        onClick={handleBack}
                        disabled={step === 0 || isSubmitting}
                        className="w-full sm:w-auto"
                      >
                        <ArrowLeft className="h-4 w-4" aria-hidden />
                        {en.form.back}
                      </Button>
                      <span className="hidden text-2xs text-muted sm:block">{applyCopy.saveNote}</span>
                    </div>

                    {step < totalSteps - 1 ? (
                      <Button variant="primary" onClick={() => void handleNext()} disabled={isSubmitting}>
                        {en.form.next}
                        <ArrowRight className="h-4 w-4" aria-hidden />
                      </Button>
                    ) : (
                      <Button type="submit" variant="accent" disabled={isSubmitting}>
                        {isSubmitting ? en.form.submitting : en.form.submit}
                        {!isSubmitting ? <ArrowRight className="h-4 w-4" aria-hidden /> : null}
                      </Button>
                    )}
                  </div>
                </div>
              </form>
            </motion.div>

            <p className="mt-4 text-center text-2xs text-muted lg:hidden">
              Your answers are not saved until you submit.
            </p>
          </div>

          <StepAside step={step} total={totalSteps} />
        </div>
      </div>
    </div>
  );
}

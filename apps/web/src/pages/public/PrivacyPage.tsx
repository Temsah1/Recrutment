import { Link } from 'react-router-dom';
import { ArrowRight, Database, FileLock2, ShieldCheck, TimerReset } from 'lucide-react';
import { Button, buttonStyles } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { PageLoader } from '../../components/ui/Skeleton';
import { useDocumentTitle } from '../../lib/hooks';
import { usePublicConfig } from '../../lib/public';

const summaries = [
  {
    icon: Database,
    title: 'What we collect',
    body: 'Contact details, academic information, department preferences, links you choose to share, and the documents required for verification.',
  },
  {
    icon: FileLock2,
    title: 'How documents are stored',
    body: 'National ID and university ID files are kept in private storage on ESME-controlled infrastructure — never in a public web directory.',
  },
  {
    icon: ShieldCheck,
    title: 'Who can access it',
    body: 'Only signed-in administrators with an active recruitment role. Access to identity documents is recorded in an audit log.',
  },
  {
    icon: TimerReset,
    title: 'How long it is kept',
    body: 'Applications are retained for the recruitment cycle and according to the retention policy configured by the chapter.',
  },
];

export function PrivacyPage() {
  useDocumentTitle('Privacy notice · ESME Recruitment');
  const { data: config, isLoading, isError, refetch } = usePublicConfig();

  const paragraphs = (config?.privacy.text ?? '')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <div className="bg-white">
      <div className="border-b border-line bg-paper">
        <div className="container-narrow py-12 sm:py-16">
          <p className="eyebrow">Information</p>
          <h1 className="display-tight mt-3 text-4xl font-semibold text-navy-900 sm:text-5xl">
            Privacy notice
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">
            How ESME handles the information and documents submitted through the recruitment portal.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {config ? (
              <Badge tone="neutral">Policy version {config.privacy.version}</Badge>
            ) : null}
            <Badge tone="success" dot>
              Private document storage
            </Badge>
          </div>
        </div>
      </div>

      <div className="container-narrow py-10 sm:py-14">
        {isLoading ? <PageLoader label="Loading privacy notice" /> : null}

        {isError || !config ? (
          !isLoading ? (
            <div className="rounded-2xl border border-warning-100 bg-warning-50 p-6 text-center">
              <p className="text-sm font-semibold text-warning-700">The privacy notice could not be loaded.</p>
              <p className="mt-1 text-xs text-warning-700">
                This is usually temporary. Please try again before submitting an application.
              </p>
              <Button className="mt-4" variant="outline" onClick={() => void refetch()}>
                Try again
              </Button>
            </div>
          ) : null
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {summaries.map(({ icon: Icon, title, body }) => (
                <div key={title} className="rounded-2xl border border-line bg-paper p-5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-navy-800 ring-1 ring-line">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <h2 className="mt-3 text-sm font-semibold text-navy-900">{title}</h2>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{body}</p>
                </div>
              ))}
            </div>

            <article className="mt-10 space-y-5 text-[15px] leading-relaxed text-navy-800">
              {paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </article>

            <div className="mt-10 flex flex-col gap-3 border-t border-line pt-8 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-navy-900">Ready to apply?</p>
                <p className="mt-1 text-xs text-muted">
                  {config.recruitment.open
                    ? 'The application form is open for this cycle.'
                    : 'Applications are currently closed. You can review the process and check back later.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to="/" className={buttonStyles({ variant: 'ghost', size: 'md' })}>
                  Back to overview
                </Link>
                <Link to="/apply" className={buttonStyles({ variant: 'primary', size: 'md' })}>
                  {config.recruitment.open ? 'Apply now' : 'View application status'}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

import { useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Check,
  ChevronDown,
  Clock,
  Code2,
  Compass,
  Hammer,
  Layers,
  LifeBuoy,
  LineChart,
  LockKeyhole,
  Server,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { en, type DepartmentDTO, type PublicConfig } from '@esme/shared';
import { buttonStyles } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { AnimatedHeading } from '../../components/motion/AnimatedHeading';
import { Reveal, StaggerGroup, StaggerItem } from '../../components/motion/Reveal';
import { ScrollProgress } from '../../components/motion/ScrollProgress';
import { cn } from '../../lib/cn';
import { landingCopy } from '../../lib/copy';
import { useDocumentTitle } from '../../lib/hooks';
import { usePublicConfig } from '../../lib/public';
import { formatDateTimeWithZone } from '../../lib/format';
import { EASE, bezier } from '../../lib/motion';

const departmentIcons: Record<string, LucideIcon> = {
  'frontend-development': Code2,
  'backend-development': Server,
  'it-helpdesk': LifeBuoy,
  'ai-automation': Workflow,
  'ml-data-analysis': LineChart,
};

const pillarIcons: Record<'hammer' | 'users' | 'compass', LucideIcon> = {
  hammer: Hammer,
  users: Users,
  compass: Compass,
};

const routeSteps = ['Personal', 'Academic', 'Department', 'Motivation', 'Documents', 'Review'] as const;

function RecruitmentStatus({ config }: { config?: PublicConfig }) {
  if (!config) {
    return <div className="h-7 w-48 animate-pulse-soft rounded-full bg-navy-900/[0.06]" aria-hidden />;
  }
  const { open, closedReason, cycleName, deadline, timezone } = config.recruitment;
  if (open) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Badge tone="success" dot className="px-3 py-1.5 text-xs">
          {en.hero.openBadge}
        </Badge>
        <span className="text-xs font-medium text-muted">
          {cycleName}
          {deadline ? ` · ${en.hero.deadlinePrefix} ${formatDateTimeWithZone(deadline, timezone)}` : ''}
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Badge tone="neutral" dot className="px-3 py-1.5 text-xs">
        {closedReason === 'not_open_yet' ? 'Applications open soon' : en.hero.closedBadge}
      </Badge>
      <span className="text-xs font-medium text-muted">{cycleName}</span>
    </div>
  );
}

function CyclePanel({ config }: { config?: PublicConfig }) {
  const reduceMotion = useReducedMotion();
  const open = config?.recruitment.open;
  const deadline = config?.recruitment.deadline;

  return (
    <div className="relative mx-auto w-full max-w-[31rem]">
      <div
        className="absolute -inset-3 -z-10 rounded-[2.4rem] border border-line/80 bg-white/50"
        aria-hidden
      />
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: 22 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.72, delay: reduceMotion ? 0 : 0.2, ease: bezier(EASE.emphasized) }}
        className="relative overflow-hidden rounded-[2rem] bg-navy-950 p-6 text-white shadow-lift sm:p-8"
      >
        <div className="pointer-events-none absolute inset-0 bg-navy-glow opacity-90" aria-hidden />
        <div className="grain" aria-hidden />

        <div className="relative">
          <div className="flex items-center justify-between gap-4">
            <p className="text-2xs font-semibold uppercase tracking-[0.2em] text-navy-300">
              Current cycle
            </p>
            <Badge tone={open ? 'success' : 'neutral'} dot className="bg-white/10 text-white ring-white/15">
              {open ? 'Open' : 'Closed'}
            </Badge>
          </div>

          <p className="mt-6 font-display text-[2rem] font-semibold leading-tight tracking-tight sm:text-[2.35rem]">
            {config?.recruitment.cycleName ?? 'Recruitment cycle'}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-navy-200">
            {open ? 'Applications are being accepted now.' : 'Applications are paused for this cycle.'}
          </p>

          <div className="mt-7 grid grid-cols-2 gap-5 border-y border-white/10 py-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-navy-400">
                Closing date
              </p>
              <p className="mt-1.5 text-sm font-medium text-navy-50">
                {config ? (
                  deadline ? (
                    formatDateTimeWithZone(deadline, config.recruitment.timezone)
                  ) : (
                    'Not announced'
                  )
                ) : (
                  '—'
                )}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-navy-400">
                Departments
              </p>
              <p className="mt-1.5 text-sm font-medium text-navy-50">
                {config ? `${config.departments.length} technical teams` : '—'}
              </p>
            </div>
          </div>

          <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.18em] text-navy-400">
            Application route
          </p>
          <ol className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2.5">
            {routeSteps.map((step, index) => (
              <li key={step} className="flex items-center gap-2.5 text-xs text-navy-100">
                <span className="font-mono text-[10px] text-ember-400">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>

          <div className="mt-7 flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3">
            <LockKeyhole className="h-3.5 w-3.5 shrink-0 text-ember-400" aria-hidden />
            <p className="text-2xs leading-relaxed text-navy-200">
              Documents are stored privately and visible only to authorized reviewers.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function SectionIntro({
  index,
  eyebrow,
  title,
  body,
  action,
  className,
}: {
  index: string;
  eyebrow: string;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between', className)}>
      <div className="max-w-2xl">
        <div className="flex items-center gap-3">
          <span className="font-display text-sm tabular-nums text-navy-300">{index}</span>
          <span className="h-px w-8 bg-ember-500" aria-hidden />
          <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-ember-700">{eyebrow}</span>
        </div>
        <AnimatedHeading as="h2" className="display-section mt-4 font-semibold text-navy-900">
          {title}
        </AnimatedHeading>
        {body ? <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">{body}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function DepartmentCard({ department, index }: { department: DepartmentDTO; index: number }) {
  const Icon = departmentIcons[department.slug] ?? Layers;
  return (
    <StaggerItem className="h-full">
      <Link
        to={`/apply?department=${encodeURIComponent(department.slug)}`}
        className="group flex h-full flex-col rounded-2xl border border-line bg-white p-6 transition duration-200 ease-standard hover:-translate-y-0.5 hover:border-navy-300 hover:shadow-soft"
      >
        <div className="flex items-start justify-between gap-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-paper text-navy-800 transition duration-200 group-hover:border-ember-200 group-hover:bg-ember-50 group-hover:text-ember-700">
            <Icon className="h-[18px] w-[18px]" aria-hidden />
          </span>
          <span className="font-display text-2xl font-medium tabular-nums leading-none text-navy-200">
            {String(index + 1).padStart(2, '0')}
          </span>
        </div>
        <h3 className="mt-6 text-[17px] font-semibold leading-snug text-navy-900">{department.name}</h3>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{department.description}</p>
        <span className="mt-6 inline-flex items-center gap-1.5 text-xs font-semibold text-navy-800">
          Apply for this department
          <ArrowUpRight
            className="h-3.5 w-3.5 transition duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ember-700"
            aria-hidden
          />
        </span>
      </Link>
    </StaggerItem>
  );
}

function DepartmentsSection({ config }: { config?: PublicConfig }) {
  return (
    <section id="departments" className="border-y border-line bg-mist/60 py-20 sm:py-24">
      <div className="container-page">
        <SectionIntro
          index="02"
          eyebrow={en.sections.departmentsTitle}
          title="Find the team where you can make an impact"
          body={en.sections.departmentsBody}
          action={
            <Link to="/apply" className={buttonStyles({ variant: 'outline', size: 'md' })}>
              Start an application
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          }
        />

        {config ? (
          <StaggerGroup className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {config.departments.map((department, index) => (
              <DepartmentCard key={department.id} department={department} index={index} />
            ))}
            <StaggerItem className="h-full">
              <div className="flex h-full flex-col justify-between rounded-2xl border border-navy-800 bg-navy-900 p-6 text-white">
                <div>
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-ember-400">
                    <Sparkles className="h-[18px] w-[18px]" aria-hidden />
                  </span>
                  <h3 className="mt-6 text-[17px] font-semibold leading-snug">Not sure yet?</h3>
                  <p className="mt-2 text-sm leading-relaxed text-navy-200">
                    Pick the closest fit. An optional second preference is available in the form.
                  </p>
                </div>
                <Link
                  to="/apply"
                  className="mt-6 inline-flex items-center gap-1.5 text-xs font-semibold text-ember-300 transition hover:text-ember-200"
                >
                  Start the application
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </div>
            </StaggerItem>
          </StaggerGroup>
        ) : (
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-56 rounded-2xl border border-line bg-white p-6">
                <div className="skeleton h-10 w-10 rounded-xl" />
                <div className="skeleton mt-6 h-4 w-3/4" />
                <div className="skeleton mt-3 h-3 w-full" />
                <div className="skeleton mt-2 h-3 w-5/6" />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function LandingPage() {
  useDocumentTitle('ESME Recruitment — Cairo University Student Chapter');
  const { data: config, isError, refetch } = usePublicConfig();
  const reduceMotion = useReducedMotion();
  const recruitmentOpen = config?.recruitment.open;
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const gridDrift = useTransform(scrollYProgress, [0, 1], [0, 52]);

  const rise = (delay: number, y = 16, duration = 0.62) => ({
    initial: reduceMotion ? false : { opacity: 0, y },
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: reduceMotion ? 0 : duration,
      delay: reduceMotion ? 0 : delay,
      ease: bezier(EASE.emphasized),
    },
  });

  const headingLine = (content: ReactNode, delay: number) =>
    reduceMotion ? (
      <span className="block">{content}</span>
    ) : (
      <span className="-mb-[0.12em] block overflow-hidden pb-[0.12em]">
        <motion.span
          className="block"
          initial={{ y: '112%' }}
          animate={{ y: '0%' }}
          transition={{ duration: 0.8, delay, ease: bezier(EASE.editorial) }}
        >
          {content}
        </motion.span>
      </span>
    );

  return (
    <>
      <ScrollProgress />

      <section ref={heroRef} className="relative overflow-hidden border-b border-line">
        <div
          className="pointer-events-none absolute inset-0 -z-10 animate-pulse-soft bg-ember-wash opacity-90 [animation-duration:9s]"
          aria-hidden
        />
        <motion.div
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[42rem] bg-grid-faint [background-size:64px_64px] [mask-image:linear-gradient(to_bottom,black,transparent_78%)]"
          style={reduceMotion ? undefined : { y: gridDrift }}
          aria-hidden
        />

        <div className="container-page grid items-center gap-14 py-14 sm:py-20 lg:grid-cols-[1.06fr_0.94fr] lg:gap-14 lg:py-24">
          <div>
            <motion.div {...rise(0)}>
              <RecruitmentStatus config={config} />
            </motion.div>

            <motion.div {...rise(0.1)}>
              <p className="mt-7 flex items-center gap-3 text-2xs font-semibold uppercase tracking-[0.18em] text-navy-500">
                <span className="h-px w-7 bg-ember-500" aria-hidden />
                {config?.recruitment.title ?? en.hero.eyebrow}
              </p>
            </motion.div>

            <motion.h1 {...rise(0.08, 24, 0.72)} className="display-hero mt-5 max-w-3xl font-semibold text-navy-900">
              {headingLine(
                <>
                  Build the <span className="accent-underline italic text-ember-600">future</span>
                </>,
                0.14,
              )}
              {headingLine(' with ESME.', 0.22)}
            </motion.h1>

            <motion.div {...rise(0.38, 14)}>
              <p className="mt-6 max-w-lg font-display text-xl leading-snug text-navy-800 sm:text-[1.6rem]">
                Find your team. Make an impact.
              </p>
            </motion.div>

            <motion.div {...rise(0.46, 14)}>
              <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
                {config?.recruitment.description ?? landingCopy.hero.supporting}
              </p>
            </motion.div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <motion.div {...rise(0.56, 12)}>
                <Link
                  to="/apply"
                  className={buttonStyles({
                    variant: recruitmentOpen === false ? 'outline' : 'accent',
                    size: 'lg',
                    className: 'w-full sm:min-w-[10.5rem] sm:w-auto',
                  })}
                >
                  {recruitmentOpen === false ? en.publicNav.applyClosed : en.hero.applyCta}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </motion.div>
              <motion.div {...rise(0.64, 12)}>
                <a
                  href="#departments"
                  className={buttonStyles({ variant: 'ghost', size: 'lg', className: 'w-full sm:w-auto' })}
                >
                  {en.hero.learnMore}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </a>
              </motion.div>
            </div>

            <motion.div {...rise(0.76, 10)}>
              <ul className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-2.5">
                {landingCopy.hero.trust.map((item) => (
                  <li key={item} className="inline-flex items-center gap-1.5 text-xs font-medium text-navy-700">
                    <BadgeCheck className="h-3.5 w-3.5 text-ember-600" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>

            {isError ? (
              <motion.div {...rise(0.8, 10)}>
                <div className="mt-8 flex flex-wrap items-center gap-3 rounded-xl border border-warning-100 bg-warning-50 px-4 py-3 text-xs text-warning-700">
                  Recruitment details could not be loaded. Check your connection.
                  <button
                    type="button"
                    onClick={() => void refetch()}
                    className="font-semibold underline underline-offset-2"
                  >
                    Retry
                  </button>
                </div>
              </motion.div>
            ) : null}
          </div>

          <motion.div
            className="lg:pl-2"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{
              duration: reduceMotion ? 0 : 0.72,
              delay: reduceMotion ? 0 : 0.2,
              ease: bezier(EASE.emphasized),
            }}
          >
            <CyclePanel config={config} />
          </motion.div>
        </div>

        <div className="container-page pb-12 sm:pb-16">
          <dl className="grid overflow-hidden rounded-2xl border border-line bg-white/70 backdrop-blur-sm sm:grid-cols-2 lg:grid-cols-4">
            <CycleFact
              icon={Sparkles}
              label="Recruitment cycle"
              value={config?.recruitment.cycleName ?? '—'}
              className="border-b border-line sm:border-r lg:border-b-0"
            />
            <CycleFact
              icon={BadgeCheck}
              label="Status"
              value={
                config
                  ? config.recruitment.open
                    ? 'Open for applications'
                    : config.recruitment.closedReason === 'not_open_yet'
                      ? 'Opening soon'
                      : 'Closed'
                  : '—'
              }
              tone={config?.recruitment.open ? 'success' : 'default'}
              className="border-b border-line lg:border-b-0 lg:border-r"
            />
            <CycleFact
              icon={Clock}
              label="Closing date"
              value={config?.recruitment.deadline ? formatDateTimeWithZone(config.recruitment.deadline, config.recruitment.timezone) : 'Not announced'}
              className="border-b border-line sm:border-b-0 sm:border-r"
            />
            <CycleFact
              icon={Layers}
              label="Departments"
              value={config ? `${config.departments.length} technical teams` : '—'}
            />
          </dl>
        </div>
      </section>

      <section id="overview" className="bg-white py-20 sm:py-28">
        <div className="container-page grid gap-12 lg:grid-cols-12 lg:gap-16">
          <Reveal className="lg:col-span-5" direction="left">
            <div className="flex items-center gap-3">
              <span className="font-display text-sm tabular-nums text-navy-300">01</span>
              <span className="h-px w-8 bg-ember-500" aria-hidden />
              <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-ember-700">
                {landingCopy.overview.eyebrow}
              </span>
            </div>
            <AnimatedHeading as="h2" className="display-section mt-4 font-semibold text-navy-900">
              {landingCopy.overview.title}
            </AnimatedHeading>
            <p className="mt-5 text-[15px] leading-relaxed text-muted">{landingCopy.overview.body}</p>
            <p className="mt-8 border-l-2 border-ember-500 pl-4 text-sm leading-relaxed text-navy-700">
              {en.sections.overviewBody}
            </p>
          </Reveal>

          <div className="lg:col-span-7">
            <div className="border-t border-line">
              {landingCopy.overview.pillars.map((pillar, index) => {
                const Icon = pillarIcons[pillar.icon];
                return (
                  <Reveal key={pillar.title} delay={index * 0.07} direction="right">
                    <div className="group flex gap-5 border-b border-line py-7 transition-colors duration-200 hover:bg-mist/50 sm:gap-7">
                      <span className="w-7 shrink-0 pt-1 font-display text-sm tabular-nums text-navy-300">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-paper text-navy-800">
                        <Icon className="h-[18px] w-[18px]" aria-hidden />
                      </span>
                      <div>
                        <h3 className="text-[17px] font-semibold text-navy-900">{pillar.title}</h3>
                        <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-muted">{pillar.body}</p>
                      </div>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <DepartmentsSection config={config} />

      <section id="process" className="py-20 sm:py-28">
        <div className="container-page">
          <SectionIntro
            index="03"
            eyebrow={landingCopy.process.eyebrow}
            title={en.sections.processTitle}
            body={landingCopy.process.body}
          />

          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
            {en.process.map((step, index) => (
              <Reveal key={step.title} delay={index * 0.07} className="h-full">
                <div className="group flex h-full flex-col bg-paper p-6 transition-colors duration-200 hover:bg-white sm:p-7">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-2xl font-medium tabular-nums text-navy-300 transition-colors duration-200 group-hover:text-ember-600">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    {index < en.process.length - 1 ? (
                      <ArrowRight className="h-4 w-4 text-navy-300" aria-hidden />
                    ) : (
                      <Check className="h-4 w-4 text-success-500" aria-hidden />
                    )}
                  </div>
                  <h3 className="mt-8 text-[15px] font-semibold text-navy-900">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={0.08}>
            <p className="mt-5 max-w-3xl text-xs leading-relaxed text-muted">{landingCopy.process.note}</p>
          </Reveal>
        </div>
      </section>

      <section id="guidelines" className="border-y border-line bg-white py-20 sm:py-28">
        <div className="container-page grid gap-12 lg:grid-cols-12 lg:gap-16">
          <Reveal className="lg:col-span-4">
            <div className="lg:sticky lg:top-28">
              <div className="flex items-center gap-3">
                <span className="font-display text-sm tabular-nums text-navy-300">04</span>
                <span className="h-px w-8 bg-ember-500" aria-hidden />
                <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-ember-700">
                  {landingCopy.guidelines.eyebrow}
                </span>
              </div>
              <AnimatedHeading as="h2" className="display-section mt-4 font-semibold text-navy-900">
                {en.sections.guidelinesTitle}
              </AnimatedHeading>
              <p className="mt-4 text-sm leading-relaxed text-muted">{landingCopy.guidelines.body}</p>
              <p className="mt-6 border-l-2 border-ember-500 pl-4 text-xs leading-relaxed text-navy-700">
                {landingCopy.guidelines.closing}
              </p>
            </div>
          </Reveal>

          <div className="lg:col-span-8">
            <ul className="grid gap-x-8 sm:grid-cols-2">
              {en.guidelines.map((guideline, index) => (
                <Reveal key={guideline} delay={index * 0.04}>
                  <li className="flex gap-3 border-b border-line py-4">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success-50 text-success-600">
                      <Check className="h-3 w-3" aria-hidden />
                    </span>
                    <span className="text-sm leading-relaxed text-navy-800">{guideline}</span>
                  </li>
                </Reveal>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section id="privacy" className="py-20 sm:py-28">
        <div className="container-page">
          <Reveal>
            <div className="overflow-hidden rounded-[2rem] border border-navy-800 bg-navy-950 text-white shadow-lift">
              <div className="grid lg:grid-cols-12">
                <div className="relative p-8 sm:p-10 lg:col-span-5">
                  <div className="absolute inset-0 bg-navy-glow opacity-70" aria-hidden />
                  <div className="relative">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-ember-400 ring-1 ring-inset ring-white/10">
                      <ShieldCheck className="h-5 w-5" aria-hidden />
                    </span>
                    <p className="mt-6 text-2xs font-semibold uppercase tracking-[0.18em] text-ember-300">
                      {landingCopy.privacy.eyebrow}
                    </p>
                    <h2 className="display-section mt-3 font-semibold">{en.sections.privacyTitle}</h2>
                    <p className="mt-4 text-sm leading-relaxed text-navy-200">{landingCopy.privacy.body}</p>
                    <Link
                      to="/privacy"
                      className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-ember-300 transition hover:text-ember-200"
                    >
                      {landingCopy.privacy.linkLabel}
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                  </div>
                </div>
                <div className="border-t border-white/10 bg-white/[0.03] p-8 sm:p-10 lg:col-span-7 lg:border-l lg:border-t-0">
                  <ul className="grid gap-5 sm:grid-cols-2">
                    {landingCopy.privacy.bullets.map((bullet) => (
                      <li key={bullet} className="flex gap-3">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ember-500/15 text-ember-300">
                          <LockKeyhole className="h-3 w-3" aria-hidden />
                        </span>
                        <span className="text-sm leading-relaxed text-navy-100">{bullet}</span>
                      </li>
                    ))}
                  </ul>
                  {config ? (
                    <p className="mt-8 border-t border-white/10 pt-5 text-2xs text-navy-300">
                      Privacy notice version {config.privacy.version} ·{' '}
                      <Link to="/privacy" className="underline underline-offset-2 hover:text-white">
                        Full notice
                      </Link>
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section id="faq" className="border-t border-line bg-white py-20 sm:py-28">
        <div className="container-page grid gap-12 lg:grid-cols-12 lg:gap-16">
          <Reveal className="lg:col-span-4">
            <div className="flex items-center gap-3">
              <span className="font-display text-sm tabular-nums text-navy-300">05</span>
              <span className="h-px w-8 bg-ember-500" aria-hidden />
              <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-ember-700">
                {landingCopy.faq.eyebrow}
              </span>
            </div>
            <AnimatedHeading as="h2" className="display-section mt-4 font-semibold text-navy-900">
              {en.sections.faqTitle}
            </AnimatedHeading>
            <p className="mt-4 text-sm leading-relaxed text-muted">{landingCopy.faq.body}</p>
          </Reveal>
          <div className="lg:col-span-8">
            <div className="border-t border-line">
              {en.faq.map((item, index) => (
                <details key={item.q} className="group border-b border-line">
                  <summary className="flex cursor-pointer list-none items-center gap-4 py-5 text-left text-sm font-semibold text-navy-900 transition-colors duration-200 hover:text-ember-700 [&::-webkit-details-marker]:hidden">
                    <span className="w-6 shrink-0 font-display text-xs tabular-nums text-navy-300">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="flex-1">{item.q}</span>
                    <ChevronDown
                      className="faq-chevron h-4 w-4 shrink-0 text-muted transition-transform duration-300"
                      aria-hidden
                    />
                  </summary>
                  <div className="faq-answer">
                    <div>
                      <p className="pb-5 pl-10 pr-8 text-sm leading-relaxed text-muted">{item.a}</p>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-24">
        <div className="container-page">
          <Reveal>
            <div className="relative overflow-hidden rounded-[2rem] bg-navy-950 px-6 py-14 text-white shadow-lift sm:px-12 sm:py-16">
              <div className="absolute inset-0 bg-navy-glow" aria-hidden />
              <div className="grain" aria-hidden />
              <div className="relative flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-xl">
                  <p className="text-2xs font-semibold uppercase tracking-[0.2em] text-ember-300">
                    {landingCopy.cta.eyebrow}
                  </p>
                  <h2 className="display-section mt-4 font-semibold">
                    {recruitmentOpen === false ? 'Applications are closed for now.' : landingCopy.cta.title}
                  </h2>
                  <p className="mt-4 text-sm leading-relaxed text-navy-200">
                    {recruitmentOpen === false ? landingCopy.closed.body : landingCopy.cta.body}
                  </p>
                  <p className="mt-5 text-xs leading-relaxed text-navy-200">
                    {recruitmentOpen === false ? landingCopy.closed.contactNote : landingCopy.cta.note}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-3 sm:flex-row lg:flex-col lg:items-stretch">
                  <Link to="/apply" className={buttonStyles({ variant: 'accent', size: 'lg' })}>
                    {recruitmentOpen === false ? 'View application status' : en.hero.applyCta}
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                  <Link
                    to="/privacy"
                    className="inline-flex h-12 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-6 text-[15px] font-semibold text-white transition hover:bg-white/10"
                  >
                    Read the privacy notice
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}

function CycleFact({
  icon: Icon,
  label,
  value,
  tone = 'default',
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  tone?: 'default' | 'success';
  className?: string;
}) {
  return (
    <div className={cn('bg-white/60 px-5 py-5', className)}>
      <dt className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
        <Icon className="h-3.5 w-3.5 text-navy-400" aria-hidden />
        {label}
      </dt>
      <dd
        className={cn(
          'mt-2 text-sm font-semibold leading-snug',
          tone === 'success' ? 'text-success-700' : 'text-navy-900',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

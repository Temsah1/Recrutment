import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { AnimatedHeading } from '../motion/AnimatedHeading';
import { cn } from '../../lib/cn';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  back,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { to: string; label: string };
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {back ? (
          <Link
            to={back.to}
            className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-muted transition hover:text-navy-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            {back.label}
          </Link>
        ) : null}
        {eyebrow ? <div className="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.16em] text-ember-700">{eyebrow}</div> : null}
        <AnimatedHeading as="h1" className="display-tight text-[1.75rem] font-semibold text-navy-900 sm:text-[2.05rem]">
          {title}
        </AnimatedHeading>
        {description ? (
          <div className="mt-2 max-w-xl text-[13px] leading-relaxed text-muted">{description}</div>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Breadcrumbs({
  items,
}: {
  items: { label: string; to?: string }[];
}) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1.5 text-xs text-muted">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="flex items-center gap-1.5">
          {index > 0 ? <ChevronRight className="h-3 w-3 opacity-60" aria-hidden /> : null}
          {item.to ? (
            <Link to={item.to} className="font-medium transition hover:text-navy-900">
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-navy-800" aria-current="page">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

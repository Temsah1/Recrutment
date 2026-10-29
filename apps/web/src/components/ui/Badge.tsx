import type { ReactNode } from 'react';
import { STATUS_LABELS, STATUS_TONES, type ApplicationStatus, type CycleStatus } from '@esme/shared';
import { cn } from '../../lib/cn';

export type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'accent' | 'navy';

const tones: Record<Tone, string> = {
  neutral: 'bg-navy-900/[0.055] text-navy-700 ring-navy-900/10',
  info: 'bg-info-50 text-info-700 ring-info-100',
  warning: 'bg-warning-50 text-warning-700 ring-warning-100',
  success: 'bg-success-50 text-success-700 ring-success-100',
  danger: 'bg-danger-50 text-danger-700 ring-danger-100',
  accent: 'bg-ember-50 text-ember-700 ring-ember-200',
  navy: 'bg-navy-900 text-white ring-navy-900',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
  dot = false,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-2xs font-semibold ring-1 ring-inset',
        tones[tone],
        className,
      )}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" aria-hidden /> : null}
      {children}
    </span>
  );
}

export function StatusBadge({ status, className }: { status: ApplicationStatus; className?: string }) {
  return (
    <Badge tone={STATUS_TONES[status]} dot className={className}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

const cycleTones: Record<CycleStatus, Tone> = {
  draft: 'neutral',
  open: 'success',
  closed: 'danger',
  archived: 'neutral',
};

export function CycleStatusBadge({ status }: { status: CycleStatus }) {
  return (
    <Badge tone={cycleTones[status]} dot>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

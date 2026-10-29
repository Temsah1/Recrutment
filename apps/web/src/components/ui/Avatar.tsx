import { initials } from '../../lib/format';
import { cn } from '../../lib/cn';

export function Avatar({
  name,
  size = 'md',
  className,
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizes = {
    sm: 'h-7 w-7 text-[10px]',
    md: 'h-9 w-9 text-xs',
    lg: 'h-12 w-12 text-sm',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-navy-900 font-semibold tracking-wide text-white ring-2 ring-white',
        sizes[size],
        className,
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

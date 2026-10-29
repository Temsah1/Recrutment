import { cn } from '../../lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton h-4 w-full', className)} aria-hidden />;
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} className={index === lines - 1 ? 'w-2/3' : 'w-full'} />
      ))}
    </div>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('card p-6', className)} aria-hidden>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-8 w-40" />
      <SkeletonText lines={2} className="mt-4" />
    </div>
  );
}

export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="table-shell" aria-hidden>
      <div className="flex gap-4 border-b border-line bg-mist/70 px-4 py-3">
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={index} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex gap-4 border-b border-line/70 px-4 py-4 last:border-b-0">
          {Array.from({ length: columns }).map((_, column) => (
            <Skeleton
              key={column}
              className={cn('h-4 flex-1', column === 0 && 'max-w-[14rem]')}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function PageLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div
      className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-sm text-muted"
      role="status"
      aria-live="polite"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-white shadow-soft">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-navy-900/20 border-t-ember-500" />
      </span>
      <span>{label}…</span>
    </div>
  );
}

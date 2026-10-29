import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';

function pageWindow(page: number, totalPages: number): (number | 'ellipsis')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages = new Set<number>([1, totalPages, page - 1, page, page + 1]);
  const sorted = [...pages].filter((value) => value >= 1 && value <= totalPages).sort((a, b) => a - b);
  const result: (number | 'ellipsis')[] = [];
  sorted.forEach((value, index) => {
    if (index > 0 && value - (sorted[index - 1] ?? value) > 1) result.push('ellipsis');
    result.push(value);
  });
  return result;
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
  total,
  itemLabel = 'results',
  className,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  total?: number;
  itemLabel?: string;
  className?: string;
}) {
  if (totalPages <= 1 && total === undefined) return null;
  return (
    <nav
      className={cn('flex flex-col items-center justify-between gap-3 sm:flex-row', className)}
      aria-label="Pagination"
    >
      <p className="text-xs text-muted">
        {total !== undefined ? (
          <>
            <span className="font-semibold text-navy-900">{total.toLocaleString()}</span> {itemLabel}
            {' · '}
          </>
        ) : null}
        Page {page} of {Math.max(1, totalPages)}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-white text-navy-700 transition hover:bg-mist disabled:pointer-events-none disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        {pageWindow(page, totalPages).map((entry, index) =>
          entry === 'ellipsis' ? (
            <span key={`gap-${index}`} className="px-1 text-xs text-muted" aria-hidden>
              …
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              onClick={() => onPageChange(entry)}
              aria-current={entry === page ? 'page' : undefined}
              className={cn(
                'inline-flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-xs font-semibold transition',
                entry === page
                  ? 'border-navy-900 bg-navy-900 text-white'
                  : 'border-line bg-white text-navy-700 hover:bg-mist',
              )}
            >
              {entry}
            </button>
          ),
        )}
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-white text-navy-700 transition hover:bg-mist disabled:pointer-events-none disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </nav>
  );
}

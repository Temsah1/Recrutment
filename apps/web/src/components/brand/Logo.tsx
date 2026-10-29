import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn';

export function Logo({
  className,
  onDark = false,
  linked = true,
  alt = 'ESME Cairo University Student Chapter',
}: {
  className?: string;
  onDark?: boolean;
  linked?: boolean;
  alt?: string;
}) {
  const image = (
    <img
      src="/esme-logo.png"
      alt={alt}
      width={1000}
      height={436}
      className={cn('block h-9 w-auto select-none', onDark && 'rounded-lg', className)}
      decoding="async"
    />
  );

  const content = onDark ? (
    <span className="inline-flex items-center rounded-xl bg-white px-2.5 py-2 shadow-insetLine">
      <img
        src="/esme-logo.png"
        alt={alt}
        width={1000}
        height={436}
        className={cn('block h-7 w-auto select-none', className)}
        decoding="async"
      />
    </span>
  ) : (
    image
  );

  if (!linked) return content;
  return (
    <Link to="/" className="inline-flex items-center" aria-label="ESME Cairo University Student Chapter — home">
      {content}
    </Link>
  );
}

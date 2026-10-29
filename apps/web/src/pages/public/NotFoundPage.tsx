import { Link } from 'react-router-dom';
import { ArrowLeft, Compass } from 'lucide-react';
import { buttonStyles } from '../../components/ui/Button';
import { useDocumentTitle } from '../../lib/hooks';

export function NotFoundPage() {
  useDocumentTitle('Page not found · ESME Recruitment');
  return (
    <div className="container-narrow flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-navy-50 text-navy-600 ring-1 ring-inset ring-navy-100">
        <Compass className="h-6 w-6" aria-hidden />
      </span>
      <p className="mt-6 font-mono text-xs font-semibold tracking-[0.2em] text-ember-700">404</p>
      <h1 className="display-tight mt-2 text-4xl font-semibold text-navy-900">This page does not exist</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
        The link may be incorrect, or the page may have moved. The recruitment portal is still available
        from the home page.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link to="/" className={buttonStyles({ variant: 'primary', size: 'md' })}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to home
        </Link>
        <Link to="/apply" className={buttonStyles({ variant: 'outline', size: 'md' })}>
          Go to the application
        </Link>
      </div>
    </div>
  );
}

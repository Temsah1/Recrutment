import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldX } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { buttonStyles } from '../../components/ui/Button';
import { ROLE_LABELS } from '@esme/shared';
import { useDocumentTitle } from '../../lib/hooks';

export function AccessDeniedPage() {
  useDocumentTitle('Access denied · ESME Recruitment');
  const { session } = useAuth();
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="card max-w-lg p-8 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-50 text-danger-600 ring-1 ring-inset ring-danger-100">
          <ShieldX className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="mt-5 font-display text-2xl font-semibold text-navy-900">You do not have access</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Your role
          {session ? (
            <>
              {' '}
              (<span className="font-semibold text-navy-800">{ROLE_LABELS[session.administrator.role]}</span>)
            </>
          ) : null}{' '}
          does not include this permission. Ask a Super Admin if you believe this is a mistake.
        </p>
        <Link
          to="/admin"
          className={buttonStyles({ variant: 'primary', size: 'md', className: 'mt-6' })}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

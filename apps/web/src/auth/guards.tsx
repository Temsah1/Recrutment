import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import type { Permission } from '@esme/shared';
import { useAuth } from './AuthProvider';
import { PageLoader } from '../components/ui/Skeleton';
import { Button } from '../components/ui/Button';
import { AccessDeniedPage } from '../pages/admin/AccessDeniedPage';

export function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-mist">
        <PageLoader label="Restoring your session" />
      </div>
    );
  }

  if (auth.error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-mist px-5">
        <div className="card max-w-md p-8 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-warning-50 text-warning-600">
            <AlertTriangle className="h-5 w-5" aria-hidden />
          </span>
          <h1 className="mt-4 font-display text-xl font-semibold text-navy-900">
            We could not check your session
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            The recruitment API did not respond. Check your connection and try again.
          </p>
          <Button className="mt-5" onClick={() => void auth.refresh()}>
            <RotateCcw className="h-4 w-4" aria-hidden />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!auth.session) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/admin/login?next=${encodeURIComponent(next)}`} replace />;
  }

  return <>{children}</>;
}

export function RequirePermission({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}) {
  const auth = useAuth();
  if (!auth.can(permission)) return <AccessDeniedPage />;
  return <>{children}</>;
}

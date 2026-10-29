import { useState, type FormEvent } from 'react';
import { KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { ROLE_LABELS } from '@esme/shared';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useAuth } from '../../auth/AuthProvider';
import { useToast } from '../../components/ui/Toast';
import { api, ApiError } from '../../lib/api';
import { useDocumentTitle } from '../../lib/hooks';
import { formatDateTime } from '../../lib/format';

export function ChangePasswordPage() {
  useDocumentTitle('Account · ESME Recruitment');
  const auth = useAuth();
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const session = auth.session;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (newPassword.length < 12) {
      setError('Use at least 12 characters for the new password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The new password and confirmation do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('Choose a password that is different from your current one.');
      return;
    }

    setSubmitting(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      await auth.refresh();
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password updated', 'All other sessions have been signed out.');
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
      } else {
        setError('The password could not be changed. Try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Account"
        title="Your account"
        description="Manage the password for your ESME recruitment administrator account."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="card p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-50 text-navy-700">
              <KeyRound className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <h2 className="font-display text-lg font-semibold text-navy-900">Change password</h2>
              <p className="text-xs text-muted">You will stay signed in on this device.</p>
            </div>
          </div>

          <form onSubmit={(event) => void handleSubmit(event)} className="mt-6 space-y-4" noValidate>
            {error ? (
              <div className="rounded-xl border border-danger-100 bg-danger-50 px-4 py-3 text-xs font-medium text-danger-700" role="alert">
                {error}
              </div>
            ) : null}

            <div>
              <label htmlFor="current-password" className="field-label">
                Current password
              </label>
              <input
                id="current-password"
                type="password"
                autoComplete="current-password"
                className="input"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="new-password" className="field-label">
                New password
              </label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                className="input"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                minLength={12}
              />
              <p className="field-hint">Use at least 12 characters. A long passphrase is ideal.</p>
            </div>
            <div>
              <label htmlFor="confirm-password" className="field-label">
                Confirm new password
              </label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                className="input"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                minLength={12}
              />
            </div>

            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {submitting ? 'Updating…' : 'Update password'}
            </Button>
          </form>
        </div>

        <div className="space-y-4">
          <div className="card p-6">
            <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-muted">Signed in as</p>
            <p className="mt-2 truncate text-sm font-semibold text-navy-900">
              {session?.administrator.displayName}
            </p>
            <p className="truncate text-xs text-muted">{session?.administrator.email}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {session ? <Badge tone="navy">{ROLE_LABELS[session.administrator.role]}</Badge> : null}
              <Badge tone="success" dot>
                Session active
              </Badge>
            </div>
            <dl className="mt-5 space-y-3 border-t border-line pt-4 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Last sign-in</dt>
                <dd className="font-medium text-navy-900">
                  {formatDateTime(session?.administrator.lastLoginAt)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Session expires</dt>
                <dd className="font-medium text-navy-900">
                  {formatDateTime(session?.sessionExpiresAt)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-line bg-white p-5">
            <div className="flex items-center gap-2 text-navy-900">
              <ShieldCheck className="h-4 w-4 text-success-600" aria-hidden />
              <p className="text-sm font-semibold">Security note</p>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Changing your password signs out every other session. If you did not make a change you expected,
              contact a Super Admin immediately.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

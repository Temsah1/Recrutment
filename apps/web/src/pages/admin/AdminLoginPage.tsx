import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LockKeyhole,
  ScrollText,
  ShieldCheck,
  UserCog,
} from 'lucide-react';
import { Logo } from '../../components/brand/Logo';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../auth/AuthProvider';
import { ApiError } from '../../lib/api';
import { useDocumentTitle } from '../../lib/hooks';

function safeNext(value: string | null): string {
  if (!value) return '/admin';
  if (!value.startsWith('/admin') || value.startsWith('//') || value.includes('\\')) return '/admin';
  if (value.startsWith('/admin/login')) return '/admin';
  return value;
}

export function AdminLoginPage() {
  useDocumentTitle('Team sign in · ESME Recruitment');
  const { session, login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = safeNext(searchParams.get('next'));

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (session) navigate(next, { replace: true });
  }, [session, navigate, next]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email address and password.');
      return;
    }
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate(next, { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (caught.status === 429) {
          setError('Too many sign-in attempts. Wait a minute before trying again.');
        } else if (caught.status === 423) {
          setError(caught.message);
        } else if (caught.status === 401) {
          setError('Email or password is incorrect.');
        } else if (caught.isNetworkError) {
          setError('We could not reach the recruitment API. Check your connection and try again.');
        } else {
          setError(caught.message);
        }
      } else {
        setError('Sign-in failed. Please try again.');
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-paper lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-navy-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-navy-glow opacity-80" aria-hidden />
        <div className="grain" aria-hidden />
        <div className="relative">
          <Logo onDark className="h-8" />
        </div>

        <div className="relative max-w-md">
          <p className="text-2xs font-semibold uppercase tracking-[0.2em] text-ember-300">
            ESME Recruitment Command Center
          </p>
          <h1 className="display-tight mt-5 text-[2.6rem] font-semibold leading-[1.04]">
            Review with care.
            <br />
            <span className="italic text-ember-400">Decide with context.</span>
          </h1>
          <p className="mt-5 text-sm leading-relaxed text-navy-200">
            A private workspace for the ESME recruitment team. Every action is permission-checked and audited.
          </p>
          <ul className="mt-9 space-y-4">
            {[
              { icon: ShieldCheck, text: 'Role-based access for reviewers and administrators' },
              { icon: KeyRound, text: 'Private identity documents, never publicly accessible' },
              { icon: ScrollText, text: 'Auditable status changes, notes and document access' },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-navy-100">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-ember-300">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-2xs text-navy-400">
          Authorized ESME members only. Unauthorized access attempts are logged.
        </p>
      </div>

      <div className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <Logo className="h-8" linked={false} />
            <Link
              to="/"
              className="inline-flex items-center gap-1 text-2xs font-medium text-muted hover:text-navy-900"
            >
              <ArrowLeft className="h-3 w-3" aria-hidden />
              Public site
            </Link>
          </div>

          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy-900 text-ember-400">
            <LockKeyhole className="h-5 w-5" aria-hidden />
          </div>
          <p className="mt-6 text-2xs font-semibold uppercase tracking-[0.18em] text-muted">
            Authorized team access
          </p>
          <h2 className="mt-2 font-display text-3xl font-semibold text-navy-900">Sign in</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Use the account created for you by an ESME Super Admin.
          </p>

          <form onSubmit={(event) => void handleSubmit(event)} className="mt-7 space-y-4" noValidate>
            {error ? (
              <div className="rounded-xl border border-danger-100 bg-danger-50 px-4 py-3 text-xs font-medium text-danger-700" role="alert">
                {error}
              </div>
            ) : null}

            <div>
              <label htmlFor="admin-email" className="field-label">
                Email address
              </label>
              <input
                id="admin-email"
                type="email"
                autoComplete="username"
                inputMode="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="input"
                placeholder="name@esme.org"
                required
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="admin-password" className="field-label">
                Password
              </label>
              <div className="relative">
                <input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="input pr-11"
                  placeholder="Your password"
                  required
                  minLength={1}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-muted transition hover:text-navy-900"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                </button>
              </div>
            </div>

            <Button type="submit" fullWidth size="lg" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-line bg-white p-3.5">
            <UserCog className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
            <p className="text-2xs leading-relaxed text-muted">
              No self-registration. Ask a Super Admin to create an account, reset a password or change a role.
            </p>
          </div>

          <p className="mt-8 text-center text-2xs text-muted">
            <Link to="/" className="font-medium text-navy-800 underline-offset-2 hover:underline">
              Return to the public recruitment site
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

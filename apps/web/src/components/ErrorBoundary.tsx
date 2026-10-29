import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled application error', error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-mist px-5">
        <div className="card max-w-lg p-8 text-center">
          <p className="font-mono text-2xs font-semibold uppercase tracking-[0.2em] text-ember-700">
            Unexpected error
          </p>
          <h1 className="mt-3 font-display text-2xl font-semibold text-navy-900">
            Something went wrong in this page
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Your data has not been submitted by this error. Reload the page to try again. If the problem
            continues, contact the recruitment team.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-navy-900 px-4 text-sm font-semibold text-white transition hover:bg-navy-950"
            >
              Reload page
            </button>
            <a
              href="/"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-line bg-white px-4 text-sm font-semibold text-navy-900 transition hover:bg-mist"
            >
              Back to home
            </a>
          </div>
        </div>
      </div>
    );
  }
}

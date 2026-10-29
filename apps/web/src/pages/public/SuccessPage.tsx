import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Check, Copy, Mail, ShieldCheck } from 'lucide-react';
import { en } from '@esme/shared';
import { Button, buttonStyles } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { useDocumentTitle } from '../../lib/hooks';
import { usePublicConfig } from '../../lib/public';
import { formatDateTimeWithZone } from '../../lib/format';

interface SuccessState {
  reference?: string;
  submittedAt?: string;
}

export function SuccessPage() {
  useDocumentTitle('Application received · ESME Recruitment');
  const location = useLocation();
  const state = (location.state ?? {}) as SuccessState;
  const { data: config } = usePublicConfig();
  const toast = useToast();
  const reduceMotion = useReducedMotion();
  const [copied, setCopied] = useState(false);

  const title = config?.recruitment.confirmationTitle ?? en.success.title;
  const message =
    config?.recruitment.confirmationMessage ??
    'Your application has been received by the ESME recruitment team. Keep your reference number for your records.';

  async function copyReference() {
    if (!state.reference) return;
    try {
      await navigator.clipboard.writeText(state.reference);
      setCopied(true);
      toast.success('Reference copied', 'Keep it somewhere safe.');
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Could not copy', 'Select the reference and copy it manually.');
    }
  }

  return (
    <div className="container-narrow py-12 sm:py-20">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="card overflow-hidden"
      >
        <div className="relative overflow-hidden border-b border-line bg-navy-900 px-6 py-10 text-center text-white sm:px-10">
          <div className="absolute inset-0 bg-navy-glow opacity-80" aria-hidden />
          <div className="relative">
            <motion.span
              initial={reduceMotion ? false : { scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.12, type: 'spring', stiffness: 180, damping: 16 }}
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-ember-500 text-navy-950 shadow-[0_0_0_10px_rgba(242,140,40,0.12)]"
            >
              <Check className="h-8 w-8" strokeWidth={2.5} aria-hidden />
            </motion.span>
            <h1 className="display-tight mt-6 text-3xl font-semibold sm:text-4xl">{title}</h1>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-navy-200">{message}</p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <Badge tone="accent">Submitted, not yet reviewed</Badge>
              {config ? <Badge tone="navy">{config.recruitment.cycleName}</Badge> : null}
            </div>
          </div>
        </div>

        <div className="px-6 py-8 sm:px-10 sm:py-10">
          {state.reference ? (
            <div className="mb-8">
              <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-muted">
                {en.success.referenceLabel}
              </p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <p className="flex-1 rounded-xl border border-dashed border-navy-200 bg-paper px-4 py-3 font-mono text-base font-semibold tracking-[0.08em] text-navy-900">
                  {state.reference}
                </p>
                <Button variant="outline" onClick={() => void copyReference()}>
                  {copied ? <Check className="h-4 w-4 text-success-600" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
              {state.submittedAt ? (
                <p className="mt-2 text-2xs text-muted">
                  Submitted {formatDateTimeWithZone(state.submittedAt, config?.recruitment.timezone ?? 'Africa/Cairo')}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="mb-8 rounded-xl border border-warning-100 bg-warning-50 p-4 text-xs leading-relaxed text-warning-700">
              For privacy, the reference number is only displayed on the confirmation screen immediately after
              submission. It is not stored in this browser. If you just submitted, use the reference shown
              before this page loaded.
            </div>
          )}

          <h2 className="font-display text-lg font-semibold text-navy-900">{en.success.nextStepsTitle}</h2>
          <ul className="mt-4 space-y-3">
            {[...en.success.nextSteps, 'You can check this portal for any updates to the recruitment cycle.'].map(
              (step) => (
                <li key={step} className="flex gap-3 text-sm leading-relaxed text-navy-800">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy-50 text-navy-700">
                    <Check className="h-3 w-3" aria-hidden />
                  </span>
                  {step}
                </li>
              ),
            )}
          </ul>

          <div className="mt-8 flex items-start gap-3 rounded-xl border border-line bg-paper p-4">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success-600" aria-hidden />
            <p className="text-xs leading-relaxed text-muted">
              Your information and documents are stored privately. Only authorized ESME recruitment
              administrators can access them. Submitted applications cannot be edited here — contact the
              recruitment team with your reference if something is materially incorrect.
            </p>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to="/" className={buttonStyles({ variant: 'primary', size: 'md' })}>
              {en.success.home}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link to="/privacy" className={buttonStyles({ variant: 'outline', size: 'md' })}>
              <ShieldCheck className="h-4 w-4" aria-hidden />
              Privacy notice
            </Link>
            <Link to="/#faq" className={buttonStyles({ variant: 'ghost', size: 'md' })}>
              <Mail className="h-4 w-4" aria-hidden />
              Common questions
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

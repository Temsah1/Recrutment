import { useEffect, useState, type ReactNode } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowRight, Menu, ShieldCheck, X } from 'lucide-react';
import { en } from '@esme/shared';
import { Logo } from '../brand/Logo';
import { buttonStyles } from '../ui/Button';
import { PageTransition } from '../motion/PageTransition';
import { cn } from '../../lib/cn';
import { landingCopy } from '../../lib/copy';
import { usePublicConfig } from '../../lib/public';

const sectionLinks = [
  { href: '#overview', label: en.publicNav.overview },
  { href: '#departments', label: en.publicNav.departments },
  { href: '#process', label: en.publicNav.process },
  { href: '#guidelines', label: en.publicNav.guidelines },
  { href: '#faq', label: en.publicNav.faq },
] as const;

function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: config } = usePublicConfig();
  const isOpen = config?.recruitment.open;
  return (
    <Dialog.Root open={open} onOpenChange={(value) => (!value ? onClose() : undefined)}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-50 bg-navy-950/45 backdrop-blur-sm" />
        <Dialog.Content className="sheet-content fixed inset-y-0 right-0 z-50 flex w-[min(88vw,22rem)] flex-col bg-paper p-6 shadow-lift focus:outline-none">
          <div className="flex items-center justify-between">
            <Dialog.Title className="sr-only">Navigation menu</Dialog.Title>
            <Dialog.Description className="sr-only">Links to the public recruitment pages.</Dialog.Description>
            <Logo className="h-8" />
            <Dialog.Close
              className="rounded-lg p-2 text-navy-700 transition hover:bg-navy-900/5"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" aria-hidden />
            </Dialog.Close>
          </div>
          <nav className="mt-9 flex flex-col gap-1" aria-label="Mobile navigation">
            {sectionLinks.map((link) => (
              <Link
                key={link.href}
                to={`/${link.href}`}
                onClick={onClose}
                className="rounded-xl px-3 py-3 text-[15px] font-medium text-navy-900 transition hover:bg-navy-900/5"
              >
                {link.label}
              </Link>
            ))}
            <Link
              to="/privacy"
              onClick={onClose}
              className="rounded-xl px-3 py-3 text-[15px] font-medium text-navy-900 transition hover:bg-navy-900/5"
            >
              {en.publicNav.privacy}
            </Link>
          </nav>
          <div className="mt-auto space-y-3 border-t border-line pt-6">
            <Link
              to="/apply"
              onClick={onClose}
              className={buttonStyles({ variant: isOpen === false ? 'outline' : 'accent', size: 'lg', fullWidth: true })}
            >
              {isOpen === false ? en.publicNav.applyClosed : en.publicNav.apply}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function PublicLayout() {
  const location = useLocation();
  const isLanding = location.pathname === '/';
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: config } = usePublicConfig();
  const recruitmentOpen = config?.recruitment.open;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-navy-900 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>

      <header
        className={cn(
          'sticky top-0 z-40 transition-colors duration-300',
          scrolled || !isLanding
            ? 'border-b border-line bg-paper/85 backdrop-blur-xl'
            : 'border-b border-transparent bg-paper/40 backdrop-blur-[2px]',
        )}
      >
        <div className="container-page flex h-16 items-center justify-between gap-4 sm:h-[4.5rem]">
          <Logo className="h-8 sm:h-9" />

          {isLanding ? (
            <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
              {sectionLinks.map((link) => (
                <Link
                  key={link.href}
                  to={`/${link.href}`}
                  className="rounded-lg px-3 py-2 text-[13px] font-medium text-navy-700 transition hover:bg-navy-900/5 hover:text-navy-950"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          ) : null}

          <div className="flex items-center gap-2">
            <Link
              to="/privacy"
              className="hidden rounded-lg px-2.5 py-2 text-[13px] font-medium text-navy-700 transition hover:text-navy-950 sm:inline-flex"
            >
              {en.publicNav.privacy}
            </Link>
            <Link
              to="/apply"
              className={buttonStyles({
                variant: recruitmentOpen === false ? 'outline' : 'accent',
                size: 'sm',
                className: 'hidden sm:inline-flex',
              })}
            >
              {recruitmentOpen === false ? en.publicNav.applyClosed : en.publicNav.apply}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
            {isLanding ? (
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-white text-navy-900 lg:hidden"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <main id="main" className="flex-1">
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>

      <PublicFooter />
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  );
}

function PublicFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative overflow-hidden bg-navy-950 text-white">
      <div className="absolute inset-0 bg-navy-glow opacity-90" aria-hidden />
      <div className="grain" aria-hidden />
      <div className="container-page relative py-14 sm:py-16">
        <div className="grid gap-10 md:grid-cols-12">
          <div className="md:col-span-5">
            <Logo onDark className="h-8" linked={false} />
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-navy-200">
              {landingCopy.footer.tagline}
            </p>
            <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-2xs font-medium text-navy-100">
              <ShieldCheck className="h-3.5 w-3.5 text-ember-400" aria-hidden />
              Private application handling
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 md:col-span-7">
            <FooterColumn title={landingCopy.footer.exploreTitle}>
              {sectionLinks.slice(0, 4).map((link) => (
                <FooterLink key={link.href} to={`/${link.href}`}>
                  {link.label}
                </FooterLink>
              ))}
            </FooterColumn>
            <FooterColumn title={landingCopy.footer.applyTitle}>
              <FooterLink to="/apply">{en.publicNav.apply}</FooterLink>
              <FooterLink to="/privacy">{en.publicNav.privacy}</FooterLink>
              <FooterLink to="/#faq">{en.publicNav.faq}</FooterLink>
            </FooterColumn>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-navy-300 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {landingCopy.footer.rights}. All rights reserved.
          </p>
          <p className="text-navy-400">Recruitment portal · Cairo University</p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-navy-400">{title}</p>
      <ul className="mt-4 space-y-2.5">{children}</ul>
    </div>
  );
}

function FooterLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <li>
      <Link to={to} className="text-sm text-navy-200 transition hover:text-white">
        {children}
      </Link>
    </li>
  );
}

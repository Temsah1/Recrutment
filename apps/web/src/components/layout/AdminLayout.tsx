import { Suspense, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Building2,
  CalendarRange,
  ExternalLink,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  Server,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { ROLE_LABELS, type Permission } from '@esme/shared';
import { useAuth } from '../../auth/AuthProvider';
import { Logo } from '../../components/brand/Logo';
import { Avatar } from '../../components/ui/Avatar';
import { PageLoader } from '../../components/ui/Skeleton';
import { PageTransition } from '../../components/motion/PageTransition';
import { useToast } from '../../components/ui/Toast';
import { cn } from '../../lib/cn';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission: Permission;
  end?: boolean;
}

const navSections: { label: string; items: NavItem[] }[] = [
  {
    label: 'Recruitment',
    items: [
      { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, permission: 'applications.view', end: true },
      { to: '/admin/applicants', label: 'Applicants', icon: Users, permission: 'applications.view' },
      { to: '/admin/cycles', label: 'Recruitment cycle', icon: CalendarRange, permission: 'cycles.manage' },
      { to: '/admin/departments', label: 'Departments', icon: Building2, permission: 'departments.manage' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/admin/settings', label: 'Settings', icon: Settings, permission: 'settings.manage' },
      { to: '/admin/administrators', label: 'Administrators', icon: UserCog, permission: 'administrators.manage' },
      { to: '/admin/audit', label: 'Audit log', icon: ScrollText, permission: 'audit.view' },
      { to: '/admin/system', label: 'System & backups', icon: Server, permission: 'backups.run' },
    ],
  },
];

const pageNames: { match: RegExp; name: string }[] = [
  { match: /^\/admin\/?$/, name: 'Dashboard' },
  { match: /^\/admin\/applicants\/\d+/, name: 'Applicant record' },
  { match: /^\/admin\/applicants/, name: 'Applicants' },
  { match: /^\/admin\/cycles/, name: 'Recruitment cycle' },
  { match: /^\/admin\/departments/, name: 'Departments' },
  { match: /^\/admin\/settings/, name: 'Settings' },
  { match: /^\/admin\/administrators/, name: 'Administrators' },
  { match: /^\/admin\/audit/, name: 'Audit log' },
  { match: /^\/admin\/system/, name: 'System & backups' },
  { match: /^\/admin\/account/, name: 'Account' },
];

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const auth = useAuth();
  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5" aria-label="Administration">
      {navSections.map((section) => {
        const items = section.items.filter((item) => auth.can(item.permission));
        if (items.length === 0) return null;
        return (
          <div key={section.label}>
            <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-navy-400">
              {section.label}
            </p>
            <ul className="mt-2 space-y-0.5">
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition duration-150',
                          isActive
                            ? 'bg-white/[0.08] text-white'
                            : 'text-navy-200 hover:bg-white/[0.05] hover:text-white',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <span
                            className={cn(
                              'absolute inset-y-2 left-0 w-0.5 rounded-full bg-ember-400 transition-opacity',
                              isActive ? 'opacity-100' : 'opacity-0',
                            )}
                            aria-hidden
                          />
                          <Icon
                            className={cn(
                              'h-4 w-4 shrink-0 transition-colors',
                              isActive ? 'text-ember-400' : 'text-navy-400 group-hover:text-navy-200',
                            )}
                            aria-hidden
                          />
                          <span className="truncate">{item.label}</span>
                        </>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function SidebarFooter({ onNavigate }: { onNavigate?: () => void }) {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  if (!session) return null;

  async function signOut() {
    await logout();
    toast.info('Signed out', 'Your session has ended.');
    onNavigate?.();
    navigate('/admin/login', { replace: true });
  }

  return (
    <div className="border-t border-white/10 p-3">
      <div className="flex items-center gap-3 rounded-xl px-2 py-2">
        <Avatar name={session.administrator.displayName} size="sm" className="ring-navy-950" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-white">{session.administrator.displayName}</p>
          <p className="truncate text-2xs text-navy-400">{ROLE_LABELS[session.administrator.role]}</p>
        </div>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-1">
        <Link
          to="/admin/account"
          onClick={onNavigate}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-2xs font-medium text-navy-300 transition hover:bg-white/5 hover:text-white"
        >
          <KeyRound className="h-3.5 w-3.5" aria-hidden />
          Password
        </Link>
        <button
          type="button"
          onClick={() => void signOut()}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-2xs font-medium text-navy-300 transition hover:bg-white/5 hover:text-white"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden />
          Sign out
        </button>
      </div>
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
        <Logo onDark className="h-7" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-navy-400">
          Recruitment
        </span>
      </div>
      <SidebarNav onNavigate={onNavigate} />
      <SidebarFooter onNavigate={onNavigate} />
    </>
  );
}

export function AdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { session } = useAuth();
  const { pathname } = useLocation();
  const pageName = pageNames.find((entry) => entry.match.test(pathname))?.name ?? 'Administration';

  return (
    <div className="min-h-screen bg-mist">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-navy-950 lg:flex">
        <SidebarContent />
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-line bg-white/85 backdrop-blur-xl">
          <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-white text-navy-900 lg:hidden"
                aria-label="Open navigation"
              >
                <Menu className="h-4 w-4" aria-hidden />
              </button>
              <div className="lg:hidden">
                <Logo className="h-7" />
              </div>
              <div className="hidden lg:block">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                  ESME Recruitment
                </p>
                <p className="text-sm font-semibold leading-tight text-navy-900">{pageName}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="hidden items-center gap-1.5 rounded-full border border-line bg-paper px-2.5 py-1 text-[10px] font-medium text-muted sm:inline-flex">
                <ShieldCheck className="h-3 w-3 text-success-600" aria-hidden />
                Audited access
              </span>
              <Link
                to="/"
                target="_blank"
                rel="noreferrer"
                className="hidden items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-muted transition hover:bg-navy-900/5 hover:text-navy-900 sm:inline-flex"
              >
                Public site
                <ExternalLink className="h-3 w-3" aria-hidden />
              </Link>
              <Link
                to="/admin/account"
                className="flex items-center gap-2 rounded-full border border-line bg-white py-1 pl-1 pr-3 transition hover:border-navy-200"
                aria-label="Account settings"
              >
                <Avatar name={session?.administrator.displayName ?? 'ESME'} size="sm" />
                <span className="hidden max-w-[9rem] truncate text-xs font-medium text-navy-900 sm:block">
                  {session?.administrator.displayName}
                </span>
              </Link>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[86rem] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Suspense fallback={<PageLoader label="Loading page" />}>
            <PageTransition>
              <Outlet />
            </PageTransition>
          </Suspense>
        </main>
      </div>

      <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay fixed inset-0 z-40 bg-navy-950/50 backdrop-blur-sm lg:hidden" />
          <Dialog.Content className="sheet-left fixed inset-y-0 left-0 z-50 flex w-[min(85vw,19rem)] flex-col bg-navy-950 shadow-lift focus:outline-none lg:hidden">
            <Dialog.Title className="sr-only">Administration navigation</Dialog.Title>
            <Dialog.Description className="sr-only">
              Move between recruitment administration pages.
            </Dialog.Description>
            <Dialog.Close
              className="absolute right-3 top-3 z-10 rounded-lg p-2 text-navy-300 transition hover:bg-white/10 hover:text-white"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" aria-hidden />
            </Dialog.Close>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

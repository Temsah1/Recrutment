import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { PublicLayout } from './components/layout/PublicLayout';
import { AdminLayout } from './components/layout/AdminLayout';
import { PageTransition } from './components/motion/PageTransition';
import { PageLoader } from './components/ui/Skeleton';
import { RequireAuth, RequirePermission } from './auth/guards';
import { LandingPage } from './pages/public/LandingPage';
import { ApplyPage } from './pages/public/ApplyPage';
import { SuccessPage } from './pages/public/SuccessPage';
import { PrivacyPage } from './pages/public/PrivacyPage';
import { NotFoundPage } from './pages/public/NotFoundPage';
import { AdminLoginPage } from './pages/admin/AdminLoginPage';
import { ChangePasswordPage } from './pages/admin/ChangePasswordPage';

const DashboardPage = lazy(() =>
  import('./pages/admin/DashboardPage').then((module) => ({ default: module.DashboardPage })),
);
const ApplicantsPage = lazy(() =>
  import('./pages/admin/ApplicantsPage').then((module) => ({ default: module.ApplicantsPage })),
);
const ApplicantDetailPage = lazy(() =>
  import('./pages/admin/ApplicantDetailPage').then((module) => ({ default: module.ApplicantDetailPage })),
);
const CyclesPage = lazy(() =>
  import('./pages/admin/CyclesPage').then((module) => ({ default: module.CyclesPage })),
);
const DepartmentsPage = lazy(() =>
  import('./pages/admin/DepartmentsPage').then((module) => ({ default: module.DepartmentsPage })),
);
const SettingsPage = lazy(() =>
  import('./pages/admin/SettingsPage').then((module) => ({ default: module.SettingsPage })),
);
const AdministratorsPage = lazy(() =>
  import('./pages/admin/AdministratorsPage').then((module) => ({ default: module.AdministratorsPage })),
);
const AuditLogPage = lazy(() =>
  import('./pages/admin/AuditLogPage').then((module) => ({ default: module.AuditLogPage })),
);
const SystemPage = lazy(() =>
  import('./pages/admin/SystemPage').then((module) => ({ default: module.SystemPage })),
);

function ScrollToTop() {
  const { pathname, hash, key } = useLocation();

  useEffect(() => {
    if (hash) {
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (target) {
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const frame = requestAnimationFrame(() => {
          target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
        });
        return () => cancelAnimationFrame(frame);
      }
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname, hash, key]);

  return null;
}

export function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<LandingPage />} />
          <Route path="apply" element={<ApplyPage />} />
          <Route path="apply/success" element={<SuccessPage />} />
          <Route path="privacy" element={<PrivacyPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        <Route
          path="/admin/login"
          element={
            <PageTransition>
              <AdminLoginPage />
            </PageTransition>
          }
        />

        <Route
          path="/admin"
          element={
            <RequireAuth>
              <AdminLayout />
            </RequireAuth>
          }
        >
          <Route
            index
            element={
              <RequirePermission permission="applications.view">
                <Suspense fallback={<PageLoader label="Loading dashboard" />}>
                  <DashboardPage />
                </Suspense>
              </RequirePermission>
            }
          />
          <Route path="applicants">
            <Route
              index
              element={
                <RequirePermission permission="applications.view">
                  <Suspense fallback={<PageLoader label="Loading applicants" />}>
                    <ApplicantsPage />
                  </Suspense>
                </RequirePermission>
              }
            />
            <Route
              path=":id"
              element={
                <RequirePermission permission="applications.view">
                  <Suspense fallback={<PageLoader label="Loading application" />}>
                    <ApplicantDetailPage />
                  </Suspense>
                </RequirePermission>
              }
            />
          </Route>
          <Route
            path="cycles"
            element={
              <RequirePermission permission="cycles.manage">
                <Suspense fallback={<PageLoader label="Loading cycles" />}>
                  <CyclesPage />
                </Suspense>
              </RequirePermission>
            }
          />
          <Route
            path="departments"
            element={
              <RequirePermission permission="departments.manage">
                <Suspense fallback={<PageLoader label="Loading departments" />}>
                  <DepartmentsPage />
                </Suspense>
              </RequirePermission>
            }
          />
          <Route
            path="settings"
            element={
              <RequirePermission permission="settings.manage">
                <Suspense fallback={<PageLoader label="Loading settings" />}>
                  <SettingsPage />
                </Suspense>
              </RequirePermission>
            }
          />
          <Route
            path="administrators"
            element={
              <RequirePermission permission="administrators.manage">
                <Suspense fallback={<PageLoader label="Loading administrators" />}>
                  <AdministratorsPage />
                </Suspense>
              </RequirePermission>
            }
          />
          <Route
            path="audit"
            element={
              <RequirePermission permission="audit.view">
                <Suspense fallback={<PageLoader label="Loading audit log" />}>
                  <AuditLogPage />
                </Suspense>
              </RequirePermission>
            }
          />
          <Route
            path="system"
            element={
              <RequirePermission permission="backups.run">
                <Suspense fallback={<PageLoader label="Loading system status" />}>
                  <SystemPage />
                </Suspense>
              </RequirePermission>
            }
          />
          <Route path="account" element={<ChangePasswordPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </>
  );
}

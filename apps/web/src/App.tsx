import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';

import { ProtectedLayout, SetupGuard } from '@/components/app-shell';
import { AuthPage, SetupPage } from '@/pages/auth';
import { LoadingState } from '@/components/feedback';

function lazyExport<T extends Record<string, unknown>>(loader: () => Promise<T>, name: keyof T) {
  return lazy(async () => ({ default: (await loader())[name] as ComponentType }));
}

const DashboardPage = lazyExport(() => import('@/pages/dashboard'), 'DashboardPage');
const AnalyticsPage = lazyExport(() => import('@/pages/analytics'), 'AnalyticsPage');
const CashflowsPage = lazyExport(() => import('@/pages/cashflows'), 'CashflowsPage');
const StatementImportPage = lazyExport(
  () => import('@/pages/statement-import'),
  'StatementImportPage',
);
const SchedulePage = lazyExport(() => import('@/pages/cashflows'), 'SchedulePage');
const HorsesPage = lazyExport(() => import('@/pages/horses'), 'HorsesPage');
const ProspectsPage = lazyExport(() => import('@/pages/horses'), 'ProspectsPage');
const HorseDetailPage = lazyExport(() => import('@/pages/horses'), 'HorseDetailPage');
const BudgetsPage = lazyExport(() => import('@/pages/planning'), 'BudgetsPage');
const SimulationsPage = lazyExport(() => import('@/pages/planning'), 'SimulationsPage');
const SettingsPage = lazyExport(() => import('@/pages/settings'), 'SettingsPage');
const NotificationsPage = lazyExport(() => import('@/pages/settings'), 'NotificationsPage');
const loading = (element: ReactNode) => <Suspense fallback={<LoadingState />}>{element}</Suspense>;

const router = createBrowserRouter([
  { path: '/login', element: <AuthPage /> },
  { path: '/register', element: <AuthPage /> },
  { element: <SetupGuard />, children: [{ path: '/setup', element: <SetupPage /> }] },
  {
    element: <ProtectedLayout />,
    children: [
      { path: '/dashboard', element: loading(<DashboardPage />) },
      { path: '/prospects', element: loading(<ProspectsPage />) },
      { path: '/prospects/new', element: loading(<ProspectsPage />) },
      { path: '/horses', element: loading(<HorsesPage />) },
      { path: '/horses/:id', element: loading(<HorseDetailPage />) },
      { path: '/horses/:id/ledger', element: loading(<HorseDetailPage />) },
      { path: '/horses/:id/settlements', element: loading(<HorseDetailPage />) },
      { path: '/cashflows', element: loading(<CashflowsPage />) },
      { path: '/cashflows/new', element: loading(<CashflowsPage />) },
      { path: '/cashflows/import', element: loading(<StatementImportPage />) },
      { path: '/scheduled', element: loading(<SchedulePage />) },
      { path: '/calendar', element: loading(<SchedulePage />) },
      { path: '/reconciliations', element: loading(<SchedulePage />) },
      { path: '/budgets', element: loading(<BudgetsPage />) },
      { path: '/simulations', element: loading(<SimulationsPage />) },
      { path: '/simulations/:id', element: loading(<SimulationsPage />) },
      { path: '/analytics', element: loading(<AnalyticsPage />) },
      { path: '/settings/clubs', element: loading(<SettingsPage />) },
      { path: '/settings/categories', element: loading(<SettingsPage />) },
      { path: '/settings/alerts', element: loading(<SettingsPage />) },
      { path: '/settings/export', element: loading(<SettingsPage />) },
      { path: '/notifications', element: loading(<NotificationsPage />) },
    ],
  },
  { path: '*', element: <Navigate to="/dashboard" replace /> },
]);

export function App() {
  return <RouterProvider router={router} />;
}

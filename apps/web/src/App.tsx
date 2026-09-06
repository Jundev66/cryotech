import { Routes, Route, Navigate, Outlet } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth-provider';
import { CompanyProvider, useCompany } from '@/providers/company-provider';
import { warehousesApi } from '@/api/warehouses.api';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { AppHeader } from '@/components/layout/app-header';
import { Logo } from '@/components/brand/logo';
import { lazy, Suspense, useState } from 'react';

// Login is eager: it is the first screen. The rest is lazy, so entering the app
// no longer downloads Recharts and all twenty pages up front.
import LoginPage from '@/pages/login';
import RegisterPage from '@/pages/register';

const OnboardingPage = lazy(() => import('@/pages/onboarding'));
const DashboardPage = lazy(() => import('@/pages/dashboard'));
const BatchesPage = lazy(() => import('@/pages/batches'));
const BatchDetailPage = lazy(() => import('@/pages/batch-detail'));
const DailyLogsPage = lazy(() => import('@/pages/daily-logs'));
const SalesPage = lazy(() => import('@/pages/sales'));
const TransactionsPage = lazy(() => import('@/pages/transactions'));
const ClientsPage = lazy(() => import('@/pages/clients'));
const ProductsPage = lazy(() => import('@/pages/products'));
const WarehousesPage = lazy(() => import('@/pages/warehouses'));
const FeedPage = lazy(() => import('@/pages/feed'));
const ReportsPage = lazy(() => import('@/pages/reports'));
const UsersPage = lazy(() => import('@/pages/users'));
const SettingsPage = lazy(() => import('@/pages/settings'));
const EntriesPage = lazy(() => import('@/pages/entries'));
const TreasuryPage = lazy(() => import('@/pages/treasury'));
const ProcessingPage = lazy(() => import('@/pages/processing'));
const ConsumptionsPage = lazy(() => import('@/pages/consumptions'));

function AuthLayout() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (user) return <Navigate to="/dashboard" replace />;
  return (
    <div className="relative flex min-h-screen bg-background">
      {/* Left panel — atmospheric gradient (desktop only) */}
      <div className="hidden lg:flex lg:w-[55%] relative items-center justify-center overflow-hidden bg-gradient-to-br from-[oklch(0.20_0.06_175)] via-[oklch(0.18_0.04_130)] to-[oklch(0.25_0.06_75)]">
        {/* Noise overlay */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")',
            backgroundRepeat: 'repeat',
            backgroundSize: '256px 256px',
          }}
        />
        {/* Branding */}
        <div className="relative z-10 text-center px-12">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm ring-1 ring-white/10">
            <Logo className="h-9 w-9 text-white" animate />
          </div>
          <h1 className="mt-6 font-display text-5xl font-extrabold text-white/90 tracking-tight">CryoTech</h1>
          <p className="mt-3 text-lg text-white/40 font-medium">Gestion Avicola Inteligente</p>
        </div>
        {/* Watermark text */}
        <div className="absolute bottom-12 left-12 right-12">
          <p className="font-display text-[8rem] font-extrabold text-white/[0.03] leading-none select-none">CRYO</p>
        </div>
      </div>
      {/* Right panel — form */}
      <div className="flex flex-1 items-center justify-center p-6">
        {/* Mobile top branding */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-primary via-primary/60 to-accent lg:hidden" />
        <div className="w-full max-w-md animate-page-enter">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

function DashboardLayout() {
  const { user, loading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <CompanyProvider>
      <DashboardGuard>
        <div className="flex min-h-screen w-full">
          {/* Mobile sidebar overlay */}
          {sidebarOpen && (
            <div className="fixed inset-0 z-40 md:hidden" onClick={() => setSidebarOpen(false)}>
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
              <div className="relative w-56 animate-slide-in-left" onClick={(e) => e.stopPropagation()}>
                <AppSidebar />
              </div>
            </div>
          )}
          <AppSidebar />
          <div className="flex flex-1 flex-col">
            <AppHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
            <main className="flex-1 p-5 md:p-8">
              <div className="mx-auto max-w-7xl animate-page-enter">
                {/* Inside the layout, so the sidebar and header do not flicker. */}
                <Suspense fallback={<PageFallback />}>
                  <Outlet />
                </Suspense>
              </div>
            </main>
          </div>
        </div>
      </DashboardGuard>
    </CompanyProvider>
  );
}

/**
 * Lets the dashboard through only once onboarding has really finished.
 *
 * Having a company used to be enough. But onboarding is two steps — company and
 * warehouse — and if the second one broke off, the company existed with no
 * warehouse: this guard saw it, sent you to the dashboard, and left you in an
 * app where no batch can be created because there is nowhere to put it.
 *
 * The warehouses query uses the same key as its own screen, so it comes from
 * the cache and costs no extra request.
 */
function DashboardGuard({ children }: { children: React.ReactNode }) {
  const { company, loading } = useCompany();
  const { data: warehouses, isLoading: loadingWarehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => warehousesApi.findAll(),
    enabled: Boolean(company),
  });

  if (loading) return <LoadingScreen />;
  if (!company) return <Navigate to="/onboarding" replace />;
  if (loadingWarehouses) return <LoadingScreen />;
  if (warehouses && warehouses.length === 0) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

/**
 * Onboarding needs a session: it creates a company against the API.
 *
 * It used to sit loose in the route tree, outside every guard. With no session
 * the form still rendered, and submitting it returned a 401 the interceptor
 * turned into a jump to the login — two fields filled in for nothing.
 */
function OnboardingRoute() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <Suspense fallback={<LoadingScreen />}>
      <OnboardingPage />
    </Suspense>
  );
}

/** Shown while a route chunk loads: content area only. */
function PageFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Logo className="h-8 w-8 text-primary animate-spin" style={{ animationDuration: '2s' } as React.CSSProperties} />
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center">
          <Logo className="h-10 w-10 text-primary animate-spin" style={{ animationDuration: '2s' } as React.CSSProperties} />
        </div>
        <p className="text-sm text-muted-foreground font-medium">Cargando...</p>
      </div>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>
      <Route path="/onboarding" element={<OnboardingRoute />} />
      <Route path="/dashboard" element={<DashboardLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="batches" element={<BatchesPage />} />
        <Route path="batches/:id" element={<BatchDetailPage />} />
        <Route path="daily-logs" element={<DailyLogsPage />} />
        <Route path="sales" element={<SalesPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="clients" element={<ClientsPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="warehouses" element={<WarehousesPage />} />
        <Route path="feed" element={<FeedPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="entries" element={<EntriesPage />} />
        <Route path="treasury" element={<TreasuryPage />} />
        <Route path="processing" element={<ProcessingPage />} />
        <Route path="consumptions" element={<ConsumptionsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

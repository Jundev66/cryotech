import React, { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router';
import { useAuthStore } from '@/stores/auth.store';
import { useSyncStore } from '@/stores/sync.store';
import { configureNativeApp } from '@/lib/native';
import { BottomNav } from '@/components/layout/bottom-nav';
import { LoginPage } from '@/pages/login';
import { HomePage } from '@/pages/home';
import { ChatPage } from '@/pages/chat';
import { RegisterHubPage } from '@/pages/register-hub';
import { ReportsPage } from '@/pages/reports';
import { MorePage } from '@/pages/more';
import { Toaster } from 'sonner';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Mobile App Error caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 mb-4">
            <span className="text-2xl font-bold">!</span>
          </div>
          <h2 className="text-base font-bold text-slate-100 mb-2">Error al cargar la pantalla</h2>
          <p className="text-xs text-slate-400 max-w-sm mb-4 font-mono bg-slate-900 p-3 rounded-lg border border-slate-800 text-left overflow-auto max-h-36">
            {this.state.error?.message || 'Error desconocido'}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.hash = '#/';
              window.location.reload();
            }}
            className="px-5 py-2.5 bg-teal-500 text-slate-950 font-bold text-xs rounded-xl"
          >
            Reiniciar aplicación
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

import { DesktopSidebar } from '@/components/layout/desktop-sidebar';

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-teal-400">
        <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-xs text-slate-400">Iniciando CryoTech...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row">
      {/* Desktop Sidebar (visible on md+) */}
      <DesktopSidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:pl-64 min-w-0">
        <div className="flex-1 w-full">
          {children}
        </div>
      </div>

      {/* Mobile Bottom Navigation (hidden on md+) */}
      <div className="md:hidden">
        <BottomNav />
      </div>
    </div>
  );
}

export function App() {
  const initAuth = useAuthStore((s) => s.init);
  const initSync = useSyncStore((s) => s.init);

  useEffect(() => {
    configureNativeApp();
    initAuth();
    initSync();
  }, [initAuth, initSync]);

  return (
    <ErrorBoundary>
      <HashRouter>
        <Toaster position="top-center" richColors theme="dark" />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedLayout>
                <HomePage />
              </ProtectedLayout>
            }
          />
          <Route
            path="/chat"
            element={
              <ProtectedLayout>
                <ChatPage />
              </ProtectedLayout>
            }
          />
          <Route
            path="/register"
            element={
              <ProtectedLayout>
                <RegisterHubPage />
              </ProtectedLayout>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedLayout>
                <ReportsPage />
              </ProtectedLayout>
            }
          />
          <Route
            path="/more"
            element={
              <ProtectedLayout>
                <MorePage />
              </ProtectedLayout>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  );
}

export default App;

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@cryotech/shared-types';
import { useAuthStore } from '@/stores/auth.store';
import { haptics, storage } from '@/lib/native';
import api from '@/api/client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router';
import {
  LogIn,
  ShieldAlert,
  Sparkles,
  Smartphone,
  ChevronDown,
  ChevronUp,
  X,
  Share2,
  MoreVertical,
  PlusSquare,
  Clock,
} from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const { login, isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) {
      window.location.hash = '#/';
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    // Check if running as installed standalone PWA
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginInput) => {
    setLoading(true);
    await haptics.light();
    try {
      const res = await api.post('/auth/login', data);
      await login(res.data.accessToken, res.data.refreshToken, res.data.user);
      await haptics.success();
      toast.success('¡Bienvenido!');
      window.location.hash = '#/';
      navigate('/', { replace: true });
    } catch (err: unknown) {
      await haptics.error();
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Credenciales inválidas';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const onDemoSubmit = async () => {
    setDemoLoading(true);
    await haptics.light();
    try {
      // Intento en servidor ERP /api/auth/demo (Crea granja efímera de 2 horas)
      const res = await api.post('/auth/demo');
      const { accessToken, refreshToken, user, company } = res.data;
      if (company?.id) {
        localStorage.setItem('cryotech_company_id', company.id);
        await storage.set('cryotech_company_id', company.id);
      }
      await login(accessToken, refreshToken, user);
      await haptics.success();
      toast.success(`Entrando a ${company?.name || 'Granja Demo (Temporal)'}`);
      window.location.hash = '#/';
      navigate('/', { replace: true });
    } catch {
      // Fallback a cuenta demo permanente o datos locales offline
      try {
        const res = await api.post('/auth/login', {
          email: 'demo@cryotech.com',
          password: 'Demo2026!',
        });
        await login(res.data.accessToken, res.data.refreshToken, res.data.user);
        await haptics.success();
        toast.success('Entrando a Demostración Temporal');
        window.location.hash = '#/';
        navigate('/', { replace: true });
      } catch {
        // Fallback local garantizado para modo offline
        const demoUser = {
          id: '11111111-1111-4111-a111-111111111111',
          email: 'demo@cryotech.com',
          fullName: 'Productor Demo (CryoTech)',
          phone: null,
          avatarUrl: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const demoCompany = {
          id: '25aacb04-877b-4db0-a9dc-e3f8eb95675d',
          name: 'Granja Demo (Temporal)',
          isDemo: true,
          expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
          ownerId: demoUser.id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await storage.set('cryotech_access_token', 'demo-token');
        await storage.set('cryotech_refresh_token', 'demo-refresh-token');
        await storage.set('cryotech_user_profile', JSON.stringify(demoUser));
        await storage.set('cryotech_companies', JSON.stringify([demoCompany]));
        await storage.set('cryotech_company_id', demoCompany.id);
        localStorage.setItem('cryotech_access_token', 'demo-token');
        localStorage.setItem('cryotech_company_id', demoCompany.id);

        useAuthStore.setState({
          user: demoUser,
          companies: [demoCompany as never],
          activeCompanyId: demoCompany.id,
          isAuthenticated: true,
          isLoading: false,
        });

        await haptics.success();
        toast.success('Entrando a Granja Demo (Modo Offline Temporal)');
        window.location.hash = '#/';
        navigate('/', { replace: true });
      }
    } finally {
      setDemoLoading(false);
    }
  };

  const onInstallClick = async () => {
    await haptics.light();
    if (isStandalone) {
      toast.info('La aplicación ya está instalada en tu dispositivo');
      return;
    }
    if (installPrompt) {
      try {
        await installPrompt.prompt();
        const { outcome } = await installPrompt.userChoice;
        if (outcome === 'accepted') {
          setInstallPrompt(null);
          setIsStandalone(true);
          toast.success('¡Aplicación instalada en tu teléfono!');
          return;
        }
      } catch {
        setShowInstallModal(true);
      }
    } else {
      setShowInstallModal(true);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center px-4 py-8 safe-top safe-bottom">
      <div className="w-full max-w-md mx-auto space-y-4">
        {/* Direct Install Button Banner */}
        {!isStandalone && (
          <button
            onClick={onInstallClick}
            className="touch-active w-full bg-gradient-to-r from-teal-500/20 via-emerald-500/20 to-teal-500/20 hover:from-teal-500/30 hover:to-emerald-500/30 border border-teal-500/40 rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-lg shadow-teal-950/40 transition-all text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-500 text-slate-950 flex items-center justify-center font-bold shadow-md shadow-teal-500/30">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-black text-slate-100 uppercase tracking-wide">
                  Instalar en mi Teléfono
                </p>
                <p className="text-[11px] text-teal-300">
                  Usa CryoTech como app nativa en tu pantalla
                </p>
              </div>
            </div>
            <span className="px-3 py-1.5 rounded-lg bg-teal-500 text-slate-950 text-xs font-bold shrink-0">
              Instalar
            </span>
          </button>
        )}

        {/* App Branding */}
        <div className="flex flex-col items-center pt-2 pb-1 text-center">
          <div className="w-16 h-16 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400 mb-3 shadow-xl shadow-teal-500/10">
            <span className="text-3xl font-black tracking-tighter">CT</span>
          </div>
          <h2 className="text-2xl font-black text-slate-100 tracking-tight">CryoTech Mobile</h2>
          <p className="text-xs text-slate-400 mt-1">
            Gestión avícola en terreno • Progressive Web App
          </p>
        </div>

        {/* Main Card: Temporary Demo Access (Primary Action) */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl shadow-black/60 space-y-4">
          <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/25 rounded-2xl p-3.5">
            <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-200/90 leading-relaxed">
              <span className="font-bold text-amber-300 block mb-0.5">
                Datos Demo Temporales (2 horas)
              </span>
              Entorno de prueba aislado con galpones, pollos Cobb 500, consumos y ventas precargadas. No requiere registro previo.
            </div>
          </div>

          <button
            type="button"
            onClick={onDemoSubmit}
            disabled={demoLoading || loading}
            className="touch-active w-full py-4 bg-teal-500 hover:bg-teal-400 text-slate-950 font-black rounded-2xl shadow-xl shadow-teal-500/25 flex items-center justify-center gap-2.5 text-sm transition-all disabled:opacity-50"
          >
            {demoLoading ? (
              <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Sparkles className="w-5 h-5 fill-slate-950 text-slate-950" />
                <span>Entrar a Modo Demostración</span>
              </>
            )}
          </button>

          {/* Secondary Collapsible: Admin/Owner login (No registration option) */}
          <div className="pt-2 border-t border-slate-800/80">
            <button
              type="button"
              onClick={() => setShowAdminLogin(!showAdminLogin)}
              className="touch-active w-full py-2 flex items-center justify-between text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              <span>Acceso Administrativo / Propietario</span>
              {showAdminLogin ? (
                <ChevronUp className="w-4 h-4 text-slate-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-500" />
              )}
            </button>

            {showAdminLogin && (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5 pt-3 animate-in fade-in">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1 uppercase tracking-wider">
                    Correo
                  </label>
                  <input
                    {...register('email')}
                    type="email"
                    autoCapitalize="none"
                    autoComplete="email"
                    placeholder="propietario@granja.com"
                    className="w-full px-3.5 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-teal-500 text-xs transition-colors"
                  />
                  {errors.email && (
                    <p className="mt-1 text-[11px] text-red-400">{errors.email.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1 uppercase tracking-wider">
                    Contraseña
                  </label>
                  <input
                    {...register('password')}
                    type="password"
                    placeholder="••••••••••"
                    className="w-full px-3.5 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-teal-500 text-xs transition-colors"
                  />
                  {errors.password && (
                    <p className="mt-1 text-[11px] text-red-400">{errors.password.message}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || demoLoading}
                  className="touch-active w-full py-3 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-100 font-bold rounded-xl flex items-center justify-center gap-2 text-xs transition-colors disabled:opacity-50"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-slate-100 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <LogIn className="w-3.5 h-3.5" />
                      <span>Ingresar con Credenciales</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Security & Access Notice */}
        <div className="flex flex-col items-center justify-center gap-1.5 text-center text-xs text-slate-500 pt-1">
          <div className="flex items-center gap-1.5 text-slate-400 font-medium">
            <ShieldAlert className="w-3.5 h-3.5 text-teal-400" />
            <span>Registro público cerrado • Solo modo demostración temporal</span>
          </div>
          <span className="text-[11px] text-slate-500">
            Los datos de demostración se purgan automáticamente cada 2 horas.
          </span>
        </div>
      </div>

      {/* Install Instruction Modal for iOS / Android without automatic prompt */}
      {showInstallModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm p-6 shadow-2xl safe-bottom space-y-4 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <Smartphone className="w-5 h-5 text-teal-400" />
                <h3 className="text-sm font-bold text-slate-100">Instalar CryoTech</h3>
              </div>
              <button
                onClick={() => setShowInstallModal(false)}
                className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Sigue estos 2 pasos para anclar la aplicación en tu pantalla de inicio:
            </p>

            {/* Android instructions */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 space-y-2">
              <div className="flex items-center gap-2 text-teal-400 font-bold text-xs">
                <MoreVertical className="w-4 h-4" />
                <span>En Android (Chrome):</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed pl-6">
                1. Toca el menú de <strong className="text-slate-200">3 puntos (⋮)</strong> arriba a la derecha.
                <br />
                2. Selecciona <strong className="text-teal-300">"Instalar aplicación"</strong> o "Agregar a la pantalla principal".
              </p>
            </div>

            {/* iOS instructions */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 space-y-2">
              <div className="flex items-center gap-2 text-teal-400 font-bold text-xs">
                <Share2 className="w-4 h-4" />
                <span>En iPhone / iPad (Safari):</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed pl-6">
                1. Toca el botón de <strong className="text-slate-200">Compartir</strong> (cuadrado con flecha).
                <br />
                2. Baja y pulsa <strong className="text-teal-300">"Agregar al inicio"</strong> (<PlusSquare className="inline w-3.5 h-3.5 text-teal-400" />).
              </p>
            </div>

            <button
              onClick={() => setShowInstallModal(false)}
              className="w-full py-3 bg-teal-500 text-slate-950 font-bold rounded-xl text-xs"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

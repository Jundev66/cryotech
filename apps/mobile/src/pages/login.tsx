import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@cryotech/shared-types';
import { useAuthStore } from '@/stores/auth.store';
import { haptics, storage } from '@/lib/native';
import api from '@/api/client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router';
import { LogIn, ShieldAlert, Sparkles, Download } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const { login, isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) {
      window.location.hash = '#/';
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
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
      const res = await api.post('/auth/demo');
      const { accessToken, refreshToken, user, company } = res.data;
      if (company?.id) {
        localStorage.setItem('cryotech_company_id', company.id);
        await storage.set('cryotech_company_id', company.id);
      }
      await login(accessToken, refreshToken, user);
      await haptics.success();
      toast.success(`Entrando a ${company?.name || 'demostración'}`);
      window.location.hash = '#/';
      navigate('/', { replace: true });
    } catch {
      // Intento con cuenta demo semilla permanente
      try {
        const res = await api.post('/auth/login', {
          email: 'demo@cryotech.com',
          password: 'Demo2026!',
        });
        await login(res.data.accessToken, res.data.refreshToken, res.data.user);
        await haptics.success();
        toast.success('Entrando a demostración');
        window.location.hash = '#/';
        navigate('/', { replace: true });
      } catch {
        // Fallback garantizado modo demostración offline
        const demoUser = {
          id: '11111111-1111-4111-a111-111111111111',
          email: 'demo@cryotech.com',
          fullName: 'Productor Demo (CryoTech)',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const demoCompany = {
          id: '25aacb04-877b-4db0-a9dc-e3f8eb95675d',
          name: 'Granja Demo Los Llanos',
          isDemo: true,
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
        toast.success('Entrando a Granja Demo (Modo Offline/Pruebas)');
        window.location.hash = '#/';
        navigate('/', { replace: true });
      }
    } finally {
      setDemoLoading(false);
    }
  };

  const onInstallClick = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallPrompt(null);
      toast.success('¡Aplicación instalada!');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center px-6 py-12 safe-top safe-bottom">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* App Branding */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400 mb-3 shadow-lg shadow-teal-500/10">
            <span className="text-3xl font-black tracking-tighter">CT</span>
          </div>
          <h2 className="text-2xl font-black text-slate-100 tracking-tight">CryoTech Mobile</h2>
          <p className="text-xs text-slate-400 mt-1">Gestión avícola en terreno (PWA)</p>
        </div>

        {/* PWA Install Banner */}
        {installPrompt && (
          <div className="mb-4 bg-teal-950/60 border border-teal-500/30 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-lg shadow-teal-950/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-500/20 flex items-center justify-center text-teal-400">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-200">Instalar Aplicación</p>
                <p className="text-[11px] text-teal-300/80">Accede directo desde tu pantalla</p>
              </div>
            </div>
            <button
              onClick={onInstallClick}
              className="px-3.5 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold rounded-lg transition-colors shadow"
            >
              Instalar
            </button>
          </div>
        )}

        {/* Login Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl shadow-black/50">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                Correo Electrónico
              </label>
              <input
                {...register('email')}
                type="email"
                autoCapitalize="none"
                autoComplete="email"
                placeholder="usuario@granja.com"
                className="w-full px-4 py-3.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-teal-500 text-sm transition-colors"
              />
              {errors.email && (
                <p className="mt-1 text-xs text-red-400">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                Contraseña
              </label>
              <input
                {...register('password')}
                type="password"
                placeholder="••••••••••"
                className="w-full px-4 py-3.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-teal-500 text-sm transition-colors"
              />
              {errors.password && (
                <p className="mt-1 text-xs text-red-400">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || demoLoading}
              className="touch-active w-full py-4 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold rounded-xl shadow-lg shadow-teal-500/20 flex items-center justify-center gap-2 text-sm mt-2 transition-colors disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn className="w-4 h-4 stroke-[2.5]" />
                  <span>Ingresar</span>
                </>
              )}
            </button>
          </form>

          {/* Separator */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-800" />
            </div>
            <div className="relative flex justify-center text-[10px] uppercase">
              <span className="bg-slate-900 px-2 text-slate-500 font-semibold tracking-wider">
                O prueba el sistema
              </span>
            </div>
          </div>

          {/* Quick Demo Access Button */}
          <button
            type="button"
            onClick={onDemoSubmit}
            disabled={loading || demoLoading}
            className="touch-active w-full py-3.5 bg-slate-800 hover:bg-slate-750 text-teal-400 hover:text-teal-300 border border-teal-500/20 hover:border-teal-500/40 font-bold rounded-xl flex items-center justify-center gap-2 text-sm transition-colors disabled:opacity-50"
          >
            {demoLoading ? (
              <div className="w-4 h-4 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-teal-400" />
                <span>Probar Modo Demostración</span>
              </>
            )}
          </button>
        </div>

        <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-400">
          <ShieldAlert className="w-3.5 h-3.5 text-teal-500/70" />
          <span>Acceso seguro y funcionamiento sin conexión (Offline)</span>
        </div>
      </div>
    </div>
  );
}

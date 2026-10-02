import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@cryotech/shared-types';
import { useAuthStore } from '@/stores/auth.store';
import { haptics } from '@/lib/native';
import api from '@/api/client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router';
import { LogIn, ShieldAlert } from 'lucide-react';

export function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const { login, isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) {
      window.location.hash = '#/';
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

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

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center px-6 py-12 safe-top safe-bottom">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* App Branding */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400 mb-3 shadow-lg shadow-teal-500/10">
            <span className="text-3xl font-black tracking-tighter">CT</span>
          </div>
          <h2 className="text-2xl font-black text-slate-100 tracking-tight">CryoTech Mobile</h2>
          <p className="text-xs text-slate-400 mt-1">Gestión avícola en terreno</p>
        </div>

        {/* Card */}
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
              disabled={loading}
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
        </div>

        <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-400">
          <ShieldAlert className="w-3.5 h-3.5 text-teal-500/70" />
          <span>Acceso seguro sincronizado con tu ERP</span>
        </div>
      </div>
    </div>
  );
}

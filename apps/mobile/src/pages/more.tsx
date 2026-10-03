import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { useSyncStore } from '@/stores/sync.store';
import { AppHeader } from '@/components/layout/app-header';
import { haptics } from '@/lib/native';
import api from '@/api/client';
import { toast } from 'sonner';
import {
  Users,
  LogOut,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  X,
  Plus,
  Smartphone,
  Clock,
  Share2,
  MoreVertical,
  PlusSquare,
  AlertTriangle,
} from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function MorePage() {
  const { user, companies, activeCompanyId, logout } = useAuthStore();
  const { queue, syncNow } = useSyncStore();
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  const activeCompany = companies.find((c) => c.id === activeCompanyId);

  useEffect(() => {
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

  // Members query for the active company
  const { data: members = [], refetch: refetchMembers } = useQuery({
    queryKey: ['company-members', activeCompanyId],
    queryFn: async () => {
      const res = await api.get(`/companies/${activeCompanyId}/members`);
      return res.data?.data || res.data || [];
    },
    enabled: !!activeCompanyId && !activeCompany?.isDemo,
  });

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberEmail.trim()) return;

    setAddingMember(true);
    await haptics.light();
    try {
      await api.post(`/companies/${activeCompanyId}/members`, {
        email: newMemberEmail.trim().toLowerCase(),
      });
      await haptics.success();
      toast.success('Miembro invitado con éxito');
      setNewMemberEmail('');
      setShowMemberModal(false);
      refetchMembers();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Error al agregar miembro';
      toast.error(msg);
    } finally {
      setAddingMember(false);
    }
  };

  const handleLogout = async () => {
    await haptics.medium();
    await logout();
  };

  const handleInstallClick = async () => {
    await haptics.light();
    if (isStandalone) {
      toast.info('CryoTech ya está instalada en tu dispositivo');
      return;
    }
    if (installPrompt) {
      try {
        await installPrompt.prompt();
        const { outcome } = await installPrompt.userChoice;
        if (outcome === 'accepted') {
          setInstallPrompt(null);
          setIsStandalone(true);
          toast.success('¡Aplicación instalada!');
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
    <div className="min-h-screen bg-slate-950 pb-24 md:pb-12">
      <AppHeader title="Ajustes y Equipo" />

      <main className="px-4 md:px-8 py-5 space-y-6 max-w-5xl mx-auto">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-slate-100 tracking-tight">Ajustes de Granja & Usuario</h2>
          <p className="text-xs text-slate-400 mt-1">
            Administra tu sesión, sincronización de terreno y acceso de colaboradores.
          </p>
        </div>

        {/* User Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-teal-500/20 border border-teal-500/40 text-teal-300 font-black text-lg flex items-center justify-center">
            {user?.fullName?.charAt(0) || user?.email?.charAt(0) || 'U'}
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-slate-100">{user?.fullName || 'Usuario'}</h3>
            <p className="text-xs text-slate-400">{user?.email}</p>
            <span className="text-[10px] font-semibold text-teal-400 mt-0.5 inline-flex items-center gap-1">
              <span>{activeCompany?.name || 'Productor Avícola'}</span>
              {activeCompany?.isDemo && (
                <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Demo
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Demo Mode Notice */}
        {activeCompany?.isDemo && (
          <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-4 flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-200/90 leading-relaxed">
              <span className="font-bold text-amber-300 block mb-0.5">
                Empresa Demostración Temporal (2 horas)
              </span>
              Estás evaluando una granja de prueba efímera. Los datos son temporales y se reinician automáticamente. Las funciones administrativas de usuarios están restringidas.
            </div>
          </div>
        )}

        {/* PWA Install Card */}
        {!isStandalone && (
          <div className="bg-gradient-to-r from-teal-950/50 to-slate-900 border border-teal-500/30 rounded-2xl p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-500 text-slate-950 flex items-center justify-center font-bold">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-100">Instalar en la Pantalla</h4>
                <p className="text-[11px] text-teal-300/80">Accede como app nativa sin navegador</p>
              </div>
            </div>
            <button
              onClick={handleInstallClick}
              className="touch-active px-3 py-1.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold rounded-lg text-xs"
            >
              Instalar
            </button>
          </div>
        )}

        {/* Team Members Section */}
        {!activeCompany?.isDemo ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-teal-400" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Equipo y Accesos ({members.length})
                </h4>
              </div>
              <button
                onClick={() => {
                  haptics.light();
                  setShowMemberModal(true);
                }}
                className="touch-active text-xs text-teal-400 bg-teal-500/10 border border-teal-500/20 px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1"
              >
                <UserPlus className="w-3 h-3" />
                <span>Dar acceso</span>
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Los usuarios con acceso a tu empresa pueden registrar y ver datos sincronizados en la app.
            </p>

            <div className="space-y-2 pt-1">
              {members.length === 0 ? (
                <p className="text-xs text-slate-500 italic">No hay otros miembros en esta empresa.</p>
              ) : (
                members.map((m: { id: string; user?: { fullName: string; email: string }; isOwner?: boolean; role?: { name: string } }) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs"
                  >
                    <div>
                      <span className="font-semibold text-slate-200">
                        {m.user?.fullName || m.user?.email || 'Miembro'}
                      </span>
                      <p className="text-[10px] text-slate-500">{m.user?.email}</p>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-300">
                      {m.isOwner ? 'Dueño' : m.role?.name || 'Operador'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center gap-3 text-slate-400 text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Gestión de equipo deshabilitada en empresas de prueba temporales.</span>
          </div>
        )}

        {/* Sync Queue Manager */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-amber-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Cola de Sincronización ({queue.length})
              </h4>
            </div>
            {queue.length > 0 && (
              <button
                onClick={syncNow}
                className="touch-active text-xs text-amber-400 font-semibold"
              >
                Subir ahora
              </button>
            )}
          </div>

          {queue.length === 0 ? (
            <p className="text-xs text-emerald-400 flex items-center gap-1.5 font-medium">
              <ShieldCheck className="w-4 h-4" />
              <span>Todos tus registros locales están sincronizados con el ERP.</span>
            </p>
          ) : (
            <div className="space-y-2">
              {queue.map((item) => (
                <div
                  key={item.id}
                  className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs"
                >
                  <span className="text-slate-300 font-medium">{item.title}</span>
                  <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">
                    Pendiente
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          className="touch-active w-full py-3.5 bg-red-950/40 hover:bg-red-950/60 border border-red-800/40 text-red-300 font-bold rounded-2xl text-xs flex items-center justify-center gap-2 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>Cerrar Sesión</span>
        </button>
      </main>

      {/* Modal Agregar Miembro */}
      {showMemberModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm p-5 shadow-2xl safe-bottom">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h3 className="text-base font-bold text-slate-100">Dar Acceso a Usuario</h3>
              <button
                onClick={() => setShowMemberModal(false)}
                className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddMember} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase">
                  Correo electrónico del usuario
                </label>
                <input
                  type="email"
                  required
                  placeholder="empleado@granja.com"
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  className="w-full px-3.5 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-teal-500"
                />
              </div>

              <button
                type="submit"
                disabled={addingMember}
                className="touch-active w-full py-3.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>{addingMember ? 'Agregando...' : 'Asignar Acceso'}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Instrucciones de Instalación */}
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

            {/* Android */}
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

            {/* iOS */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 space-y-2">
              <div className="flex items-center gap-2 text-teal-400 font-bold text-xs">
                <Share2 className="w-4 h-4" />
                <span>En iPhone / iPad (Safari):</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed pl-6">
                1. Toca el botón de <strong className="text-slate-200">Compartir</strong> (cuadrado con flecha hacia arriba).
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

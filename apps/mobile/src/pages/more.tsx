import { useState } from 'react';
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
} from 'lucide-react';

export function MorePage() {
  const { user, companies, activeCompanyId, logout } = useAuthStore();
  const { queue, syncNow } = useSyncStore();
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [addingMember, setAddingMember] = useState(false);

  const activeCompany = companies.find((c) => c.id === activeCompanyId);

  // Members query for the active company
  const { data: members = [], refetch: refetchMembers } = useQuery({
    queryKey: ['company-members', activeCompanyId],
    queryFn: async () => {
      const res = await api.get(`/companies/${activeCompanyId}/members`);
      return res.data?.data || res.data || [];
    },
    enabled: !!activeCompanyId,
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

  return (
    <div className="min-h-screen bg-slate-950 pb-24">
      <AppHeader title="Ajustes y Equipo" />

      <main className="px-4 py-4 space-y-5 max-w-lg mx-auto">
        {/* User Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-teal-500/20 border border-teal-500/40 text-teal-300 font-black text-lg flex items-center justify-center">
            {user?.fullName?.charAt(0) || user?.email?.charAt(0) || 'U'}
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-slate-100">{user?.fullName || 'Usuario'}</h3>
            <p className="text-xs text-slate-400">{user?.email}</p>
            <span className="text-[10px] font-semibold text-teal-400 mt-0.5 inline-block">
              {activeCompany?.name || 'Productor Avícola'}
            </span>
          </div>
        </div>

        {/* Team Members Section */}
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
    </div>
  );
}

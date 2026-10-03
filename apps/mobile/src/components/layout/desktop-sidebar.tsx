import { useLocation, useNavigate } from 'react-router';
import { useAuthStore } from '@/stores/auth.store';
import { useSyncStore } from '@/stores/sync.store';
import { haptics } from '@/lib/native';
import {
  Home,
  MessageSquare,
  PlusCircle,
  BarChart3,
  Menu,
  Building2,
  Wifi,
  WifiOff,
  RefreshCw,
  LogOut,
  Sparkles,
  Smartphone,
  ChevronDown,
} from 'lucide-react';
import { useState } from 'react';

const NAV_ITEMS = [
  { path: '/', label: 'Inicio / Granja', icon: Home },
  { path: '/chat', label: 'Asistente IA', icon: MessageSquare },
  { path: '/register', label: 'Registrar Operación', icon: PlusCircle, isHighlight: true },
  { path: '/reports', label: 'Reportes & Métricas', icon: BarChart3 },
  { path: '/more', label: 'Ajustes & Equipo', icon: Menu },
];

export function DesktopSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, companies, activeCompanyId, selectCompany, logout } = useAuthStore();
  const { isOnline, isSyncing, queue, syncNow } = useSyncStore();
  const [showCompanyMenu, setShowCompanyMenu] = useState(false);

  const activeCompany = companies.find((c) => c.id === activeCompanyId);

  const handleNav = async (path: string) => {
    await haptics.light();
    navigate(path);
  };

  const handleSync = async () => {
    await haptics.light();
    await syncNow();
  };

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-slate-900 border-r border-slate-800 z-30 select-none">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400 shadow-md shadow-teal-500/10">
            <span className="text-xl font-black tracking-tighter">CT</span>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-black text-slate-100 text-sm tracking-tight">CryoTech</span>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                PWA
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Mobile & Field Station</p>
          </div>
        </div>
      </div>

      {/* Company Selector */}
      <div className="px-4 py-3 border-b border-slate-800/80">
        <div className="relative">
          <button
            onClick={() => {
              if (companies.length > 1) {
                haptics.light();
                setShowCompanyMenu(!showCompanyMenu);
              }
            }}
            className="w-full flex items-center justify-between p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-slate-700 transition-colors text-left"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 shrink-0">
                <Building2 className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-100 truncate">
                  {activeCompany?.name || 'CryoTech Granja'}
                </p>
                {activeCompany?.isDemo && (
                  <span className="text-[9px] text-amber-400 font-semibold block">
                    Modo Demostración (2h)
                  </span>
                )}
              </div>
            </div>
            {companies.length > 1 && <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
          </button>

          {showCompanyMenu && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-1 z-50 animate-in fade-in">
              <div className="text-[10px] uppercase font-semibold text-slate-500 px-3 py-1.5">
                Empresas disponibles
              </div>
              {companies.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    selectCompany(c.id);
                    setShowCompanyMenu(false);
                    haptics.medium();
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between transition-colors ${
                    c.id === activeCompanyId
                      ? 'bg-teal-500/20 text-teal-300 font-semibold'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span className="truncate">{c.name}</span>
                  {c.id === activeCompanyId && <span className="text-teal-400">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Nav Links */}
      <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;

          if (item.isHighlight) {
            return (
              <button
                key={item.path}
                onClick={() => handleNav(item.path)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-bold text-xs transition-all ${
                  isActive
                    ? 'bg-teal-500 text-slate-950 shadow-lg shadow-teal-500/20'
                    : 'bg-teal-500/10 text-teal-300 hover:bg-teal-500/20 border border-teal-500/30'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          }

          return (
            <button
              key={item.path}
              onClick={() => handleNav(item.path)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                isActive
                  ? 'bg-slate-800/90 text-teal-300 border border-teal-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={`w-4 h-4 ${isActive ? 'text-teal-400 stroke-[2.2]' : 'text-slate-400'}`}
                />
                <span>{item.label}</span>
              </div>
              {item.path === '/' && queue.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold">
                  {queue.length}
                </span>
              )}
            </button>
          );
        })}

        {/* Quick Assistant Callout */}
        <div className="pt-3">
          <div
            onClick={() => handleNav('/chat')}
            className="p-3.5 rounded-2xl bg-gradient-to-br from-teal-950/40 to-slate-950 border border-teal-500/25 cursor-pointer hover:border-teal-500/40 transition-colors"
          >
            <div className="flex items-center gap-2 text-teal-400 font-bold text-xs mb-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Asistente Avícola</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-snug">
              Registra consumos, mortalidad o ventas escribiendo en lenguaje natural.
            </p>
          </div>
        </div>
      </nav>

      {/* Sync & Connectivity Box */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/40">
        <div className="flex items-center justify-between mb-2 text-xs">
          <span className="text-[11px] font-semibold text-slate-400">Estado de Red:</span>
          {!isOnline ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-400">
              <WifiOff className="w-3 h-3" /> Offline
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400">
              <Wifi className="w-3 h-3" /> Online
            </span>
          )}
        </div>

        {queue.length > 0 ? (
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="w-full py-2 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>Sincronizar {queue.length} pendientes</span>
          </button>
        ) : (
          <div className="text-[11px] text-slate-500 text-center py-1">
            ✓ Base de datos sincronizada
          </div>
        )}
      </div>

      {/* User Footer */}
      <div className="p-3.5 border-t border-slate-800 flex items-center justify-between">
        <div className="min-w-0 pr-2">
          <p className="text-xs font-bold text-slate-200 truncate">
            {user?.fullName || 'Productor'}
          </p>
          <p className="text-[10px] text-slate-500 truncate">{user?.email || 'cryotech.demo'}</p>
        </div>
        <button
          onClick={() => {
            haptics.medium();
            logout();
          }}
          title="Cerrar sesión"
          className="p-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
}

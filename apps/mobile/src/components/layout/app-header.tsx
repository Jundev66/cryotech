import { useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { useSyncStore } from '@/stores/sync.store';
import { Wifi, WifiOff, RefreshCw, ChevronDown, Building2 } from 'lucide-react';
import { haptics } from '@/lib/native';

export function AppHeader({ title }: { title?: string }) {
  const { companies, activeCompanyId, selectCompany, user } = useAuthStore();
  const { isOnline, isSyncing, queue, syncNow } = useSyncStore();
  const [showCompanyMenu, setShowCompanyMenu] = useState(false);

  const activeCompany = companies.find((c) => c.id === activeCompanyId);

  const handleSyncPress = async () => {
    await haptics.light();
    await syncNow();
  };

  return (
    <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800/80 px-4 pt-4 pb-3 safe-top">
      <div className="flex items-center justify-between">
        {/* Company Picker or Title */}
        <div>
          {title ? (
            <h1 className="text-lg font-bold text-slate-100">{title}</h1>
          ) : (
            <div className="relative">
              <button
                onClick={() => {
                  if (companies.length > 1) {
                    haptics.light();
                    setShowCompanyMenu(!showCompanyMenu);
                  }
                }}
                className="touch-active flex items-center gap-1.5 text-left"
              >
                <div className="w-7 h-7 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-slate-100 leading-tight">
                      {activeCompany?.name || 'CryoTech'}
                    </span>
                    {activeCompany?.isDemo && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
                        Demo Temporal
                      </span>
                    )}
                    {companies.length > 1 && (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {user?.fullName?.split(' ')[0] || 'Productor'}
                  </span>
                </div>
              </button>

              {/* Company dropdown */}
              {showCompanyMenu && (
                <div className="absolute top-full left-0 mt-2 w-56 bg-slate-900 border border-slate-800 rounded-xl shadow-xl p-1 z-50 animate-in fade-in">
                  <div className="text-[10px] uppercase font-semibold text-slate-400 px-3 py-1.5">
                    Cambiar empresa
                  </div>
                  {companies.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        selectCompany(c.id);
                        setShowCompanyMenu(false);
                        haptics.medium();
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between ${
                        c.id === activeCompanyId
                          ? 'bg-teal-500/20 text-teal-300 font-semibold'
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <span className="truncate">{c.name}</span>
                      {c.id === activeCompanyId && <span className="text-teal-400 text-xs">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sync & Connectivity Pill */}
        <div className="flex items-center gap-2">
          {!isOnline ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-950/60 border border-red-800/60 text-red-300 text-[11px] font-medium">
              <WifiOff className="w-3 h-3 text-red-400" />
              <span>Offline</span>
            </div>
          ) : queue.length > 0 ? (
            <button
              onClick={handleSyncPress}
              disabled={isSyncing}
              className="touch-active flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-950/60 border border-amber-800/60 text-amber-300 text-[11px] font-medium"
            >
              <RefreshCw className={`w-3 h-3 text-amber-400 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{queue.length} por subir</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/40 border border-emerald-800/40 text-emerald-300 text-[11px] font-medium">
              <Wifi className="w-3 h-3 text-emerald-400" />
              <span>Sincronizado</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

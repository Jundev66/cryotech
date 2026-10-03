import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/api/client';
import { useAuthStore } from '@/stores/auth.store';
import { haptics } from '@/lib/native';
import { AppHeader } from '@/components/layout/app-header';
import { Skull, Wheat, DollarSign, Bird, ChevronRight, Sparkles, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router';
import { DEMO_STATS, DEMO_BATCHES } from '@/lib/demo-data';

export function HomePage() {
  const navigate = useNavigate();
  const { activeCompanyId, companies } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);

  const activeCompany = companies.find((c) => c.id === activeCompanyId);
  const isDemo = activeCompany?.isDemo || activeCompany?.name?.toLowerCase().includes('demo');

  // Stats query
  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['dashboard-stats', activeCompanyId],
    queryFn: async () => {
      try {
        const res = await api.get('/dashboard/stats');
        const d = res.data;
        if (d && (Number(d.totalAlive) > 0 || Number(d.activeBirds) > 0 || Number(d.todayFeedKg) > 0)) {
          return d;
        }
        if (isDemo) return DEMO_STATS;
        return d || {};
      } catch {
        if (isDemo) return DEMO_STATS;
        return {};
      }
    },
    enabled: !!activeCompanyId,
  });

  // Active batches query
  const { data: batchesRaw = [], refetch: refetchBatches } = useQuery({
    queryKey: ['batches-active', activeCompanyId],
    queryFn: async () => {
      try {
        const res = await api.get('/batches', {
          params: { status: 'breeding,for_sale', limit: 10 },
        });
        const data = res.data;
        const list = Array.isArray(data)
          ? data
          : Array.isArray((data as unknown as { data?: unknown[] })?.data)
            ? (data as unknown as { data: unknown[] }).data
            : [];
        if (list.length > 0) return list;
        if (isDemo) return DEMO_BATCHES;
        return [];
      } catch {
        if (isDemo) return DEMO_BATCHES;
        return [];
      }
    },
    enabled: !!activeCompanyId,
  });

  const batches =
    Array.isArray(batchesRaw) && batchesRaw.length > 0
      ? batchesRaw
      : isDemo
        ? DEMO_BATCHES
        : [];

  const handleRefresh = async () => {
    setRefreshing(true);
    await haptics.light();
    try {
      await Promise.all([refetchStats(), refetchBatches()]);
      await haptics.success();
    } catch {}
    setRefreshing(false);
  };

  const todayFormatted = (() => {
    try {
      return new Intl.DateTimeFormat('es-VE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }).format(new Date());
    } catch {
      return new Date().toLocaleDateString('es-VE');
    }
  })();

  return (
    <div className="min-h-screen bg-slate-950 pb-24 md:pb-12">
      <AppHeader />

      <main className="px-4 md:px-8 py-5 space-y-6 max-w-6xl mx-auto">
        {/* Date and Assistant Quick Prompt */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 border border-slate-800/80 p-4 md:p-5 rounded-3xl">
          <div>
            <p className="text-xs text-slate-400 capitalize font-medium">{todayFormatted}</p>
            <h2 className="text-xl md:text-2xl font-black text-slate-100 tracking-tight">Estado de Granja en Tiempo Real</h2>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => navigate('/register')}
              className="hidden md:inline-flex items-center gap-1.5 px-4 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold rounded-xl transition-all shadow-md shadow-teal-500/20 cursor-pointer"
            >
              + Nuevo Registro
            </button>
            <button
              onClick={handleRefresh}
              className="touch-active text-xs text-teal-400 bg-teal-500/10 border border-teal-500/20 px-3.5 py-2 rounded-xl font-semibold hover:bg-teal-500/20 transition-colors"
            >
              {refreshing ? 'Actualizando...' : 'Actualizar'}
            </button>
          </div>
        </div>

        {/* AI / Chatbot Quick Assistant Banner */}
        <div
          onClick={() => {
            haptics.light();
            navigate('/chat');
          }}
          className="touch-active bg-gradient-to-r from-teal-950/70 via-slate-900 to-slate-900 border border-teal-500/30 rounded-3xl p-4 md:p-5 flex items-center justify-between cursor-pointer shadow-xl shadow-teal-950/20 hover:border-teal-500/50 transition-all"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-teal-500 flex items-center justify-center text-slate-950 shadow-md shadow-teal-500/30 shrink-0">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm md:text-base font-bold text-slate-100">Asistente Inteligente de Granja</h3>
                <span className="hidden sm:inline-block text-[10px] uppercase font-bold px-2 py-0.5 rounded-md bg-teal-500/20 text-teal-300">
                  Voz / Texto
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Registra ventas, bajas, insumos o consulta el stock y tasa BCV en lenguaje natural.
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-teal-400 shrink-0" />
        </div>

        {/* Quick KPI Cards Grid (2 cols on mobile, 4 cols on desktop) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {/* Mortalidad */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 md:p-5 flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider">Mortalidad</span>
              <div className="p-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20">
                <Skull className="w-4 h-4" />
              </div>
            </div>
            <div>
              <span className="text-2xl md:text-3xl font-black text-slate-100">
                {stats?.mortalityPct ?? stats?.todayMortality ?? 0}
              </span>
              <span className="text-xs text-slate-400 ml-1 font-medium">{stats?.mortalityPct !== undefined ? '%' : 'aves hoy'}</span>
            </div>
          </div>

          {/* Consumo */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 md:p-5 flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider">Alimento</span>
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Wheat className="w-4 h-4" />
              </div>
            </div>
            <div>
              <span className="text-2xl md:text-3xl font-black text-slate-100">
                {stats?.todayFeedKg ?? 0}
              </span>
              <span className="text-xs text-slate-400 ml-1 font-medium">kg consumidos hoy</span>
            </div>
          </div>

          {/* Aves Activas */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 md:p-5 flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider">En Corral</span>
              <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
                <Bird className="w-4 h-4" />
              </div>
            </div>
            <div>
              <span className="text-2xl md:text-3xl font-black text-slate-100">
                {(stats?.totalAlive ?? stats?.activeBirds ?? 0).toLocaleString()}
              </span>
              <span className="text-xs text-slate-400 ml-1 font-medium">aves vivas</span>
            </div>
          </div>

          {/* Ventas */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 md:p-5 flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider">Ventas & Cobros</span>
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div>
              <span className="text-2xl md:text-3xl font-black text-slate-100">
                ${stats?.pendingCollectionsUsd ?? stats?.totalRevenue ?? '0.00'}
              </span>
              <span className="text-xs text-slate-400 ml-1 font-medium">USD</span>
            </div>
          </div>
        </div>

        {/* Lotes Activos Section (Grid on desktop) */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
              Lotes en crianza ({batches.length})
            </h3>
            <button
              onClick={() => navigate('/more')}
              className="text-xs text-teal-400 hover:text-teal-300 font-semibold transition-colors"
            >
              Ver todos los lotes
            </button>
          </div>

          {batches.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center">
              <AlertCircle className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-300">No hay lotes activos</p>
              <p className="text-xs text-slate-400 mt-1">
                Puedes registrar un nuevo lote o revisar finalizados.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 md:gap-4">
              {batches.map((b: { id: string; code?: string; breed?: string; currentQuantity?: number; initialQuantity?: number; status?: string }) => {
                const currentQty = Number(b.currentQuantity) || 0;
                const initialQty = Number(b.initialQuantity) || 1;
                const pctAlive = Math.round((currentQty / initialQty) * 100);
                return (
                  <div
                    key={b.id || Math.random().toString()}
                    onClick={() => {
                      haptics.light();
                      navigate(`/register?batchId=${b.id}`);
                    }}
                    className="touch-active bg-slate-900 border border-slate-800 hover:border-teal-500/40 rounded-3xl p-5 cursor-pointer transition-all shadow-sm group"
                  >
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-slate-100 group-hover:text-teal-300 transition-colors">
                          {b.code || b.breed || 'Lote'}
                        </span>
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                          {b.breed || 'Engorde'}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-teal-400">
                        {currentQty.toLocaleString()} vivas
                      </span>
                    </div>

                    {/* Progress Bar of Alive Birds */}
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mb-3">
                      <div
                        className="bg-teal-500 h-full rounded-full transition-all"
                        style={{ width: `${Math.min(Math.max(pctAlive, 0), 100)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Población inicial: <strong className="text-slate-300">{initialQty.toLocaleString()}</strong></span>
                      <span>Supervivencia: <strong className="text-teal-400">{pctAlive}%</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default HomePage;

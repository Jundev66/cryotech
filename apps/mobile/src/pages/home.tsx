import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/api/client';
import { useAuthStore } from '@/stores/auth.store';
import { haptics } from '@/lib/native';
import { AppHeader } from '@/components/layout/app-header';
import { Skull, Wheat, DollarSign, Bird, ChevronRight, Sparkles, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router';

export function HomePage() {
  const navigate = useNavigate();
  const activeCompanyId = useAuthStore((s) => s.activeCompanyId);
  const [refreshing, setRefreshing] = useState(false);

  // Stats query
  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['dashboard-stats', activeCompanyId],
    queryFn: async () => {
      try {
        const res = await api.get('/dashboard/stats');
        return res.data || {};
      } catch {
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
        if (Array.isArray(data)) return data;
        if (Array.isArray((data as unknown as { data?: unknown[] })?.data)) {
          return (data as unknown as { data: unknown[] }).data;
        }
        return [];
      } catch {
        return [];
      }
    },
    enabled: !!activeCompanyId,
  });

  const batches = Array.isArray(batchesRaw) ? batchesRaw : [];

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
    <div className="min-h-screen bg-slate-950 pb-24">
      <AppHeader />

      <main className="px-4 py-4 space-y-5 max-w-lg mx-auto">
        {/* Date and Assistant Quick Prompt */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 capitalize font-medium">{todayFormatted}</p>
            <h2 className="text-xl font-bold text-slate-100">Estado de Granja</h2>
          </div>

          <button
            onClick={handleRefresh}
            className="touch-active text-xs text-teal-400 bg-teal-500/10 border border-teal-500/20 px-3 py-1.5 rounded-full font-medium"
          >
            {refreshing ? 'Actualizando...' : 'Actualizar'}
          </button>
        </div>

        {/* AI / Chatbot Quick Assistant Banner */}
        <div
          onClick={() => {
            haptics.light();
            navigate('/chat');
          }}
          className="touch-active bg-gradient-to-r from-teal-950/60 to-slate-900 border border-teal-500/30 rounded-2xl p-4 flex items-center justify-between cursor-pointer shadow-lg shadow-teal-950/30"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500 flex items-center justify-center text-slate-950 shadow-md shadow-teal-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">Asistente Inteligente</h3>
              <p className="text-xs text-slate-400">Registra ventas, bajas o consumo por chat</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-teal-400" />
        </div>

        {/* Quick KPI Cards Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Mortalidad */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Mortalidad</span>
              <div className="p-1.5 rounded-lg bg-red-500/10 text-red-400">
                <Skull className="w-3.5 h-3.5" />
              </div>
            </div>
            <div>
              <span className="text-2xl font-black text-slate-100">
                {stats?.mortalityPct ?? stats?.todayMortality ?? 0}
              </span>
              <span className="text-xs text-slate-400 ml-1">{stats?.mortalityPct !== undefined ? '%' : 'aves hoy'}</span>
            </div>
          </div>

          {/* Consumo */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Alimento</span>
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
                <Wheat className="w-3.5 h-3.5" />
              </div>
            </div>
            <div>
              <span className="text-2xl font-black text-slate-100">
                {stats?.todayFeedKg ?? 0}
              </span>
              <span className="text-xs text-slate-400 ml-1">kg hoy</span>
            </div>
          </div>

          {/* Aves Activas */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">En Corral</span>
              <div className="p-1.5 rounded-lg bg-teal-500/10 text-teal-400">
                <Bird className="w-3.5 h-3.5" />
              </div>
            </div>
            <div>
              <span className="text-2xl font-black text-slate-100">
                {(stats?.totalAlive ?? stats?.activeBirds ?? 0).toLocaleString()}
              </span>
              <span className="text-xs text-slate-400 ml-1">vivas</span>
            </div>
          </div>

          {/* Ventas */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Ventas / Cobros</span>
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                <DollarSign className="w-3.5 h-3.5" />
              </div>
            </div>
            <div>
              <span className="text-2xl font-black text-slate-100">
                ${stats?.pendingCollectionsUsd ?? stats?.totalRevenue ?? '0.00'}
              </span>
            </div>
          </div>
        </div>

        {/* Lotes Activos Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Lotes en crianza ({batches.length})
            </h3>
            <button
              onClick={() => navigate('/more')}
              className="text-xs text-teal-400 font-medium"
            >
              Ver todos
            </button>
          </div>

          {batches.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center">
              <AlertCircle className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-300">No hay lotes activos</p>
              <p className="text-xs text-slate-400 mt-1">
                Puedes registrar un nuevo lote o revisar finalizados.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
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
                    className="touch-active bg-slate-900 border border-slate-800 rounded-2xl p-4 cursor-pointer hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-100">
                          {b.code || b.breed || 'Lote'}
                        </span>
                        <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                          {b.breed || 'Engorde'}
                        </span>
                      </div>
                      <span className="text-xs font-semibold text-teal-400">
                        {currentQty.toLocaleString()} vivas
                      </span>
                    </div>

                    {/* Progress Bar of Alive Birds */}
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mb-2">
                      <div
                        className="bg-teal-500 h-full rounded-full transition-all"
                        style={{ width: `${Math.min(Math.max(pctAlive, 0), 100)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>Inicial: {initialQty.toLocaleString()}</span>
                      <span>Supervivencia: {pctAlive}%</span>
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

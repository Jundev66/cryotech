import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { AppHeader } from '@/components/layout/app-header';
import api from '@/api/client';
import { haptics } from '@/lib/native';
import {
  Skull,
  DollarSign,
  Layers,
  ShoppingBag,
  Weight,
  Activity,
  CheckCircle2,
} from 'lucide-react';

interface BatchProfitability {
  batchId: string;
  code: string;
  breed: string;
  startDate: string;
  status: string;
  initialQuantity: number;
  currentQuantity: number;
  inCorral: number;
  processedCount: number;
  soldLiveCount: number;
  soldDeadCount: number;
  soldCount: number;
  mortality: number;
  mortalityPct: number;
  totalExpenses: number;
  costPerChicken: number;
  expenseBreakdown: Array<{ category: string; amount: number }>;
  totalRevenueUsd: number;
  totalRevenueBs: number;
  avgPricePerKg: number;
  avgWeightKg: number;
  avgRevenuePerChickenUsd: number;
  avgRevenuePerChickenBs: number;
  profitPerChickenBs: number;
  marginPct: number;
  projectedRevenueBs: number;
  projectedProfitBs: number;
  exchangeRate: number;
}

import { DEMO_BATCH_REPORTS } from '@/lib/demo-data';

export function ReportsPage() {
  const { activeCompanyId, companies } = useAuthStore();
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');

  const activeCompany = companies.find((c) => c.id === activeCompanyId);
  const isDemo = activeCompany?.isDemo || activeCompany?.name?.toLowerCase().includes('demo');

  // Fetch all batches profitability
  const { data: batchReports = [], isLoading: isLoadingReports } = useQuery<BatchProfitability[]>({
    queryKey: ['reports-batch-profitability', activeCompanyId],
    queryFn: async () => {
      try {
        const res = await api.get('/reports/batch-profitability');
        const list = res.data || [];
        if (list.length > 0) return list;
        if (isDemo) return DEMO_BATCH_REPORTS;
        return [];
      } catch {
        if (isDemo) return DEMO_BATCH_REPORTS;
        return [];
      }
    },
    enabled: !!activeCompanyId,
  });

  // Pick the currently selected batch or default to the first active/for_sale batch
  const currentBatch =
    batchReports.find((b) => b.batchId === selectedBatchId) ||
    batchReports.find((b) => b.status === 'for_sale' || b.status === 'breeding') ||
    batchReports[0];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'for_sale':
        return { label: 'En Venta', bg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };
      case 'breeding':
        return { label: 'En Crianza', bg: 'bg-amber-500/20 text-amber-400 border-amber-500/30' };
      case 'finished':
        return { label: 'Finalizado', bg: 'bg-slate-700/40 text-slate-400 border-slate-700' };
      default:
        return { label: status, bg: 'bg-slate-800 text-slate-300 border-slate-700' };
    }
  };

  // Calculate days elapsed from start date
  const getDaysElapsed = (startDateStr?: string) => {
    if (!startDateStr) return 0;
    const start = new Date(startDateStr);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="min-h-screen bg-slate-950 pb-24 text-slate-100">
      <AppHeader title="Reportes por Lote" />

      <main className="px-4 py-4 space-y-4 max-w-lg mx-auto">
        {/* Batch Selector Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-teal-400" />
              Seleccionar Lote
            </label>
            <span className="text-[11px] text-teal-400 font-medium">
              {batchReports.length} lote{batchReports.length !== 1 ? 's' : ''} registrado{batchReports.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {batchReports.map((b) => {
              const isSelected = currentBatch?.batchId === b.batchId;
              return (
                <button
                  key={b.batchId}
                  onClick={() => {
                    haptics.light();
                    setSelectedBatchId(b.batchId);
                  }}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border shrink-0 ${
                    isSelected
                      ? 'bg-teal-500 text-slate-950 border-teal-400 shadow-md shadow-teal-500/20 font-bold'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {b.code} ({b.breed})
                </button>
              );
            })}
          </div>
        </div>

        {isLoadingReports ? (
          <div className="py-16 text-center">
            <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs text-slate-400">Calculando métricas del lote...</p>
          </div>
        ) : !currentBatch ? (
          <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-3xl">
            <p className="text-sm text-slate-400">No hay datos de lotes disponibles.</p>
          </div>
        ) : (
          <>
            {/* Batch Identity Spotlight Header */}
            <div className="bg-gradient-to-br from-teal-950/60 via-slate-900 to-slate-900 border border-teal-500/30 rounded-3xl p-5 shadow-lg shadow-teal-950/20">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-slate-100">{currentBatch.code}</h3>
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                        getStatusBadge(currentBatch.status).bg
                      }`}
                    >
                      {getStatusBadge(currentBatch.status).label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {currentBatch.breed} · Iniciado:{' '}
                    {new Date(currentBatch.startDate).toLocaleDateString('es-VE')}
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-xs font-bold text-teal-400">
                    Día {getDaysElapsed(currentBatch.startDate)}
                  </span>
                  <p className="text-[10px] text-slate-500">de crianza</p>
                </div>
              </div>

              {/* Progress Bar of Batch Stock */}
              <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
                <div className="flex justify-between text-xs text-slate-300">
                  <span>Balance Poblacional</span>
                  <span className="font-semibold text-teal-300">
                    {currentBatch.currentQuantity} vivas de {currentBatch.initialQuantity}
                  </span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden flex">
                  <div
                    className="bg-emerald-500 h-full"
                    style={{
                      width: `${(currentBatch.currentQuantity / (currentBatch.initialQuantity || 1)) * 100}%`,
                    }}
                    title="Vivas"
                  />
                  <div
                    className="bg-blue-500 h-full"
                    style={{
                      width: `${(currentBatch.processedCount / (currentBatch.initialQuantity || 1)) * 100}%`,
                    }}
                    title="Beneficiadas"
                  />
                  <div
                    className="bg-red-500 h-full"
                    style={{
                      width: `${(currentBatch.mortality / (currentBatch.initialQuantity || 1)) * 100}%`,
                    }}
                    title="Muertas"
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 pt-1">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" /> Vivas: {currentBatch.currentQuantity}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-500" /> Beneficiadas: {currentBatch.processedCount}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-500" /> Muertes: {currentBatch.mortality}
                  </span>
                </div>
              </div>
            </div>

            {/* Core KPIs Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                  <Skull className="w-4 h-4 text-red-400" />
                  <span>Mortalidad Lote</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-bold text-slate-100">{currentBatch.mortality}</span>
                  <span className="text-xs text-red-400 font-semibold">
                    ({currentBatch.mortalityPct}%)
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Total de bajas registradas</p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                  <ShoppingBag className="w-4 h-4 text-emerald-400" />
                  <span>Ventas Totales</span>
                </div>
                <span className="text-xl font-bold text-emerald-400">
                  ${currentBatch.totalRevenueUsd.toFixed(2)}
                </span>
                <p className="text-[10px] text-slate-500 mt-1">
                  {currentBatch.soldCount} aves vendidas
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                  <Weight className="w-4 h-4 text-amber-400" />
                  <span>Peso Promedio</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold text-slate-100">
                    {currentBatch.avgWeightKg > 0 ? currentBatch.avgWeightKg.toFixed(2) : '—'}
                  </span>
                  <span className="text-xs text-slate-400">kg</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Por ave en venta</p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                  <DollarSign className="w-4 h-4 text-teal-400" />
                  <span>Precio Prom/kg</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold text-teal-400">
                    ${currentBatch.avgPricePerKg > 0 ? currentBatch.avgPricePerKg.toFixed(2) : '4.00'}
                  </span>
                  <span className="text-xs text-slate-400">/kg</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Promedio facturado</p>
              </div>
            </div>

            {/* Reconciliation and Breakdown Details */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal-400" />
                Desglose Operativo del Lote
              </h4>

              <div className="space-y-2 text-xs divide-y divide-slate-800/80">
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-400">Aves Iniciales</span>
                  <span className="font-semibold text-slate-200">{currentBatch.initialQuantity}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-400">Pollos Vivos en Galpón</span>
                  <span className="font-bold text-emerald-400">{currentBatch.currentQuantity}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-400">Aves Beneficiadas (Total)</span>
                  <span className="font-semibold text-blue-400">{currentBatch.processedCount}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-400">Ventas en Pie (Vivos)</span>
                  <span className="font-semibold text-slate-200">{currentBatch.soldLiveCount}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-400">Ventas Beneficiados</span>
                  <span className="font-semibold text-slate-200">{currentBatch.soldDeadCount}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-400">Mortalidad Acumulada</span>
                  <span className="font-semibold text-red-400">{currentBatch.mortality}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-400">Ingresos Totales en Bs</span>
                  <span className="font-semibold text-emerald-400">
                    Bs {currentBatch.totalRevenueBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* Expenses breakdown if present */}
            {currentBatch.expenseBreakdown && currentBatch.expenseBreakdown.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-amber-400" />
                  Costos y Gastos Asignados
                </h4>
                <div className="space-y-2 text-xs">
                  {currentBatch.expenseBreakdown.map((exp, idx) => (
                    <div key={idx} className="flex justify-between items-center py-1 border-b border-slate-800/60 last:border-0">
                      <span className="text-slate-400 capitalize">
                        {exp.category === 'processing' ? 'Beneficio / Faenado' : exp.category}
                      </span>
                      <span className="font-semibold text-slate-200">
                        Bs {exp.amount.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 text-xs font-bold border-t border-slate-700">
                    <span className="text-slate-300">Total Gastos</span>
                    <span className="text-amber-400">
                      Bs {currentBatch.totalExpenses.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

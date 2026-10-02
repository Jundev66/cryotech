import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { useSyncStore } from '@/stores/sync.store';
import { AppHeader } from '@/components/layout/app-header';
import { haptics } from '@/lib/native';
import api from '@/api/client';
import { toast } from 'sonner';
import { findBestMatch } from '@cryotech/shared-types';
import {
  Calendar,
  TrendingUp,
  DollarSign,
  ShoppingCart,
  X,
  Check,
  ChevronRight,
  Trash2,
  RefreshCw,
} from 'lucide-react';

import { DEMO_BATCHES, DEMO_CLIENTS, DEMO_SALES } from '@/lib/demo-data';

type FormType = 'daily_log' | 'sale' | 'payment' | 'purchase' | null;

export function RegisterHubPage() {
  const { activeCompanyId, companies } = useAuthStore();
  const enqueue = useSyncStore((s) => s.enqueue);
  const queryClient = useQueryClient();
  const [activeForm, setActiveForm] = useState<FormType>(null);
  const [loading, setLoading] = useState(false);

  const activeCompany = companies.find((c) => c.id === activeCompanyId);
  const isDemo = activeCompany?.isDemo || activeCompany?.name?.toLowerCase().includes('demo');

  // Queries for selectors
  const { data: batches = [] } = useQuery({
    queryKey: ['batches-select', activeCompanyId],
    queryFn: async () => {
      try {
        const res = await api.get('/batches', { params: { status: 'breeding,for_sale' } });
        const list = res.data?.data || res.data || [];
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

  const { data: clients = [], refetch: refetchClients } = useQuery({
    queryKey: ['clients-select', activeCompanyId],
    queryFn: async () => {
      try {
        const res = await api.get('/clients', { params: { limit: 100 } });
        const list = res.data?.data || res.data || [];
        if (list.length > 0) return list;
        if (isDemo) return DEMO_CLIENTS;
        return [];
      } catch {
        if (isDemo) return DEMO_CLIENTS;
        return [];
      }
    },
    enabled: !!activeCompanyId,
  });

  // Query for pending sales (por cobrar)
  const { data: pendingSales = [], refetch: refetchSales, isFetching: fetchingSales } = useQuery({
    queryKey: ['sales-pending', activeCompanyId],
    queryFn: async () => {
      try {
        const res = await api.get('/sales', {
          params: { paymentStatus: 'pending,partial', limit: 50 },
        });
        const data = res.data;
        const list = Array.isArray(data) ? data : data?.data || [];
        if (list.length > 0) return list;
        if (isDemo) return DEMO_SALES;
        return [];
      } catch {
        if (isDemo) return DEMO_SALES;
        return [];
      }
    },
    enabled: !!activeCompanyId,
  });

  // State for cancelling sales
  const [saleToCancel, setSaleToCancel] = useState<any | null>(null);
  const [cancellingSale, setCancellingSale] = useState(false);

  const handleConfirmCancelSale = async () => {
    if (!saleToCancel) return;
    setCancellingSale(true);
    await haptics.medium();
    try {
      if (saleToCancel.payments && saleToCancel.payments.length > 0) {
        for (const p of saleToCancel.payments) {
          await api.delete(`/sales/${saleToCancel.id}/payments/${p.id}`);
        }
      }
      await api.delete(`/sales/${saleToCancel.id}`);
      await haptics.success();
      toast.success('Venta cancelada. Las aves fueron devueltas al inventario.');
      setSaleToCancel(null);
      await refetchSales();
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['batches-active'] });
      queryClient.invalidateQueries({ queryKey: ['batches-select'] });
    } catch (err: unknown) {
      await haptics.error();
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Error al cancelar la venta';
      toast.error(msg);
    } finally {
      setCancellingSale(false);
    }
  };

  const handleQuickPaySale = (sale: any) => {
    const balance = Math.max(0, Number(sale.totalAmount) - Number(sale.paidAmount || 0));
    setPaymentData({
      clientId: sale.clientId || '',
      amount: balance > 0 ? balance.toFixed(2) : String(sale.totalAmount),
      currency: 'USD',
      notes: `Pago ${sale.code || 'venta'}`,
    });
    openForm('payment');
  };

  // State for quick client creation
  const [showQuickClientModal, setShowQuickClientModal] = useState(false);
  const [quickClientName, setQuickClientName] = useState('');
  const [quickClientPhone, setQuickClientPhone] = useState('');
  const [creatingClient, setCreatingClient] = useState(false);

  const handleCreateQuickClient = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = quickClientName.trim();
    if (!cleanName) return;

    // Check if client already exists (case-insensitive + phonetic fuzzy match)
    const match = findBestMatch(cleanName, clients, (c: { id: string; name: string }) => c.name, 0.80);
    const existing = match?.best;

    if (existing) {
      toast.info(`El cliente "${existing.name}" ya existe y fue seleccionado.`);
      setSaleData((prev) => ({ ...prev, clientId: existing.id }));
      setShowQuickClientModal(false);
      setQuickClientName('');
      setQuickClientPhone('');
      await haptics.light();
      return;
    }

    setCreatingClient(true);
    await haptics.light();
    try {
      const res = await api.post('/clients', {
        name: cleanName,
        phone: quickClientPhone.trim() || undefined,
      });
      await refetchClients();
      setSaleData((prev) => ({ ...prev, clientId: res.data.id }));
      toast.success(`Cliente "${cleanName}" creado con éxito.`);
      setShowQuickClientModal(false);
      setQuickClientName('');
      setQuickClientPhone('');
      await haptics.success();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Error al crear cliente';
      toast.error(msg);
      await haptics.error();
    } finally {
      setCreatingClient(false);
    }
  };

  // State for forms
  const [dailyLogData, setDailyLogData] = useState({
    batchId: '',
    mortality: 0,
    feedConsumedKg: '',
    averageWeightG: '',
    medicineAdministered: false,
    notes: '',
  });

  const [saleData, setSaleData] = useState({
    batchId: '',
    clientId: '',
    saleType: 'live',
    quantity: '',
    weightKg: '',
    pricePerKg: 4.5,
    paymentStatus: 'pending',
    notes: '',
  });

  const [paymentData, setPaymentData] = useState({
    clientId: '',
    amount: '',
    currency: 'USD',
    notes: '',
  });

  const openForm = async (type: FormType) => {
    await haptics.light();
    // Default batch if only one
    if (batches.length > 0) {
      setDailyLogData((prev) => ({ ...prev, batchId: batches[0].id }));
      setSaleData((prev) => ({ ...prev, batchId: batches[0].id }));
    }
    setActiveForm(type);
  };

  const closeForm = async () => {
    await haptics.light();
    setActiveForm(null);
  };

  // Submit Daily Log
  const handleSubmitDailyLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dailyLogData.batchId) {
      toast.error('Selecciona un lote');
      return;
    }
    setLoading(true);
    await haptics.light();
    try {
      const payload = {
        batchId: dailyLogData.batchId,
        mortality: Number(dailyLogData.mortality) || 0,
        feedConsumedKg: dailyLogData.feedConsumedKg ? Number(dailyLogData.feedConsumedKg) : undefined,
        averageWeightG: dailyLogData.averageWeightG ? Number(dailyLogData.averageWeightG) : undefined,
        medicineAdministered: dailyLogData.medicineAdministered,
        notes: dailyLogData.notes || undefined,
      };

      await enqueue({
        type: 'daily_log',
        title: `Registro Diario (${payload.mortality} bajas, ${payload.feedConsumedKg || 0}kg)`,
        url: '/daily-logs',
        method: 'POST',
        payload,
      });

      await haptics.success();
      toast.success('Registro diario guardado');
      closeForm();
    } catch {
      toast.error('Error al guardar');
    } finally {
      setLoading(false);
    }
  };

  // Submit Sale
  const handleSubmitSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saleData.batchId || !saleData.quantity || !saleData.weightKg) {
      toast.error('Completa los campos obligatorios');
      return;
    }
    setLoading(true);
    await haptics.light();
    try {
      const totalAmount = Number(saleData.weightKg) * Number(saleData.pricePerKg);
      const payload = {
        batchId: saleData.batchId,
        clientId: saleData.clientId || undefined,
        saleType: saleData.saleType,
        quantity: Number(saleData.quantity),
        weightKg: Number(saleData.weightKg),
        pricePerKg: Number(saleData.pricePerKg),
        totalAmount,
        paymentStatus: saleData.paymentStatus,
        notes: saleData.notes || undefined,
      };

      await enqueue({
        type: 'sale',
        title: `Venta: ${payload.quantity} aves ($${totalAmount.toFixed(2)})`,
        url: '/sales',
        method: 'POST',
        payload,
      });

      await haptics.success();
      toast.success('Venta registrada');
      closeForm();
      refetchSales();
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['batches-active'] });
    } catch {
      toast.error('Error al registrar venta');
    } finally {
      setLoading(false);
    }
  };

  // Submit Payment
  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentData.amount) {
      toast.error('Indica el monto cobrado');
      return;
    }
    setLoading(true);
    await haptics.light();
    try {
      const payload = {
        clientId: paymentData.clientId || undefined,
        amount: Number(paymentData.amount),
        notes: paymentData.notes || undefined,
      };

      await enqueue({
        type: 'payment',
        title: `Cobro: $${payload.amount}`,
        url: '/sales/payment',
        method: 'POST',
        payload,
      });

      await haptics.success();
      toast.success('Cobro registrado');
      closeForm();
      refetchSales();
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    } catch {
      toast.error('Error al registrar cobro');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 pb-24">
      <AppHeader title="Registrar Operación" />

      <main className="px-4 py-4 space-y-4 max-w-lg mx-auto">
        <p className="text-xs text-slate-400">
          Selecciona el tipo de registro manual que deseas realizar:
        </p>

        {/* Options List */}
        <div className="space-y-3">
          {/* Registro Diario */}
          <div
            onClick={() => openForm('daily_log')}
            className="touch-active bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
                <Calendar className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">Registro Diario</h3>
                <p className="text-xs text-slate-400">Bajas, consumo de alimento y peso</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-500" />
          </div>

          {/* Venta */}
          <div
            onClick={() => openForm('sale')}
            className="touch-active bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">Venta de Pollos</h3>
                <p className="text-xs text-slate-400">En pie o beneficiado, contado o crédito</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-500" />
          </div>

          {/* Cobranza */}
          <div
            onClick={() => openForm('payment')}
            className="touch-active bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center">
                <DollarSign className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">Cobranza</h3>
                <p className="text-xs text-slate-400">Abonos y pagos de ventas pendientes</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-500" />
          </div>

          {/* Compra de Insumo */}
          <div
            onClick={() => openForm('purchase')}
            className="touch-active bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
                <ShoppingCart className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">Compra de Insumo</h3>
                <p className="text-xs text-slate-400">Alimento, vacunas o medicinas</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-500" />
          </div>
        </div>

        {/* Ventas Pendientes de Cobro / Cuentas por Cobrar */}
        <div className="pt-2 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Ventas por Cobrar
              </h3>
              {pendingSales.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold">
                  {pendingSales.length}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                haptics.light();
                refetchSales();
              }}
              className="text-xs text-teal-400 font-medium flex items-center gap-1 active:opacity-70"
            >
              <RefreshCw className={`w-3 h-3 ${fetchingSales ? 'animate-spin' : ''}`} />
              <span>Actualizar</span>
            </button>
          </div>

          {pendingSales.length === 0 ? (
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl text-center text-xs text-slate-400">
              No hay ventas pendientes por cobrar en este momento.
            </div>
          ) : (
            <div className="space-y-2.5">
              {pendingSales.map((sale: any) => {
                const bal = Number(sale.totalAmount) - Number(sale.paidAmount || 0);
                const isPartial = sale.paymentStatus === 'partial';
                return (
                  <div
                    key={sale.id}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-100">
                            {sale.client?.name || 'Cliente sin nombre'}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                            {sale.code || 'S/C'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {sale.saleType === 'dead' ? 'Beneficiado' : 'Pollo en pie'} · {sale.quantity} aves ({sale.weightKg} kg)
                        </p>
                      </div>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          isPartial
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}
                      >
                        {isPartial ? 'Parcial' : 'Por Cobrar'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/80">
                      <div>
                        <span className="text-slate-400 text-[11px]">Total venta: </span>
                        <span className="text-slate-300 font-semibold">${Number(sale.totalAmount).toFixed(2)}</span>
                        {sale.paidAmount > 0 && (
                          <span className="text-[10px] text-emerald-400 ml-1.5">
                            (Abonó ${Number(sale.paidAmount).toFixed(2)})
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400">Saldo: </span>
                        <span className="text-sm font-black text-teal-400">
                          ${bal.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* Actions: Cancelar Venta and Cobrar */}
                    <div className="flex items-center gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          haptics.light();
                          setSaleToCancel(sale);
                        }}
                        className="touch-active flex-1 py-2.5 px-3 rounded-xl bg-red-950/30 hover:bg-red-950/50 border border-red-800/40 text-red-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Cancelar Venta</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          haptics.light();
                          handleQuickPaySale(sale);
                        }}
                        className="touch-active flex-1 py-2.5 px-3 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                        <span>Cobrar (${bal.toFixed(2)})</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Modal / Bottom Drawer for Forms */}
      {activeForm && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center animate-in fade-in">
          <div className="bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 shadow-2xl safe-bottom">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
              <h3 className="text-lg font-bold text-slate-100">
                {activeForm === 'daily_log' && 'Registro Diario'}
                {activeForm === 'sale' && 'Registrar Venta'}
                {activeForm === 'payment' && 'Registrar Cobranza'}
                {activeForm === 'purchase' && 'Compra de Insumos'}
              </h3>
              <button
                onClick={closeForm}
                className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form: REGISTRO DIARIO */}
            {activeForm === 'daily_log' && (
              <form onSubmit={handleSubmitDailyLog} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase">
                    Lote
                  </label>
                  <select
                    value={dailyLogData.batchId}
                    onChange={(e) => setDailyLogData({ ...dailyLogData, batchId: e.target.value })}
                    className="w-full px-3.5 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-teal-500"
                  >
                    {batches.map((b: { id: string; code: string; breed: string }) => (
                      <option key={b.id} value={b.id}>
                        {b.code || b.breed} ({b.breed})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase">
                      Bajas (Aves)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={dailyLogData.mortality}
                      onChange={(e) => setDailyLogData({ ...dailyLogData, mortality: Number(e.target.value) })}
                      className="w-full px-3.5 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase">
                      Alimento (Kg)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      placeholder="0.0"
                      value={dailyLogData.feedConsumedKg}
                      onChange={(e) => setDailyLogData({ ...dailyLogData, feedConsumedKg: e.target.value })}
                      className="w-full px-3.5 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-teal-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase">
                    Peso Promedio (Gramos)
                  </label>
                  <input
                    type="number"
                    placeholder="Ej. 1850"
                    value={dailyLogData.averageWeightG}
                    onChange={(e) => setDailyLogData({ ...dailyLogData, averageWeightG: e.target.value })}
                    className="w-full px-3.5 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div className="flex items-center gap-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <input
                    type="checkbox"
                    id="med"
                    checked={dailyLogData.medicineAdministered}
                    onChange={(e) => setDailyLogData({ ...dailyLogData, medicineAdministered: e.target.checked })}
                    className="w-4 h-4 rounded text-teal-500"
                  />
                  <label htmlFor="med" className="text-xs font-medium text-slate-200">
                    ¿Se suministró medicamento o vitaminas?
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="touch-active w-full py-4 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold rounded-xl text-sm shadow-lg flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>Guardar Registro Diario</span>
                </button>
              </form>
            )}

            {/* Form: VENTA */}
            {activeForm === 'sale' && (
              <form onSubmit={handleSubmitSale} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase">
                    Lote
                  </label>
                  <select
                    value={saleData.batchId}
                    onChange={(e) => setSaleData({ ...saleData, batchId: e.target.value })}
                    className="w-full px-3.5 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-teal-500"
                  >
                    {batches.map((b: { id: string; code: string; breed: string; currentQuantity: number }) => (
                      <option key={b.id} value={b.id}>
                        {b.code || b.breed} ({b.currentQuantity} disp.)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-300 uppercase">
                      Cliente (Opcional)
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowQuickClientModal(true)}
                      className="text-xs text-teal-400 font-semibold flex items-center gap-1 hover:underline"
                    >
                      <span>+ Nuevo Cliente</span>
                    </button>
                  </div>
                  <select
                    value={saleData.clientId}
                    onChange={(e) => setSaleData({ ...saleData, clientId: e.target.value })}
                    className="w-full px-3.5 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-teal-500"
                  >
                    <option value="">Cliente general / mostrador</option>
                    {clients.map((c: { id: string; name: string }) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase">
                      Cantidad Aves
                    </label>
                    <input
                      type="number"
                      min="1"
                      required
                      placeholder="Ej. 50"
                      value={saleData.quantity}
                      onChange={(e) => setSaleData({ ...saleData, quantity: e.target.value })}
                      className="w-full px-3.5 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase">
                      Peso Total (Kg)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.1"
                      required
                      placeholder="0.00"
                      value={saleData.weightKg}
                      onChange={(e) => setSaleData({ ...saleData, weightKg: e.target.value })}
                      className="w-full px-3.5 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-teal-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase">
                      Precio/Kg ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={saleData.pricePerKg}
                      onChange={(e) => setSaleData({ ...saleData, pricePerKg: Number(e.target.value) })}
                      className="w-full px-3.5 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase">
                      Condición Pago
                    </label>
                    <select
                      value={saleData.paymentStatus}
                      onChange={(e) => setSaleData({ ...saleData, paymentStatus: e.target.value })}
                      className="w-full px-3.5 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-teal-500"
                    >
                      <option value="paid">Pagó de inmediato</option>
                      <option value="pending">Fiado / Por cobrar</option>
                    </select>
                  </div>
                </div>

                {/* Live total display */}
                <div className="p-3 bg-teal-950/30 border border-teal-500/30 rounded-xl flex items-center justify-between">
                  <span className="text-xs text-slate-300 font-semibold">Total a cobrar:</span>
                  <span className="text-lg font-black text-teal-400">
                    ${((Number(saleData.weightKg) || 0) * (Number(saleData.pricePerKg) || 0)).toFixed(2)}
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="touch-active w-full py-4 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold rounded-xl text-sm shadow-lg flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>Registrar Venta</span>
                </button>
              </form>
            )}

            {/* Form: COBRANZA */}
            {activeForm === 'payment' && (
              <form onSubmit={handleSubmitPayment} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase">
                    Cliente
                  </label>
                  <select
                    value={paymentData.clientId}
                    onChange={(e) => setPaymentData({ ...paymentData, clientId: e.target.value })}
                    className="w-full px-3.5 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-teal-500"
                  >
                    <option value="">Selecciona cliente...</option>
                    {clients.map((c: { id: string; name: string }) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Show client pending sales if selected */}
                {paymentData.clientId && (() => {
                  const clientSales = pendingSales.filter((s: any) => s.clientId === paymentData.clientId);
                  if (clientSales.length === 0) return null;
                  return (
                    <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                        Ventas pendientes de este cliente ({clientSales.length})
                      </span>
                      {clientSales.map((s: any) => {
                        const bal = Number(s.totalAmount) - Number(s.paidAmount || 0);
                        return (
                          <div
                            key={s.id}
                            className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs flex items-center justify-between"
                          >
                            <div>
                              <div className="font-semibold text-slate-200">
                                {s.code || 'Venta'} · {s.quantity} aves
                              </div>
                              <div className="text-[11px] text-teal-400 font-bold">
                                ${bal.toFixed(2)} por cobrar
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  haptics.light();
                                  setSaleToCancel(s);
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-red-950/40 text-red-300 border border-red-800/40 text-[11px] font-bold active:opacity-70 flex items-center gap-1"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Cancelar</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  haptics.light();
                                  setPaymentData({ ...paymentData, amount: bal.toFixed(2) });
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-teal-500/20 text-teal-300 border border-teal-500/30 text-[11px] font-bold active:opacity-70"
                              >
                                Usar saldo
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase">
                    Monto Cobrado (USD $)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.1"
                    required
                    placeholder="0.00"
                    value={paymentData.amount}
                    onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
                    className="w-full px-3.5 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-teal-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="touch-active w-full py-4 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold rounded-xl text-sm shadow-lg flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>Registrar Cobro</span>
                </button>
              </form>
            )}

            {/* Form: COMPRA INSUMO */}
            {activeForm === 'purchase' && (
              <div className="py-6 text-center text-slate-400 text-xs">
                <p>Las compras de insumos pueden dictarse por el Asistente en el tab de Chat.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Rápido: Crear Nuevo Cliente */}
      {showQuickClientModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm p-5 shadow-2xl safe-bottom">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h3 className="text-base font-bold text-slate-100">Crear Nuevo Cliente</h3>
              <button
                type="button"
                onClick={() => setShowQuickClientModal(false)}
                className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateQuickClient} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase">
                  Nombre del Cliente *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Restaurante El Pollo Dorado"
                  value={quickClientName}
                  onChange={(e) => setQuickClientName(e.target.value)}
                  className="w-full px-3.5 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase">
                  Teléfono (Opcional)
                </label>
                <input
                  type="tel"
                  placeholder="04141234567"
                  value={quickClientPhone}
                  onChange={(e) => setQuickClientPhone(e.target.value)}
                  className="w-full px-3.5 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowQuickClientModal(false)}
                  className="flex-1 py-3 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingClient}
                  className="flex-1 py-3 bg-teal-500 hover:bg-teal-400 text-slate-950 rounded-xl text-xs font-bold"
                >
                  {creatingClient ? 'Creando...' : 'Crear y Asignar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirmar Cancelación de Venta */}
      {saleToCancel && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm p-5 shadow-2xl safe-bottom">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">Cancelar Venta</h3>
                <p className="text-xs text-slate-400">Reversión de operación</p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-950 border border-slate-800/80 rounded-2xl mb-4 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Cliente:</span>
                <span className="font-semibold text-slate-200">{saleToCancel.client?.name || 'Sin cliente'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Código:</span>
                <span className="font-mono text-slate-300">{saleToCancel.code || 'S/C'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Cantidad:</span>
                <span className="text-slate-200">{saleToCancel.quantity} aves ({saleToCancel.weightKg} kg)</span>
              </div>
              <div className="flex justify-between border-t border-slate-800/80 pt-1.5 mt-1.5">
                <span className="text-slate-400 font-medium">Saldo adeudado:</span>
                <span className="font-black text-red-400 text-sm">
                  ${(Number(saleToCancel.totalAmount) - Number(saleToCancel.paidAmount || 0)).toFixed(2)}
                </span>
              </div>
            </div>

            <p className="text-xs text-amber-300/90 bg-amber-950/30 border border-amber-800/40 p-2.5 rounded-xl mb-4 leading-relaxed">
              ⚠️ Al cancelar esta venta, las <strong>{saleToCancel.quantity} aves</strong> se devolverán automáticamente al lote y no tendrás que completarla ajuro.
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSaleToCancel(null)}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-colors"
              >
                No, volver
              </button>
              <button
                type="button"
                disabled={cancellingSale}
                onClick={handleConfirmCancelSale}
                className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition-colors shadow-lg shadow-red-950/50 flex items-center justify-center gap-1.5"
              >
                {cancellingSale ? 'Cancelando...' : 'Sí, Cancelar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

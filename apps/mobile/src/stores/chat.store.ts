import { create } from 'zustand';
import { parseUserMessage, type ParsedAssistantMessage } from '@/lib/assistant-parser';
import { haptics } from '@/lib/native';
import api from '@/api/client';
import { findBestMatch, rankByName } from '@cryotech/shared-types';

export type FlowType = 'sale' | 'daily_log' | 'payment' | 'processing' | 'expense';

export interface ButtonOption {
  id: string;
  label: string;
  value: unknown;
  key?: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  draft?: ParsedAssistantMessage;
  status?: 'pending' | 'confirmed' | 'cancelled';
  buttons?: ButtonOption[];
  showCategoryMenu?: boolean;
}

export interface ActiveFlow {
  type: FlowType;
  step: number;
  substep?: 'manual_weight' | 'new_client' | 'manual_amount' | 'manual_price';
  data: Record<string, unknown>;
}

interface ChatState {
  messages: ChatMessage[];
  isAiMode: boolean;
  isTyping: boolean;
  activeFlow: ActiveFlow | null;
  toggleAiMode: () => void;
  openMenu: () => void;
  startFlow: (type: FlowType) => Promise<void>;
  answerFlowStep: (key: string, value: unknown, label: string) => Promise<void>;
  cancelFlow: () => void;
  runQuickQuery: (query: 'bcv' | 'stock' | 'debtors' | 'summary') => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  confirmDraft: (messageId: string, customData?: Record<string, unknown>) => Promise<void>;
  cancelDraft: (messageId: string) => void;
  clearHistory: () => void;
}

/** Standard sale price in USD/kg — change here to update everywhere in the bot */
const DEFAULT_PRICE_PER_KG = 4.5;

// Fallbacks for offline operation
const FALLBACK_BATCH = { id: 'cc092a82-8693-4554-b14d-10e0afd9b774', code: 'LOT-2600046', breed: 'Cobb 500', currentQuantity: 19 };
const FALLBACK_CLIENTS = [
  { id: '6f87428f-7589-498c-8f96-2ce23a4115e4', name: 'Mercedes' },
  { id: 'c0a3ea1d-a09e-4a67-b5b6-7ca656f54c15', name: 'Abuela María' },
  { id: '3bdda28c-9d43-4081-bccb-0d32c361ffaa', name: 'William' },
  { id: '11111111-2222-3333-4444-555555555555', name: 'Rosa' },
  { id: 'bed95ece-982e-48b2-9db8-96daaa200972', name: 'Maria' },
  { id: '518caf9a-13f7-4be0-b9ed-dd7e065f769d', name: 'Tomas' },
  { id: '49851f13-f5b6-41f3-ab9e-8d7c700ddf52', name: 'Jean Paul' },
];

const NUMBER_WORDS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, doce: 12, quince: 15, veinte: 20,
};

async function getCachedOrFetch<T>(key: string, fetcher: () => Promise<T>, fallback: T): Promise<T> {
  try {
    const data = await fetcher();
    localStorage.setItem(`cryotech_cache_${key}`, JSON.stringify(data));
    return data;
  } catch {
    const cached = localStorage.getItem(`cryotech_cache_${key}`);
    if (cached) {
      try {
        return JSON.parse(cached) as T;
      } catch {}
    }
    return fallback;
  }
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [
    {
      id: 'welcome',
      sender: 'assistant',
      text: '¡Hola! Soy tu asistente de CryoTech.\n\nPuedes usar los botones organizados de abajo para cualquier proceso sin escribir, o ingresar datos con el teclado en cualquier momento.',
      timestamp: new Date().toISOString(),
      showCategoryMenu: true,
    },
  ],
  isAiMode: false,
  isTyping: false,
  activeFlow: null,

  toggleAiMode: () => {
    haptics.light();
    set((s) => ({ isAiMode: !s.isAiMode }));
  },

  clearHistory: () => {
    set({
      activeFlow: null,
      messages: [
        {
          id: 'welcome',
          sender: 'assistant',
          text: 'Conversación reiniciada. Selecciona una operación rápida o escribe tu consulta:',
          timestamp: new Date().toISOString(),
          showCategoryMenu: true,
        },
      ],
    });
  },

  openMenu: () => {
    haptics.light();
    set((s) => ({
      activeFlow: null,
      messages: [
        ...s.messages,
        {
          id: `${Date.now()}-bot-menu`,
          sender: 'assistant',
          text: '📋 Menú de Operaciones Rápidas:\nSelecciona una categoría:',
          timestamp: new Date().toISOString(),
          showCategoryMenu: true,
        },
      ],
    }));
  },

  cancelFlow: () => {
    haptics.light();
    set((s) => ({
      activeFlow: null,
      messages: [
        ...s.messages,
        {
          id: `${Date.now()}-cancelled`,
          sender: 'assistant',
          text: 'Operación cancelada. ¿Qué otra cosa deseas hacer?',
          timestamp: new Date().toISOString(),
          showCategoryMenu: true,
        },
      ],
    }));
  },

  runQuickQuery: async (query) => {
    await haptics.light();
    set({ isTyping: true });

    let botResponse = '';

    // Fetch current rate
    const rateData = await getCachedOrFetch<{ effectiveRate?: number }>(
      'rate',
      async () => (await api.get('/exchange-rates/current')).data,
      { effectiveRate: 853.50 }
    );
    const rate = Number(rateData.effectiveRate) || 853.50;

    if (query === 'bcv') {
      botResponse = `💵 **Tasa Oficial BCV Actual:** **${rate.toFixed(2)} Bs / USD**\n\nTodas las conversiones a bolívares (ventas, cobros, balances) se calculan con esta tasa oficial.`;
    } else if (query === 'stock') {
      try {
        const [batches, products] = await Promise.all([
          getCachedOrFetch<Array<{ id: string; code?: string; breed?: string; currentQuantity?: number; startDate?: string }>>(
            'batches',
            async () => (await api.get('/batches', { params: { status: 'breeding,for_sale' } })).data,
            [FALLBACK_BATCH]
          ),
          getCachedOrFetch<Array<{ id: string; name?: string; currentStock?: number }>>(
            'products',
            async () => (await api.get('/products')).data,
            [{ id: 'prod-dead-default', name: 'Pollo Beneficiado', currentStock: 23 }],
          ),
        ]);

        const totalLive = batches.reduce((sum, b) => sum + (b.currentQuantity || 0), 0);
        const deadProduct = products.find((p) => p.name?.toLowerCase().includes('beneficiado'));
        const totalDead = deadProduct ? Number(deadProduct.currentStock) || 0 : 0;

        const batchLines = batches
          .map((b) => `• Lote **${b.code || 'Lote'}** (${b.breed || 'Pollo'}): **${b.currentQuantity || 0} aves vivas**`)
          .join('\n');

        botResponse = `📊 **Balance de Inventario en Granja:**\n\n🐓 **Galpón (Aves vivas en corral):**\n${batchLines || '• No hay lotes activos.'}\n*Total vivos:* **${totalLive} aves**\n\n❄️ **Cava (Pollo Beneficiado listo para venta):**\n• Stock disponible en frío: **${totalDead} pollos**\n\n━━━━━━━━━━━━━━━━━━━━\n📦 **Total aves en granja:** **${totalLive + totalDead} aves**`;
      } catch {
        botResponse = '📊 **Inventario:**\n• Galpón: 34 aves vivas (LOT-2600046)\n• Cava: 87 pollos beneficiados.';
      }
    } else if (query === 'debtors') {
      try {
        const pendingSales = await getCachedOrFetch<
          Array<{
            id: string;
            code?: string;
            quantity: number;
            weightKg?: number;
            saleType?: string;
            client?: { name?: string };
            totalAmount: number;
            paidAmount: number;
          }>
        >(
          'pendingSales',
          async () => (await api.get('/sales', { params: { paymentStatus: 'pending,partial' } })).data,
          []
        );

        if (pendingSales.length === 0) {
          botResponse = '🎉 **¡Excelente! No hay clientes con cuentas pendientes ni deudas de pollos registradas.**';
        } else {
          // Group by client
          const byClient = new Map<
            string,
            { name: string; count: number; birds: number; kg: number; owedUsd: number }
          >();

          for (const s of pendingSales) {
            const clientName = s.client?.name || 'Cliente sin nombre';
            const owed = Number(s.totalAmount) - Number(s.paidAmount || 0);
            if (owed <= 0) continue;

            const existing = byClient.get(clientName) || {
              name: clientName,
              count: 0,
              birds: 0,
              kg: 0,
              owedUsd: 0,
            };
            existing.count += 1;
            existing.birds += s.quantity || 0;
            existing.kg += Number(s.weightKg) || 0;
            existing.owedUsd += owed;
            byClient.set(clientName, existing);
          }

          const clientList = Array.from(byClient.values()).sort((a, b) => b.owedUsd - a.owedUsd);
          const totalBirds = clientList.reduce((sum, c) => sum + c.birds, 0);
          const totalKg = clientList.reduce((sum, c) => sum + c.kg, 0);
          const totalOwedUsd = clientList.reduce((sum, c) => sum + c.owedUsd, 0);
          const totalOwedBs = totalOwedUsd * rate;

          const details = clientList
            .map((c) => {
              const bs = (c.owedUsd * rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              return `• **${c.name}**: ${c.birds} pollo(s) (${c.kg.toFixed(2)} kg) — Debe **$${c.owedUsd.toFixed(2)}** (~${bs} Bs)`;
            })
            .join('\n');

          botResponse = `📋 **Reporte de Clientes Deudores (Pollos por Cobrar):**\n\n${details}\n\n━━━━━━━━━━━━━━━━━━━━\n📊 **Total por cobrar:** **${totalBirds} pollos** | **${totalKg.toFixed(2)} kg**\n💰 **Monto Total Adeudado:** **$${totalOwedUsd.toFixed(2)}** (~${totalOwedBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs)`;
        }
      } catch {
        botResponse = '📋 *Cuentas por Cobrar:*\n• Error al consultar deudas.';
      }
    } else if (query === 'summary') {
      try {
        const todayStr = new Date().toISOString().split('T')[0];
        const [sales, dailyLogs] = await Promise.all([
          getCachedOrFetch<Array<{ quantity: number; weightKg?: number; totalAmount: number; totalAmountBs?: number; paymentStatus?: string; saleType?: string }>>(
            `today_sales_${todayStr}`,
            async () => (await api.get('/sales', { params: { fromDate: todayStr } })).data,
            []
          ),
          getCachedOrFetch<Array<{ mortality?: number; feedConsumedKg?: number }>>(
            `today_logs_${todayStr}`,
            async () => (await api.get('/daily-logs', { params: { fromDate: todayStr } })).data,
            []
          ),
        ]);

        const totalSold = sales.reduce((sum, s) => sum + (s.quantity || 0), 0);
        const totalKg = sales.reduce((sum, s) => sum + (Number(s.weightKg) || 0), 0);
        const totalUsd = sales.reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);
        const totalBs = sales.reduce((sum, s) => sum + (Number(s.totalAmountBs) || Number(s.totalAmount) * rate), 0);

        const paidSales = sales.filter((s) => s.paymentStatus === 'paid');
        const paidUsd = paidSales.reduce((sum, s) => sum + Number(s.totalAmount), 0);
        const creditUsd = totalUsd - paidUsd;

        const totalDeaths = dailyLogs.reduce((sum, l) => sum + (Number(l.mortality) || 0), 0);
        const totalFeed = dailyLogs.reduce((sum, l) => sum + (Number(l.feedConsumedKg) || 0), 0);

        botResponse = `📊 **Cierre y Resumen del Día (${new Date().toLocaleDateString('es-VE')}):**\n\n🍗 **Ventas Despachadas Hoy:**\n• Total pollos vendidos: **${totalSold} aves**\n• Peso total vendido: **${totalKg.toFixed(2)} kg**\n• Total facturado: **$${totalUsd.toFixed(2)}** (~${totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs)\n\n💰 **Cobranzas & Condición:**\n• Cobrado de contado: **$${paidUsd.toFixed(2)}**\n• A crédito / Fiado: **$${creditUsd.toFixed(2)}**\n\n🐓 **Granja & Galpones:**\n• Bajas / Mortalidad hoy: **${totalDeaths} aves**\n• Alimento consumido hoy: **${totalFeed} kg**`;
      } catch {
        botResponse = '📊 Resumen del día no disponible.';
      }
    }

    set((s) => ({
      isTyping: false,
      messages: [
        ...s.messages,
        {
          id: `${Date.now()}-query-result`,
          sender: 'assistant',
          text: botResponse,
          timestamp: new Date().toISOString(),
          buttons: [
            { id: 'menu', label: '⬅️ Volver al Menú', value: 'menu' },
            { id: 'sale', label: '🍗 Nueva Venta', value: 'sale', variant: 'primary' },
            { id: 'collect', label: '💰 Cobrar Cuenta', value: 'payment' },
          ],
        },
      ],
    }));
  },

  startFlow: async (type: FlowType) => {
    await haptics.light();
    set({ isTyping: true });

    let firstPrompt = '';
    let buttons: ButtonOption[] = [];

    if (type === 'sale') {
      firstPrompt = '🍗 **Nueva Venta de Pollo**\n\nPaso 1/6: ¿Qué tipo de ave vas a despachar?';
      buttons = [
        { id: 'live', label: '🐓 Pollo en Pie (Vivo)', value: 'live', key: 'saleType', variant: 'primary' },
        { id: 'dead', label: '❄️ Pollo Beneficiado (Cava)', value: 'dead', key: 'saleType', variant: 'primary' },
        { id: 'cancel', label: '❌ Cancelar', value: 'cancel', variant: 'danger' },
      ];
    } else if (type === 'daily_log') {
      const batches = await getCachedOrFetch<Array<{ id: string; code?: string; breed?: string; currentQuantity?: number }>>(
        'batches',
        async () => (await api.get('/batches', { params: { status: 'breeding,for_sale' } })).data,
        [FALLBACK_BATCH]
      );
      firstPrompt = '📋 **Registro Diario de Galpón**\n\nPaso 1/4: Selecciona el lote:';
      buttons = batches.map((b) => ({
        id: b.id,
        label: `Galpón (${b.code || 'Lote'} - ${b.currentQuantity || 0} aves)`,
        value: b.id,
        key: 'batchId',
        variant: 'primary',
      }));
      buttons.push({ id: 'cancel', label: '❌ Cancelar', value: 'cancel', variant: 'danger' });
    } else if (type === 'payment') {
      firstPrompt = '💰 **Registrar Cobranza**\n\nPaso 1/3: ¿A qué cliente se le recibe el pago?\n*(Mostrando clientes con deudas activas o escribe su nombre abajo)*';
      
      // Fetch debtors from pending sales to show who owes money
      const [allClients, pendingSales] = await Promise.all([
        getCachedOrFetch<Array<{ id: string; name: string }>>(
          'clients',
          async () => (await api.get('/clients', { params: { limit: 50 } })).data,
          FALLBACK_CLIENTS
        ),
        getCachedOrFetch<Array<{ clientId?: string; totalAmount: number; paidAmount: number }>>(
          'pendingSales',
          async () => (await api.get('/sales', { params: { paymentStatus: 'pending,partial' } })).data,
          []
        ),
      ]);

      const clientDebts = new Map<string, number>();
      for (const s of pendingSales) {
        if (!s.clientId) continue;
        const owed = Number(s.totalAmount) - Number(s.paidAmount || 0);
        if (owed > 0) {
          clientDebts.set(s.clientId, (clientDebts.get(s.clientId) || 0) + owed);
        }
      }

      // Sort clients with debt first
      const sortedClients = [...allClients].sort((a, b) => {
        const debtA = clientDebts.get(a.id) || 0;
        const debtB = clientDebts.get(b.id) || 0;
        return debtB - debtA;
      });

      buttons = sortedClients.slice(0, 8).map((c) => {
        const debt = clientDebts.get(c.id);
        const debtLabel = debt ? ` ($${debt.toFixed(2)})` : '';
        return {
          id: c.id,
          label: `${c.name}${debtLabel}`,
          value: c.id,
          key: 'clientId',
          variant: debt ? 'primary' : 'secondary',
        };
      });
      buttons.push({ id: 'cancel', label: '❌ Cancelar', value: 'cancel', variant: 'danger' });
    } else if (type === 'processing') {
      firstPrompt = '🔪 **Registrar Beneficio (Faenado a Cava)**\n\nPaso 1/3: ¿Cuántos pollos se beneficiaron hoy?';
      buttons = [
        { id: '2', label: '2 pollos', value: 2, key: 'quantity', variant: 'primary' },
        { id: '5', label: '5 pollos', value: 5, key: 'quantity', variant: 'primary' },
        { id: '10', label: '10 pollos', value: 10, key: 'quantity', variant: 'primary' },
        { id: '20', label: '20 pollos', value: 20, key: 'quantity', variant: 'primary' },
        { id: 'cancel', label: '❌ Cancelar', value: 'cancel', variant: 'danger' },
      ];
    } else if (type === 'expense') {
      firstPrompt = '💸 **Registrar Gasto Rápido**\n\nPaso 1/3: ¿Qué tipo de gasto realizaste?';
      buttons = [
        { id: 'feed', label: '🌾 Alimento / Insumo', value: 'feed', key: 'category', variant: 'primary' },
        { id: 'transport', label: '⛽ Gasoil / Transporte', value: 'transport', key: 'category', variant: 'primary' },
        { id: 'labor', label: '👷 Mano de Obra / Jornal', value: 'labor', key: 'category', variant: 'primary' },
        { id: 'utility', label: '💡 Servicios / Reparación', value: 'utility', key: 'category', variant: 'primary' },
        { id: 'cancel', label: '❌ Cancelar', value: 'cancel', variant: 'danger' },
      ];
    }

    set({
      isTyping: false,
      activeFlow: { type, step: 1, data: {} },
      messages: [
        ...get().messages,
        {
          id: `${Date.now()}-flow-start`,
          sender: 'assistant',
          text: firstPrompt,
          timestamp: new Date().toISOString(),
          buttons,
        },
      ],
    });
  },

  answerFlowStep: async (key: string, value: unknown, label: string) => {
    if (value === 'menu') {
      set({ activeFlow: null });
      get().openMenu();
      return;
    }

    if (value === 'cancel') {
      get().cancelFlow();
      return;
    }

    const { activeFlow } = get();

    // Special trigger: transitioning from debtor check to direct sale
    if (key === 'action' && String(value).startsWith('to_sale_')) {
      const clientId = String(value).replace('to_sale_', '');
      const clientName = (activeFlow?.data?.clientName as string) || label.replace('🍗 Registrar Venta a ', '').trim();
      await haptics.light();
      set({
        isTyping: false,
        activeFlow: {
          type: 'sale',
          step: 1,
          data: { clientId, clientName },
        },
        messages: [
          ...get().messages,
          {
            id: `${Date.now()}-user-reply`,
            sender: 'user',
            text: label,
            timestamp: new Date().toISOString(),
          },
          {
            id: `${Date.now()}-flow-start`,
            sender: 'assistant',
            text: `🍗 **Nueva Venta para ${clientName}**\n\nPaso 1/5: ¿Qué tipo de ave vas a despachar?`,
            timestamp: new Date().toISOString(),
            buttons: [
              { id: 'live', label: '🐓 Pollo en Pie (Vivo)', value: 'live', key: 'saleType', variant: 'primary' },
              { id: 'dead', label: '❄️ Pollo Beneficiado (Cava)', value: 'dead', key: 'saleType', variant: 'primary' },
              { id: 'cancel', label: '❌ Cancelar', value: 'cancel', variant: 'danger' },
            ],
          },
        ],
      });
      return;
    }

    if (!activeFlow) {
      if (value === 'sale' || value === 'daily_log' || value === 'payment' || value === 'processing' || value === 'expense') {
        get().startFlow(value as FlowType);
        return;
      }
      return;
    }

    // Special trigger: user wants to type weight manually
    if (key === 'weightKg' && value === 'manual') {
      await haptics.light();
      set((s) => ({
        activeFlow: s.activeFlow ? { ...s.activeFlow, substep: 'manual_weight' } : null,
        messages: [
          ...s.messages,
          {
            id: `${Date.now()}-user-reply`,
            sender: 'user',
            text: '✏️ Escribir peso manual',
            timestamp: new Date().toISOString(),
          },
          {
            id: `${Date.now()}-prompt-weight`,
            sender: 'assistant',
            text: '⚖️ **Escribe los kilos exactos en el campo de texto de abajo:**\n*(Por ejemplo: 2.35 o 4.80 y presiona Enviar)*',
            timestamp: new Date().toISOString(),
            buttons: [
              { id: 'cancel', label: '❌ Cancelar', value: 'cancel', variant: 'danger' },
            ],
          },
        ],
      }));
      return;
    }

    // Special trigger: user wants to create a new client
    if (key === 'clientId' && value === 'new_client') {
      await haptics.light();
      set((s) => ({
        activeFlow: s.activeFlow ? { ...s.activeFlow, substep: 'new_client' } : null,
        messages: [
          ...s.messages,
          {
            id: `${Date.now()}-user-reply`,
            sender: 'user',
            text: '➕ Nuevo Cliente',
            timestamp: new Date().toISOString(),
          },
          {
            id: `${Date.now()}-prompt-client`,
            sender: 'assistant',
            text: '👤 **Escribe el nombre del nuevo cliente en el teclado abajo:**\n*(Ejemplo: Pedro Pérez o Bodega Central y presiona Enviar)*',
            timestamp: new Date().toISOString(),
            buttons: [
              { id: 'cancel', label: '❌ Cancelar', value: 'cancel', variant: 'danger' },
            ],
          },
        ],
      }));
      return;
    }

    // Special trigger: user wants to type payment amount manually
    if (key === 'amount' && value === 'manual') {
      await haptics.light();
      set((s) => ({
        activeFlow: s.activeFlow ? { ...s.activeFlow, substep: 'manual_amount' } : null,
        messages: [
          ...s.messages,
          {
            id: `${Date.now()}-user-reply`,
            sender: 'user',
            text: '✏️ Escribir otro monto',
            timestamp: new Date().toISOString(),
          },
          {
            id: `${Date.now()}-prompt-amount`,
            sender: 'assistant',
            text: '💵 **Escribe el monto en el campo de texto de abajo:**\n*(Puedes escribir en dólares ej: 15.5 o en bolívares ej: 1500 bs)*',
            timestamp: new Date().toISOString(),
            buttons: [
              { id: 'cancel', label: '❌ Cancelar', value: 'cancel', variant: 'danger' },
            ],
          },
        ],
      }));
      return;
    }

    // Special trigger: user wants to type a custom price per kg
    if (key === 'pricePerKg' && value === 'manual_price') {
      await haptics.light();
      set((s) => ({
        activeFlow: s.activeFlow ? { ...s.activeFlow, substep: 'manual_price' } : null,
        messages: [
          ...s.messages,
          {
            id: `${Date.now()}-user-reply`,
            sender: 'user',
            text: '✏️ Escribir precio manual',
            timestamp: new Date().toISOString(),
          },
          {
            id: `${Date.now()}-prompt-price`,
            sender: 'assistant',
            text: `💲 **Escribe el precio por kg en el campo de texto de abajo:**\n*(Ejemplo: 4.50 o 5.00 — en dólares)*`,
            timestamp: new Date().toISOString(),
            buttons: [
              { id: 'cancel', label: '❌ Cancelar', value: 'cancel', variant: 'danger' },
            ],
          },
        ],
      }));
      return;
    }

    await haptics.light();

    // 1. Add user reply bubble
    const userMsg: ChatMessage = {
      id: `${Date.now()}-user-reply`,
      sender: 'user',
      text: label,
      timestamp: new Date().toISOString(),
    };

    const nextData = { ...activeFlow.data, [key]: value };
    if (key === 'clientId' && label) {
      nextData.clientName = label
        .replace(/^👤\s*/, '')
        .replace(/\s*\(Nuevo\)$/, '')
        .replace(/\s*\(\$[\d.]+\)$/, ''); // strip debt amount suffix from payment flow labels
    }
    const nextStep = activeFlow.step + 1;

    set((s) => ({
      messages: [...s.messages, userMsg],
      isTyping: true,
      activeFlow: { ...activeFlow, step: nextStep, substep: undefined, data: nextData },
    }));

    // Generate next step response
    setTimeout(async () => {
      let prompt = '';
      let buttons: ButtonOption[] = [];
      let draft: ParsedAssistantMessage | undefined;

      // Current rate
      const rateData = await getCachedOrFetch<{ effectiveRate?: number }>(
        'rate',
        async () => (await api.get('/exchange-rates/current')).data,
        { effectiveRate: 853.50 }
      );
      const rate = Number(rateData.effectiveRate) || 853.50;

      // === FLOW: SALE ===
      if (activeFlow.type === 'sale') {
        let currentStep = nextStep;
        if (currentStep === 3 && nextData.clientId) {
          currentStep = 4;
          set((s) => ({
            activeFlow: s.activeFlow ? { ...s.activeFlow, step: 4 } : null,
          }));
        }

        if (currentStep === 2) {
          // Choose Batch
          const batches = await getCachedOrFetch<Array<{ id: string; code?: string; breed?: string; currentQuantity?: number }>>(
            'batches',
            async () => (await api.get('/batches', { params: { status: 'breeding,for_sale' } })).data,
            [FALLBACK_BATCH]
          );
          prompt = 'Paso 2/6: Selecciona el lote de origen:';
          buttons = batches.map((b) => ({
            id: b.id,
            label: `Galpón (${b.code || 'Lote'} - ${b.currentQuantity || 0} aves)`,
            value: b.id,
            key: 'batchId',
            variant: 'primary',
          }));
        } else if (currentStep === 3) {
          // Choose Client
          const clients = await getCachedOrFetch<Array<{ id: string; name: string }>>(
            'clients',
            async () => (await api.get('/clients', { params: { limit: 30 } })).data,
            FALLBACK_CLIENTS
          );
          prompt = 'Paso 3/6: ¿A qué cliente se le entrega?\n\n• Selecciona un cliente, toca **➕ Nuevo Cliente**, o escribe su nombre abajo en el teclado:';
          buttons = clients.slice(0, 8).map((c) => ({
            id: c.id,
            label: c.name,
            value: c.id,
            key: 'clientId',
            variant: 'primary',
          }));
          buttons.push({ id: 'new_client', label: '➕ Nuevo Cliente', value: 'new_client', key: 'clientId', variant: 'secondary' });
        } else if (currentStep === 4) {
          // Choose Quantity
          prompt = `Paso 4/6: ¿Cuántas aves se entregan${nextData.clientName ? ` a **${nextData.clientName}**` : ''}?\n*(Puedes tocar un botón rápido o escribir el número abajo)*:`;
          buttons = [
            { id: '1', label: '1 ave', value: 1, key: 'quantity', variant: 'primary' },
            { id: '2', label: '2 aves', value: 2, key: 'quantity', variant: 'primary' },
            { id: '3', label: '3 aves', value: 3, key: 'quantity', variant: 'primary' },
            { id: '5', label: '5 aves', value: 5, key: 'quantity', variant: 'primary' },
            { id: '10', label: '10 aves', value: 10, key: 'quantity', variant: 'primary' },
            { id: '20', label: '20 aves', value: 20, key: 'quantity', variant: 'primary' },
          ];
        } else if (currentStep === 5) {
          // Choose Weight
          const qty = Number(nextData.quantity) || 1;
          const avgWeight = 2.4;
          const estimatedWeight = Number((qty * avgWeight).toFixed(2));
          prompt = `⚖️ **Paso 5/6: ¿Cuánto pesaron en total?**\n\n• Cantidad: **${qty} ave(s)** (~**${estimatedWeight} kg** estimado)\n• Toca un botón o **escribe los kilos exactos abajo en el teclado** (ej: 2.35 o 4.80):`;

          const quickWeightButtons: ButtonOption[] = [];
          if (qty === 1) {
            quickWeightButtons.push(
              { id: 'w1', label: '2.20 kg', value: 2.20, key: 'weightKg' },
              { id: 'w2', label: '🎯 2.40 kg (Sugerido)', value: 2.40, key: 'weightKg', variant: 'primary' },
              { id: 'w3', label: '2.60 kg', value: 2.60, key: 'weightKg' },
              { id: 'w4', label: '2.80 kg', value: 2.80, key: 'weightKg' }
            );
          } else if (qty === 2) {
            quickWeightButtons.push(
              { id: 'w1', label: '4.60 kg', value: 4.60, key: 'weightKg' },
              { id: 'w2', label: '🎯 4.80 kg (Sugerido)', value: 4.80, key: 'weightKg', variant: 'primary' },
              { id: 'w3', label: '5.00 kg', value: 5.00, key: 'weightKg' },
              { id: 'w4', label: '5.20 kg', value: 5.20, key: 'weightKg' }
            );
          } else {
            quickWeightButtons.push(
              { id: 'w1', label: `${(estimatedWeight - 0.5).toFixed(2)} kg`, value: Number((estimatedWeight - 0.5).toFixed(2)), key: 'weightKg' },
              { id: 'w2', label: `🎯 ${estimatedWeight} kg (Sugerido)`, value: estimatedWeight, key: 'weightKg', variant: 'primary' },
              { id: 'w3', label: `${(estimatedWeight + 0.5).toFixed(2)} kg`, value: Number((estimatedWeight + 0.5).toFixed(2)), key: 'weightKg' }
            );
          }
          quickWeightButtons.push({ id: 'manual', label: '✏️ Escribir peso manual', value: 'manual', key: 'weightKg', variant: 'secondary' });
          buttons = quickWeightButtons;
        } else if (currentStep === 6) {
          // Choose Price per kg
          prompt = `💲 **Paso 6/7: ¿A qué precio por kilo?**\n\nPrecio estándar: **$${DEFAULT_PRICE_PER_KG.toFixed(2)}/kg**\n*(Toca el estándar o escribe otro precio abajo en el teclado, ej: 5.00)*:`;
          buttons = [
            { id: 'std', label: `🎯 $${DEFAULT_PRICE_PER_KG.toFixed(2)}/kg (Estándar)`, value: DEFAULT_PRICE_PER_KG, key: 'pricePerKg', variant: 'primary' },
            { id: '4.00', label: '$4.00/kg', value: 4.0, key: 'pricePerKg' },
            { id: '4.25', label: '$4.25/kg', value: 4.25, key: 'pricePerKg' },
            { id: '5.00', label: '$5.00/kg', value: 5.0, key: 'pricePerKg' },
            { id: 'manual_price', label: '✏️ Escribir precio manual', value: 'manual_price', key: 'pricePerKg', variant: 'secondary' },
          ];
        } else if (currentStep === 7) {
          // Choose Payment Status
          prompt = 'Paso 7/7: ¿Cómo se cancela la venta?';
          buttons = [
            { id: 'paid', label: '💵 Pagado de Contado', value: 'paid', key: 'paymentStatus', variant: 'primary' },
            { id: 'pending', label: '⏳ Fiado / A Crédito', value: 'pending', key: 'paymentStatus', variant: 'secondary' },
          ];
        } else if (currentStep >= 8) {
          // Final Confirmation Draft
          const qty = Number(nextData.quantity) || 1;
          const weight = Number(nextData.weightKg) || Number((qty * 2.4).toFixed(2));
          const price = Number(nextData.pricePerKg) || DEFAULT_PRICE_PER_KG;
          const totalUsd = Number((weight * price).toFixed(2));
          const totalBs = Number((totalUsd * rate).toFixed(2));


          const isDead = nextData.saleType === 'dead';
          const clientName = (nextData.clientName as string) || 'Cliente';
          prompt = `📋 **Resumen de la Venta:**\n\n• Cliente: **${clientName}**\n• Tipo: **${isDead ? 'Pollo Beneficiado (Cava)' : 'Pollo en Pie (Vivo)'}**\n• Cantidad: **${qty} aves**\n• Peso Total: **${weight.toFixed(2)} kg**\n• Precio: **$${price.toFixed(2)}/kg**\n• Total a cobrar: **$${totalUsd.toFixed(2)}** (~${totalBs.toLocaleString('es-VE')} Bs)\n• Condición: **${nextData.paymentStatus === 'paid' ? 'Pagado de Contado' : 'Fiado (Crédito)'}**\n\n¿Deseas confirmar y guardar la venta?`;

          draft = {
            intent: 'sale',
            confidence: 1,
            summary: `Venta a ${clientName}: ${qty} pollos (${weight} kg) - Total $${totalUsd}`,
            data: {
              batchId: nextData.batchId,
              clientId: nextData.clientId,
              saleType: nextData.saleType,
              quantity: qty,
              weightKg: weight,
              pricePerKg: price,
              totalAmount: totalUsd,
              paymentStatus: nextData.paymentStatus || 'pending',
            },
            missingFields: [],
          };
          set({ activeFlow: null });
        }
      }

      // === FLOW: PAYMENT ===
      else if (activeFlow.type === 'payment') {
        if (nextStep === 2) {
          // Fetch pending sales for this specific client
          const clientId = nextData.clientId as string;
          const pendingSales = await getCachedOrFetch<
            Array<{
              id: string;
              code?: string;
              saleDate?: string;
              quantity: number;
              weightKg?: number;
              saleType?: string;
              totalAmount: number;
              paidAmount: number;
              client?: { name?: string };
            }>
          >(
            `client_pending_${clientId}`,
            async () => (await api.get('/sales', { params: { clientId, paymentStatus: 'pending,partial' } })).data,
            []
          );

          const clientName = (nextData.clientName as string) || pendingSales[0]?.client?.name || 'Cliente';
          const totalBalance = pendingSales.reduce((sum, s) => sum + (Number(s.totalAmount) - Number(s.paidAmount || 0)), 0);
          const totalBirds = pendingSales.reduce((sum, s) => sum + (s.quantity || 0), 0);
          const totalKg = pendingSales.reduce((sum, s) => sum + (Number(s.weightKg) || 0), 0);
          const totalBs = (totalBalance * rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

          if (pendingSales.length === 0) {
            prompt = `ℹ️ El cliente **${clientName}** no tiene deudas pendientes ni pollos por cobrar.\n\nSi le entregaste un pollo y te lo pagó al momento, puedes registrar la venta directamente:`;
            buttons = [
              { id: 'to_sale', label: `🍗 Registrar Venta a ${clientName}`, value: `to_sale_${clientId}`, key: 'action', variant: 'primary' },
              { id: 'menu', label: '⬅️ Volver al Menú', value: 'menu' },
            ];
          } else {
            const salesBreakdown = pendingSales
              .map((s) => {
                const bal = Number(s.totalAmount) - Number(s.paidAmount || 0);
                const bs = (bal * rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                const kind = s.saleType === 'dead' ? 'beneficiado' : 'en pie';
                const dateStr = s.saleDate ? new Date(s.saleDate).toLocaleDateString('es-VE') : '';
                return `• **${s.code || 'Venta'}** (${dateStr}): **${s.quantity} pollo(s) ${kind}** (${Number(s.weightKg || 0).toFixed(2)} kg) — Saldo: **$${bal.toFixed(2)}** (~${bs} Bs)`;
              })
              .join('\n');

            prompt = `📋 **Detalle de lo que debe ${clientName}:**\n\n${salesBreakdown}\n\n━━━━━━━━━━━━━━━━━━━━\n📊 **Total adeudado:** **${totalBirds} pollo(s)** | **${totalKg.toFixed(2)} kg**\n💰 **Saldo Total a Cobrar:** **$${totalBalance.toFixed(2)}** (~${totalBs} Bs)\n\n¿Cuánto abona o cancela hoy?`;

            // Smart buttons
            buttons = [
              { id: 'pay_all', label: `🎯 Cancelar Todo ($${totalBalance.toFixed(2)})`, value: totalBalance, key: 'amount', variant: 'primary' },
            ];

            // If multiple sales, offer individual sale payoff
            if (pendingSales.length > 1) {
              for (const s of pendingSales.slice(0, 2)) {
                const bal = Number(s.totalAmount) - Number(s.paidAmount || 0);
                buttons.push({
                  id: `pay_${s.id}`,
                  label: `Pagar ${s.code || 'Venta'} ($${bal.toFixed(2)})`,
                  value: bal,
                  key: 'amount',
                });
              }
            }

            buttons.push(
              { id: '10', label: '$10.00', value: 10, key: 'amount' },
              { id: '20', label: '$20.00', value: 20, key: 'amount' },
              { id: 'manual', label: '✏️ Escribir otro monto', value: 'manual', key: 'amount', variant: 'secondary' }
            );
          }
        } else if (nextStep >= 3) {
          const amt = Number(nextData.amount) || 10;
          const amtBs = (amt * rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          const clientName = (nextData.clientName as string) || 'Cliente';

          prompt = `📋 **Resumen de Cobranza:**\n\n• Cliente: **${clientName}**\n• Monto recibido: **$${amt.toFixed(2)}** (~${amtBs} Bs)\n• Se aplicará automáticamente a los pollos adeudados del cliente.\n\n¿Deseas confirmar el cobro?`;

          draft = {
            intent: 'payment',
            confidence: 1,
            summary: `Cobro de $${amt.toFixed(2)} (~${amtBs} Bs) a ${clientName}`,
            data: {
              clientId: nextData.clientId,
              amount: amt,
              paymentDate: new Date().toISOString().split('T')[0],
            },
            missingFields: [],
          };
          set({ activeFlow: null });
        }
      }

      // === FLOW: DAILY LOG ===
      else if (activeFlow.type === 'daily_log') {
        if (nextStep === 2) {
          prompt = 'Paso 2/4: ¿Cuántas bajas o muertes hubo hoy?';
          buttons = [
            { id: '0', label: '0 bajas (Ninguna)', value: 0, key: 'mortality', variant: 'primary' },
            { id: '1', label: '1 baja', value: 1, key: 'mortality', variant: 'primary' },
            { id: '2', label: '2 bajas', value: 2, key: 'mortality', variant: 'primary' },
            { id: '3', label: '3 bajas', value: 3, key: 'mortality', variant: 'primary' },
          ];
        } else if (nextStep === 3) {
          prompt = 'Paso 3/4: ¿Cuánto alimento consumieron hoy?';
          buttons = [
            { id: '0', label: '0 kg', value: 0, key: 'feedConsumedKg' },
            { id: '25', label: '25 kg (1/2 saco)', value: 25, key: 'feedConsumedKg', variant: 'primary' },
            { id: '50', label: '50 kg (1 saco)', value: 50, key: 'feedConsumedKg', variant: 'primary' },
            { id: '70', label: '70 kg', value: 70, key: 'feedConsumedKg', variant: 'primary' },
          ];
        } else if (nextStep === 4) {
          prompt = 'Paso 4/4: ¿Se realizó pesaje de muestreo?';
          buttons = [
            { id: 'skip', label: '⏭️ Omitir / Sin pesaje', value: null, key: 'averageWeightG', variant: 'secondary' },
            { id: '2200', label: '2.2 kg (2200g)', value: 2200, key: 'averageWeightG', variant: 'primary' },
            { id: '2400', label: '2.4 kg (2400g)', value: 2400, key: 'averageWeightG', variant: 'primary' },
            { id: '2600', label: '2.6 kg (2600g)', value: 2600, key: 'averageWeightG', variant: 'primary' },
          ];
        } else if (nextStep >= 5) {
          const mort = Number(nextData.mortality) || 0;
          const feed = Number(nextData.feedConsumedKg) || 0;
          const weightG = nextData.averageWeightG ? Number(nextData.averageWeightG) : undefined;

          prompt = `📋 **Resumen de Registro Diario:**\n\n• Bajas / Mortalidad: **${mort} aves**\n• Consumo de Alimento: **${feed} kg**\n• Peso promedio: **${weightG ? `${(weightG / 1000).toFixed(2)} kg` : 'No registrado'}**\n• Fecha: **Hoy**\n\n¿Confirmas para registrar el día?`;

          draft = {
            intent: 'daily_log',
            confidence: 1,
            summary: `${mort} bajas, ${feed} kg alimento`,
            data: {
              batchId: nextData.batchId,
              logDate: new Date().toISOString().split('T')[0],
              mortality: mort,
              feedConsumedKg: feed,
              averageWeightG: weightG,
            },
            missingFields: [],
          };
          set({ activeFlow: null });
        }
      }

      // === FLOW: PROCESSING ===
      else if (activeFlow.type === 'processing') {
        const qty = Number(nextData.quantity) || 5;
        prompt = `📋 **Resumen de Beneficio:**\n\n• Se faenarán **${qty} pollos** del galpón.\n• Serán ingresados automáticamente a la **Cava Refrigerada** como producto listo para la venta.\n\n¿Deseas confirmar el beneficio?`;
        draft = {
          intent: 'processing',
          confidence: 1,
          summary: `Beneficio de ${qty} pollos a cava`,
          data: {
            quantity: qty,
            processingDate: new Date().toISOString().split('T')[0],
          },
          missingFields: [],
        };
        set({ activeFlow: null });
      }

      // === FLOW: EXPENSE ===
      else if (activeFlow.type === 'expense') {
        if (nextStep === 2) {
          prompt = 'Paso 2/3: ¿Cuánto se pagó por el gasto?';
          buttons = [
            { id: '5', label: '$5.00', value: 5, key: 'amount', variant: 'primary' },
            { id: '10', label: '$10.00', value: 10, key: 'amount', variant: 'primary' },
            { id: '20', label: '$20.00', value: 20, key: 'amount', variant: 'primary' },
            { id: '50', label: '$50.00', value: 50, key: 'amount', variant: 'primary' },
          ];
        } else if (nextStep >= 3) {
          const amt = Number(nextData.amount) || 10;
          prompt = `📋 **Resumen del Gasto:**\n\n• Categoría: **${nextData.category}**\n• Monto: **$${amt.toFixed(2)}** (~${(amt * rate).toFixed(2)} Bs)\n\n¿Confirmas el registro del gasto?`;
          draft = {
            intent: 'expense',
            confidence: 1,
            summary: `Gasto de $${amt.toFixed(2)} (${nextData.category})`,
            data: {
              category: nextData.category,
              amount: amt,
              expenseDate: new Date().toISOString().split('T')[0],
            },
            missingFields: [],
          };
          set({ activeFlow: null });
        }
      }

      // Append cancellation option if still inside flow
      if (!draft && buttons.length > 0) {
        buttons.push({ id: 'cancel', label: '❌ Cancelar', value: 'cancel', variant: 'danger' });
      }

      const botReply: ChatMessage = {
        id: `${Date.now()}-flow-step`,
        sender: 'assistant',
        text: prompt,
        timestamp: new Date().toISOString(),
        buttons: buttons.length > 0 ? buttons : undefined,
        draft,
      };

      set((s) => ({
        isTyping: false,
        messages: [...s.messages, botReply],
      }));
      await haptics.medium();
    }, 200);
  },

  sendMessage: async (text: string) => {
    const cleanText = text.trim();
    if (!cleanText) return;

    const userMsg: ChatMessage = {
      id: `${Date.now()}-user`,
      sender: 'user',
      text: cleanText,
      timestamp: new Date().toISOString(),
    };

    set((s) => ({ messages: [...s.messages, userMsg], isTyping: true }));
    await haptics.light();

    const lower = cleanText.toLowerCase();

    // Check cancellation
    if (lower === 'cancelar' || lower === 'salir') {
      set({ isTyping: false });
      get().cancelFlow();
      return;
    }

    // Check shortcuts
    if (lower === 'menu' || lower === 'inicio' || lower === 'ayuda' || lower === 'opciones') {
      set({ isTyping: false });
      get().openMenu();
      return;
    }
    if (lower.includes('bcv') || lower.includes('tasa') || lower.includes('dolar')) {
      set({ isTyping: false });
      await get().runQuickQuery('bcv');
      return;
    }
    if (lower.includes('stock') || lower.includes('cava') || lower.includes('cuantos pollos')) {
      set({ isTyping: false });
      await get().runQuickQuery('stock');
      return;
    }
    if (lower.includes('deuda') || lower.includes('deudores') || lower.includes('quien debe')) {
      set({ isTyping: false });
      await get().runQuickQuery('debtors');
      return;
    }
    if (lower.includes('cierre') || lower === 'resumen' || lower.includes('resumen del dia') || lower.includes('resumen hoy')) {
      set({ isTyping: false });
      await get().runQuickQuery('summary');
      return;
    }

    // === INTERCEPT ACTIVE FLOW TYPING ===
    const { activeFlow } = get();
    if (activeFlow) {
      // 1. PAYMENT FLOW: Step 1 (Client selection by typing)
      if (activeFlow.type === 'payment' && activeFlow.step === 1) {
        const clients = await getCachedOrFetch<Array<{ id: string; name: string }>>(
          'clients',
          async () => (await api.get('/clients', { params: { limit: 100 } })).data,
          FALLBACK_CLIENTS
        );
        const match = findBestMatch(cleanText, clients, (c) => c.name, 0.50);
        if (match?.best) {
          set({ isTyping: false });
          await get().answerFlowStep('clientId', match.best.id, `👤 ${match.best.name}`);
          return;
        } else {
          const top3 = rankByName(cleanText, clients, (c) => c.name).slice(0, 3);
          const suggestButtons: ButtonOption[] = top3.map((r) => ({
            id: r.item.id,
            label: `👤 ${r.item.name}`,
            value: r.item.id,
            key: 'clientId',
            variant: 'primary',
          }));
          suggestButtons.push({ id: 'cancel', label: '❌ Cancelar', value: 'cancel', variant: 'danger' });
          set((s) => ({
            isTyping: false,
            messages: [
              ...s.messages,
              {
                id: `${Date.now()}-no-client-match`,
                sender: 'assistant',
                text: `🔍 No encontré un cliente exacto llamado **"${cleanText}"**.\n\n¿Te referías a alguno de estos? Puedes tocarlo o escribir otro nombre:`,
                timestamp: new Date().toISOString(),
                buttons: suggestButtons,
              },
            ],
          }));
          return;
        }
      }

      // 2. SALE FLOW: Step 1 (Sale type by typing: live or dead)
      if (activeFlow.type === 'sale' && activeFlow.step === 1) {
        if (/vivo|pie/i.test(lower)) {
          set({ isTyping: false });
          await get().answerFlowStep('saleType', 'live', '🐓 Pollo en Pie (Vivo)');
          return;
        }
        if (/beneficiado|cava|muerto|faenado|frio|frío/i.test(lower)) {
          set({ isTyping: false });
          await get().answerFlowStep('saleType', 'dead', '❄️ Pollo Beneficiado (Cava)');
          return;
        }
      }

      // 3. SALE FLOW: Step 2 (Batch selection by typing)
      if (activeFlow.type === 'sale' && activeFlow.step === 2) {
        const batches = await getCachedOrFetch<Array<{ id: string; code?: string; breed?: string; currentQuantity?: number }>>(
          'batches',
          async () => (await api.get('/batches', { params: { status: 'breeding,for_sale' } })).data,
          [FALLBACK_BATCH]
        );
        const match = batches.find(
          (b) =>
            (b.code && lower.includes(b.code.toLowerCase())) ||
            (b.breed && lower.includes(b.breed.toLowerCase()))
        );
        const chosen = match || batches[0];
        if (chosen) {
          set({ isTyping: false });
          await get().answerFlowStep('batchId', chosen.id, `Galpón (${chosen.code || 'Lote'})`);
          return;
        }
      }

      // 4. SALE FLOW: Step 3 (Client selection by typing - with fuzzy search & generic client support)
      if (activeFlow.type === 'sale' && activeFlow.step === 3) {
        if (/general|mostrador|anonimo|anónimo|ninguno|nadie|sin nombre/i.test(lower)) {
          set({ isTyping: false });
          await get().answerFlowStep('clientId', undefined, '👤 Cliente Mostrador');
          return;
        }
        const clients = await getCachedOrFetch<Array<{ id: string; name: string }>>(
          'clients',
          async () => (await api.get('/clients', { params: { limit: 100 } })).data,
          FALLBACK_CLIENTS
        );
        const match = findBestMatch(cleanText, clients, (c) => c.name, 0.55);
        if (match?.best) {
          set({ isTyping: false });
          await get().answerFlowStep('clientId', match.best.id, `👤 ${match.best.name}`);
          return;
        } else {
          // Create new client directly
          try {
            const res = await api.post('/clients', { name: cleanText });
            localStorage.removeItem('cryotech_cache_clients');
            set({ isTyping: false });
            await get().answerFlowStep('clientId', res.data.id, `👤 ${res.data.name} (Nuevo)`);
          } catch {
            const tempId = `temp-${Date.now()}`;
            set({ isTyping: false });
            await get().answerFlowStep('clientId', tempId, `👤 ${cleanText} (Nuevo)`);
          }
          return;
        }
      }

      // 5. SALE FLOW: Step 4 (Quantity input: digits or words)
      if (activeFlow.type === 'sale' && activeFlow.step === 4) {
        let qty: number | undefined;
        const qtyMatch = cleanText.match(/\d+/);
        if (qtyMatch) {
          qty = parseInt(qtyMatch[0], 10);
        } else {
          const firstWord = lower.split(/\s+/)[0];
          if (NUMBER_WORDS[firstWord]) qty = NUMBER_WORDS[firstWord];
        }
        if (qty && qty > 0 && qty < 1000) {
          set({ isTyping: false });
          await get().answerFlowStep('quantity', qty, `${qty} aves`);
          return;
        }
      }

      // 6. Manual Weight input (or Sale Step 5)
      if (activeFlow.substep === 'manual_weight' || (activeFlow.type === 'sale' && activeFlow.step === 5)) {
        const weightMatch = cleanText.replace(',', '.').match(/(\d+(\.\d+)?)/);
        if (weightMatch) {
          const weight = parseFloat(weightMatch[1]);
          if (weight > 0 && weight < 500) {
            set({ isTyping: false });
            await get().answerFlowStep('weightKg', weight, `⚖️ ${weight} kg`);
            return;
          }
        }
      }

      // 7. Manual Price input (or Sale Step 6)
      if (activeFlow.substep === 'manual_price' || (activeFlow.type === 'sale' && activeFlow.step === 6)) {
        const priceMatch = cleanText.replace(',', '.').match(/(\d+(\.\d+)?)/);
        if (priceMatch) {
          const price = parseFloat(priceMatch[1]);
          if (price > 0 && price < 100) {
            set({ isTyping: false });
            await get().answerFlowStep('pricePerKg', price, `$${price.toFixed(2)}/kg`);
            return;
          }
        }
      }

      // 8. SALE FLOW: Step 7 (Payment condition)
      if (activeFlow.type === 'sale' && activeFlow.step === 7) {
        if (/contado|pagado|pago|ya|efectivo|transferencia/i.test(lower)) {
          set({ isTyping: false });
          await get().answerFlowStep('paymentStatus', 'paid', '💵 Pagado de Contado');
          return;
        }
        if (/fiado|credito|crédito|debe|despues|después|anotado/i.test(lower)) {
          set({ isTyping: false });
          await get().answerFlowStep('paymentStatus', 'pending', '⏳ Fiado / A Crédito');
          return;
        }
      }

      // 9. New Client Name input (explicit substep)
      if (activeFlow.substep === 'new_client') {
        try {
          const res = await api.post('/clients', { name: cleanText });
          const newClient = res.data;
          localStorage.removeItem('cryotech_cache_clients');
          set({ isTyping: false });
          await get().answerFlowStep('clientId', newClient.id, `👤 ${newClient.name} (Nuevo)`);
        } catch {
          const tempId = `temp-${Date.now()}`;
          set({ isTyping: false });
          await get().answerFlowStep('clientId', tempId, `👤 ${cleanText} (Nuevo)`);
        }
        return;
      }

      // 10. Payment amount input (or Payment Step 2)
      if (activeFlow.substep === 'manual_amount' || (activeFlow.type === 'payment' && activeFlow.step === 2)) {
        const amtMatch = cleanText.replace(',', '.').match(/(\d+(\.\d+)?)/);
        if (amtMatch) {
          let amt = parseFloat(amtMatch[1]);
          const isBs = lower.includes('bs') || lower.includes('bolivar');
          if (isBs) {
            const rateData = await getCachedOrFetch<{ effectiveRate?: number }>(
              'rate',
              async () => (await api.get('/exchange-rates/current')).data,
              { effectiveRate: 853.50 }
            );
            const rate = Number(rateData.effectiveRate) || 853.50;
            amt = Number((amt / rate).toFixed(2));
          }
          if (amt > 0) {
            set({ isTyping: false });
            await get().answerFlowStep('amount', amt, `$${amt.toFixed(2)}`);
            return;
          }
        }
      }

      // 11. DAILY LOG: Step 2 (Mortality)
      if (activeFlow.type === 'daily_log' && activeFlow.step === 2) {
        if (/cero|ningun|ninguno|ninguna|sin bajas/i.test(lower)) {
          set({ isTyping: false });
          await get().answerFlowStep('mortality', 0, '0 bajas (Ninguna)');
          return;
        }
        const mortMatch = cleanText.match(/\d+/);
        if (mortMatch) {
          const mort = parseInt(mortMatch[0], 10);
          set({ isTyping: false });
          await get().answerFlowStep('mortality', mort, `${mort} baja(s)`);
          return;
        }
      }

      // 12. DAILY LOG: Step 3 (Feed consumption)
      if (activeFlow.type === 'daily_log' && activeFlow.step === 3) {
        let feed = -1;
        if (/medio saco/i.test(lower)) {
          feed = 25;
        } else if (/saco/i.test(lower)) {
          feed = 50;
        } else {
          const feedMatch = cleanText.replace(',', '.').match(/(\d+(\.\d+)?)/);
          if (feedMatch) feed = parseFloat(feedMatch[1]);
        }
        if (feed >= 0) {
          set({ isTyping: false });
          await get().answerFlowStep('feedConsumedKg', feed, `${feed} kg`);
          return;
        }
      }

      // 13. DAILY LOG: Step 4 (Average Weight)
      if (activeFlow.type === 'daily_log' && activeFlow.step === 4) {
        if (/omitir|saltar|sin pesaje|no|ninguno/i.test(lower)) {
          set({ isTyping: false });
          await get().answerFlowStep('averageWeightG', null, '⏭️ Sin pesaje');
          return;
        }
        const weightMatch = cleanText.replace(',', '.').match(/(\d+(\.\d+)?)/);
        if (weightMatch) {
          let val = parseFloat(weightMatch[1]);
          if (val > 0 && val < 20) {
            val = Math.round(val * 1000); // 2.4 kg -> 2400 g
          }
          set({ isTyping: false });
          await get().answerFlowStep('averageWeightG', val, `${(val / 1000).toFixed(2)} kg (${val}g)`);
          return;
        }
      }

      // 14. PROCESSING FLOW: Step 1 (Quantity)
      if (activeFlow.type === 'processing' && activeFlow.step === 1) {
        let qty: number | undefined;
        const qtyMatch = cleanText.match(/\d+/);
        if (qtyMatch) {
          qty = parseInt(qtyMatch[0], 10);
        } else {
          const firstWord = lower.split(/\s+/)[0];
          if (NUMBER_WORDS[firstWord]) qty = NUMBER_WORDS[firstWord];
        }
        if (qty && qty > 0) {
          set({ isTyping: false });
          await get().answerFlowStep('quantity', qty, `${qty} pollos`);
          return;
        }
      }

      // 15. EXPENSE FLOW: Step 1 (Category)
      if (activeFlow.type === 'expense' && activeFlow.step === 1) {
        let cat = 'other';
        let catLabel = 'Otros gastos';
        if (/alimento|comida|insumo|saco/i.test(lower)) {
          cat = 'feed';
          catLabel = '🌾 Alimento / Insumo';
        } else if (/gasoil|gasolina|transporte|flete|viaje/i.test(lower)) {
          cat = 'transport';
          catLabel = '⛽ Gasoil / Transporte';
        } else if (/mano de obra|jornal|trabajador|obrero|pago/i.test(lower)) {
          cat = 'labor';
          catLabel = '👷 Mano de Obra / Jornal';
        } else if (/luz|agua|servicio|reparacion|mantenimiento/i.test(lower)) {
          cat = 'utility';
          catLabel = '💡 Servicios / Reparación';
        }
        set({ isTyping: false });
        await get().answerFlowStep('category', cat, catLabel);
        return;
      }

      // 16. EXPENSE FLOW: Step 2 (Amount)
      if (activeFlow.type === 'expense' && activeFlow.step === 2) {
        const amtMatch = cleanText.replace(',', '.').match(/(\d+(\.\d+)?)/);
        if (amtMatch) {
          const amt = parseFloat(amtMatch[1]);
          if (amt > 0) {
            set({ isTyping: false });
            await get().answerFlowStep('amount', amt, `$${amt.toFixed(2)}`);
            return;
          }
        }
      }
    }

    const { isAiMode } = get();

    if (isAiMode) {
      try {
        const res = await api.post('/assistant/mobile/message', { text: cleanText });
        const reply: ChatMessage = {
          id: `${Date.now()}-bot`,
          sender: 'assistant',
          text: res.data.message || 'He procesado tu instrucción.',
          timestamp: new Date().toISOString(),
          buttons: res.data.buttons?.map((b: { id: string; label: string }) => ({
            id: b.id,
            label: b.label,
            value: b.id,
          })),
        };
        set((s) => ({ messages: [...s.messages, reply], isTyping: false }));
        await haptics.medium();
        return;
      } catch {
        // Fallback to local offline mode
      }
    }

    // Local / Offline rule parsing
    setTimeout(async () => {
      const parsed = parseUserMessage(cleanText);
      let replyText = '';

      if (parsed.intent === 'daily_log') {
        replyText = `He preparado el registro diario con: ${parsed.summary}. ¿Confirmas para guardar?`;
      } else if (parsed.intent === 'sale') {
        replyText = `He detectado una venta de ${parsed.data.quantity || '?'} aves por ${parsed.data.weightKg || '?'}kg. ¿Confirmas para registrarla?`;
      } else if (parsed.intent === 'payment') {
        replyText = `He detectado un cobro de ${parsed.data.amount ? `$${parsed.data.amount}` : `${parsed.data.amountBs} Bs`}. ¿Deseas aplicarlo?`;
      } else {
        replyText =
          'No pude reconocer una operación exacta por texto. Puedes usar los botones organizados de abajo para cualquier proceso:';
      }

      const reply: ChatMessage = {
        id: `${Date.now()}-bot`,
        sender: 'assistant',
        text: replyText,
        timestamp: new Date().toISOString(),
        draft: parsed.intent !== 'unknown' ? parsed : undefined,
        showCategoryMenu: parsed.intent === 'unknown',
      };

      set((s) => ({ messages: [...s.messages, reply], isTyping: false }));
      await haptics.medium();
    }, 250);
  },

  confirmDraft: async (messageId: string, customData?: Record<string, unknown>) => {
    const { messages } = get();
    const msg = messages.find((m) => m.id === messageId);
    if (!msg || !msg.draft) return;

    const data: Record<string, any> = { ...msg.draft.data, ...customData };
    const { enqueue } = (await import('./sync.store')).useSyncStore.getState();

    try {
      if (msg.draft.intent === 'daily_log') {
        if (!data.batchId) {
          const batches = await getCachedOrFetch<Array<{ id: string }>>(
            'batches',
            async () => (await api.get('/batches', { params: { status: 'breeding,for_sale' } })).data,
            [FALLBACK_BATCH]
          );
          data.batchId = batches[0]?.id || FALLBACK_BATCH.id;
        }
        if (!data.logDate) {
          data.logDate = new Date().toISOString().split('T')[0];
        }
        if (data.mortality === undefined) data.mortality = 0;
        if (data.feedConsumedKg === undefined) data.feedConsumedKg = 0;

        await enqueue({
          type: 'daily_log',
          title: `Registro diario: ${msg.draft.summary}`,
          url: '/daily-logs',
          method: 'POST',
          payload: data,
        });
      } else if (msg.draft.intent === 'sale') {
        if (!data.batchId) {
          const batches = await getCachedOrFetch<Array<{ id: string }>>(
            'batches',
            async () => (await api.get('/batches', { params: { status: 'breeding,for_sale' } })).data,
            [FALLBACK_BATCH]
          );
          data.batchId = batches[0]?.id || FALLBACK_BATCH.id;
        }
        if (!data.saleType) {
          data.saleType = 'dead';
        }
        data.quantity = Number(data.quantity) || 1;
        data.weightKg = Number(data.weightKg) || Number((data.quantity * 2.4).toFixed(2));
        data.pricePerKg = Number(data.pricePerKg) || DEFAULT_PRICE_PER_KG;
        if (!data.totalAmount || Number(data.totalAmount) <= 0) {
          data.totalAmount = Number((data.weightKg * data.pricePerKg).toFixed(2));
        }
        if (!data.clientId && data.clientName) {
          const clients = await getCachedOrFetch<Array<{ id: string; name: string }>>(
            'clients',
            async () => (await api.get('/clients', { params: { limit: 100 } })).data,
            FALLBACK_CLIENTS
          );
          const match = findBestMatch(String(data.clientName), clients, (c) => c.name, 0.55);
          if (match?.best) {
            data.clientId = match.best.id;
          }
        }
        if (!data.clientId) {
          delete data.clientId;
        }
        if (!data.paymentStatus) {
          data.paymentStatus = 'pending';
        }

        await enqueue({
          type: 'sale',
          title: `Venta: ${data.quantity} aves (${data.weightKg} kg) - $${data.totalAmount}`,
          url: '/sales',
          method: 'POST',
          payload: data,
        });
      } else if (msg.draft.intent === 'payment') {
        if (!data.clientId && data.clientName) {
          const clients = await getCachedOrFetch<Array<{ id: string; name: string }>>(
            'clients',
            async () => (await api.get('/clients', { params: { limit: 100 } })).data,
            FALLBACK_CLIENTS
          );
          const match = findBestMatch(String(data.clientName), clients, (c) => c.name, 0.55);
          if (match?.best) {
            data.clientId = match.best.id;
          }
        }
        const amt = Number(data.amount) || (data.amountBs ? Number((Number(data.amountBs) / 853.5).toFixed(2)) : 10);
        data.amount = amt;
        if (!data.paymentDate) {
          data.paymentDate = new Date().toISOString().split('T')[0];
        }

        await enqueue({
          type: 'payment',
          title: `Cobro: $${amt.toFixed(2)}`,
          url: '/sales/payment',
          method: 'POST',
          payload: data,
        });
      } else if (msg.draft.intent === 'processing') {
        if (!data.batchId) {
          const batches = await getCachedOrFetch<Array<{ id: string }>>(
            'batches',
            async () => (await api.get('/batches', { params: { status: 'breeding,for_sale' } })).data,
            [FALLBACK_BATCH]
          );
          data.batchId = batches[0]?.id || FALLBACK_BATCH.id;
        }
        data.quantity = Number(data.quantity) || 1;
        if (!data.processingDate) {
          data.processingDate = new Date().toISOString().split('T')[0];
        }

        await enqueue({
          type: 'daily_log',
          title: `Beneficio: ${data.quantity} aves a cava`,
          url: '/processing',
          method: 'POST',
          payload: data,
        });
      }

      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === messageId ? { ...m, status: 'confirmed' } : m
        ),
      }));

      // Send bot acknowledgment
      set((s) => ({
        messages: [
          ...s.messages,
          {
            id: `${Date.now()}-success`,
            sender: 'assistant',
            text: '✅ ¡Operación guardada exitosamente en el sistema!\n\n¿Deseas registrar otra operación?',
            timestamp: new Date().toISOString(),
            showCategoryMenu: true,
          },
        ],
      }));

      await haptics.success();
    } catch {
      await haptics.error();
    }
  },

  cancelDraft: (messageId: string) => {
    haptics.light();
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId ? { ...m, status: 'cancelled' } : m
      ),
    }));
  },
}));

import React, { useState } from 'react';
import {
  Smartphone,
  Home,
  MessageSquare,
  PlusCircle,
  BarChart3,
  Menu,
  Building2,
  ChevronDown,
  Sparkles,
  Skull,
  Wheat,
  Bird,
  DollarSign,
  Calendar,
  TrendingUp,
  ShoppingCart,
  WifiOff,
  RefreshCw,
  Check,
  CheckCircle2,
  ArrowRight,
  Download,
  ChevronRight,
} from 'lucide-react';

interface MobileShowcaseProps {
  onOpenWaitlist: () => void;
}

type MobileTab = 'home' | 'register' | 'chat' | 'reports' | 'offline';

export const MobileShowcase: React.FC<MobileShowcaseProps> = ({ onOpenWaitlist }) => {
  const [activeTab, setActiveTab] = useState<MobileTab>('home');

  const tabDetails: Record<
    MobileTab,
    {
      label: string;
      title: string;
      badge: string;
      description: string;
      highlights: string[];
    }
  > = {
    home: {
      label: 'Tablero de Granja',
      title: 'Monitoreo diario de la parvada en tiempo real',
      badge: 'Pantalla de Inicio',
      description:
        'Visualiza el estado general de tus galpones al instante: bajas del día, consumo de alimento acumulado, aves vivas en corral y cobranzas registradas hoy.',
      highlights: [
        'KPIs inmediatos de mortalidad, consumo en kg y población activa',
        'Seguimiento visual del lote con barra de porcentaje de supervivencia',
        'Acceso directo en 1 toque al asistente inteligente y a los galpones activos',
      ],
    },
    register: {
      label: 'Hub de Registros',
      title: 'Operaciones de campo en segundos',
      badge: 'Centro de Operaciones',
      description:
        'Diseñado para la faena diaria: formularios ágiles para asentar el registro diario de bajas y alimento, ventas de aves vivas o beneficiadas, compras de insumos y cobranzas.',
      highlights: [
        'Registro Diario: Bajas, consumo de sacos y pesaje muestral de aves',
        'Venta de Pollos: Contado o a crédito con búsqueda predictiva de clientes',
        'Ventas por Cobrar: Tarjetas de saldos pendientes con botón de cobro rápido',
      ],
    },
    chat: {
      label: 'Asistente Chat (IA)',
      title: 'Registra por texto o voz con cálculo de tasa BCV',
      badge: 'Asistente CryoTech',
      description:
        'Un asistente conversacional nativo. Escribe o dicta la venta o el consumo del día y CryoTech genera el pre-asiento contable con la tasa oficial BCV para confirmarlo con un toque.',
      highlights: [
        'Modo Rápido por botones o Modo IA conversacional integrado',
        'Conversión automática a Bolívares a la tasa oficial del día',
        'Confirmación visual antes de asentar en inventario y finanzas',
      ],
    },
    reports: {
      label: 'Reportes & FCR',
      title: 'Rentabilidad y conversión en el bolsillo',
      badge: 'Analítica de Lote',
      description:
        'Conoce el costo real por pollo producido, el margen comercial de cada lote y la conversión alimenticia (FCR) comparada con el estándar genético Cobb 500 y Ross 308.',
      highlights: [
        'Cálculo automático de Costo por Pollo y Margen de Utilidad',
        'Desglose porcentual de gastos (alimento, pollitos, vacunas, servicios)',
        'Índice de Conversión Alimenticia (FCR) para optimizar el engorde',
      ],
    },
    offline: {
      label: '100% Offline',
      title: 'Opera dentro del galpón aunque no haya señal ni WiFi',
      badge: 'Offline-First Real',
      description:
        'En corrales techados o zonas rurales sin cobertura móvil, la app no se detiene. Guarda todos los registros en la cola local del teléfono y los sincroniza al recuperar conexión.',
      highlights: [
        'Almacenamiento local ultrarrápido y seguro en el dispositivo',
        'Indicador de registros pendientes en cola listos para subir',
        'Sincronización en segundo plano sin duplicar operaciones',
      ],
    },
  };

  const current = tabDetails[activeTab];

  return (
    <section id="app-mobile" className="py-16 sm:py-24 bg-[#080b0f] border-t border-white/5 relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-1/3 -left-24 w-96 h-96 bg-teal-500/10 blur-[130px] rounded-full pointer-events-none" />
      <div className="absolute bottom-10 right-0 w-80 h-80 bg-emerald-500/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 relative z-10">
        
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 border border-teal-500/30 text-teal-400 text-xs font-semibold mb-3">
            <Smartphone className="w-3.5 h-3.5" />
            <span>CryoTech Mobile · Android APK</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
            La aplicación móvil real para el productor avícola
          </h2>
          <p className="text-slate-400 text-xs sm:text-base mt-3 leading-relaxed">
            Explora la interfaz real de la app: control del corral, registro rápido de bajas y alimento, asistente contable con tasa BCV y funcionamiento 100% sin conexión.
          </p>
        </div>

        {/* Feature Navigation Tabs */}
        <div className="flex items-center justify-center gap-2 mb-10 overflow-x-auto pb-2 no-scrollbar">
          {(
            [
              { id: 'home', label: 'Inicio (Granja)', icon: Home },
              { id: 'register', label: 'Registrar (Hub)', icon: PlusCircle },
              { id: 'chat', label: 'Asistente IA', icon: MessageSquare },
              { id: 'reports', label: 'Reportes & FCR', icon: BarChart3 },
              { id: 'offline', label: 'Modo Offline', icon: WifiOff },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shrink-0 ${
                  isActive
                    ? 'bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20'
                    : 'bg-[#11151c] text-slate-300 hover:text-white border border-white/5 hover:border-white/15'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Interactive Showcase Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center max-w-5xl mx-auto">
          
          {/* Left: Smartphone Mockup reproducing apps/mobile UI */}
          <div className="lg:col-span-5 flex justify-center">
            <div className="w-full max-w-[325px] rounded-[38px] bg-slate-950 border-[6px] border-slate-800 shadow-2xl shadow-black relative overflow-hidden select-none">
              
              {/* Speaker & Sensor Notch */}
              <div className="pt-2 pb-1 bg-slate-900 flex justify-center">
                <div className="w-20 h-3.5 bg-slate-950 rounded-full flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-slate-800" />
                </div>
              </div>

              {/* REAL APP HEADER (From apps/mobile/src/components/layout/app-header.tsx) */}
              <div className="bg-slate-900/95 border-b border-slate-800 px-3.5 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2 text-left">
                  <div className="w-6 h-6 rounded-md bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400">
                    <Building2 className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-bold text-slate-100 leading-tight">Granja Mata</span>
                      <ChevronDown className="w-3 h-3 text-slate-400" />
                    </div>
                    <span className="text-[10px] text-slate-400 block leading-tight">Juan Carlos</span>
                  </div>
                </div>

                {/* Status pill based on tab */}
                {activeTab === 'offline' ? (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-950/70 border border-red-800/70 text-red-300 text-[10px] font-medium">
                    <WifiOff className="w-3 h-3 text-red-400" />
                    <span>Offline</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-950/70 border border-teal-800/70 text-teal-300 text-[10px] font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
                    <span>En línea</span>
                  </div>
                )}
              </div>

              {/* PHONE SCREEN CONTENT */}
              <div className="p-3 bg-slate-950 min-h-[380px] max-h-[380px] overflow-y-auto no-scrollbar flex flex-col justify-between text-left">
                
                {/* 1. SCREEN: INICIO (HOME) */}
                {activeTab === 'home' && (
                  <div className="space-y-3 animate-fadeIn">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[10px] text-slate-400 capitalize">Viernes, 2 de octubre</p>
                        <h3 className="text-sm font-bold text-slate-100">Estado de Granja</h3>
                      </div>
                      <span className="text-[9px] text-teal-400 bg-teal-500/10 border border-teal-500/20 px-2 py-0.5 rounded-full font-medium">
                        Actualizar
                      </span>
                    </div>

                    {/* AI Assistant Quick Banner */}
                    <div
                      onClick={() => setActiveTab('chat')}
                      className="cursor-pointer bg-gradient-to-r from-teal-950/60 to-slate-900 border border-teal-500/30 rounded-xl p-2.5 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-teal-500 flex items-center justify-center text-slate-950">
                          <Sparkles className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-slate-100 block">Asistente Inteligente</span>
                          <span className="text-[9px] text-slate-400">Registra ventas, bajas o consumo</span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-teal-400" />
                    </div>

                    {/* 2x2 KPI Grid */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5">
                        <div className="flex items-center justify-between text-slate-400 mb-1">
                          <span className="text-[9px] font-semibold uppercase">Mortalidad</span>
                          <Skull className="w-3 h-3 text-red-400" />
                        </div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-lg font-black text-slate-100">1.4</span>
                          <span className="text-[9px] text-slate-400">% (12 aves)</span>
                        </div>
                      </div>

                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5">
                        <div className="flex items-center justify-between text-slate-400 mb-1">
                          <span className="text-[9px] font-semibold uppercase">Alimento</span>
                          <Wheat className="w-3 h-3 text-amber-400" />
                        </div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-lg font-black text-slate-100">280</span>
                          <span className="text-[9px] text-slate-400">kg hoy</span>
                        </div>
                      </div>

                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5">
                        <div className="flex items-center justify-between text-slate-400 mb-1">
                          <span className="text-[9px] font-semibold uppercase">En Corral</span>
                          <Bird className="w-3 h-3 text-teal-400" />
                        </div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-lg font-black text-slate-100">4,850</span>
                          <span className="text-[9px] text-slate-400">vivas</span>
                        </div>
                      </div>

                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5">
                        <div className="flex items-center justify-between text-slate-400 mb-1">
                          <span className="text-[9px] font-semibold uppercase">Ventas / Cobros</span>
                          <DollarSign className="w-3 h-3 text-emerald-400" />
                        </div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-lg font-black text-slate-100">$1,420</span>
                        </div>
                      </div>
                    </div>

                    {/* Active Batch Card */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-100">LOTE-C500-04</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-semibold">
                            Cobb 500
                          </span>
                        </div>
                        <span className="text-[10px] font-semibold text-teal-400">4,850 vivas</span>
                      </div>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-teal-500 h-full rounded-full" style={{ width: '97%' }} />
                      </div>
                      <div className="flex justify-between text-[9px] text-slate-400">
                        <span>Inicial: 5,000 aves</span>
                        <span>Supervivencia: 97%</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. SCREEN: REGISTRAR (HUB) */}
                {activeTab === 'register' && (
                  <div className="space-y-2.5 animate-fadeIn">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-100">Registrar Operación</span>
                      <span className="text-[9px] text-slate-400">Táctil</span>
                    </div>

                    {/* 4 Operations from apps/mobile/src/pages/register-hub.tsx */}
                    <div className="space-y-1.5">
                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
                            <Calendar className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="text-[11px] font-bold text-slate-100 block">Registro Diario</span>
                            <span className="text-[9px] text-slate-400">Bajas, consumo y peso</span>
                          </div>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                      </div>

                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                            <TrendingUp className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="text-[11px] font-bold text-slate-100 block">Venta de Pollos</span>
                            <span className="text-[9px] text-slate-400">Vivo o beneficiado</span>
                          </div>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                      </div>

                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center">
                            <DollarSign className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="text-[11px] font-bold text-slate-100 block">Cobranza</span>
                            <span className="text-[9px] text-slate-400">Abonos de ventas pendientes</span>
                          </div>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                      </div>

                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
                            <ShoppingCart className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="text-[11px] font-bold text-slate-100 block">Compra de Insumo</span>
                            <span className="text-[9px] text-slate-400">Alimento, vacunas o medicinas</span>
                          </div>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                      </div>
                    </div>

                    {/* Ventas por Cobrar Section */}
                    <div className="pt-1">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                          Ventas por Cobrar (1)
                        </span>
                        <span className="text-[9px] text-teal-400">Refrescar</span>
                      </div>
                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-2 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] font-bold text-slate-200 block">Distribuidora Galpones</span>
                          <span className="text-[9px] text-slate-400">Saldo: $1,152.00 (120 aves)</span>
                        </div>
                        <button className="bg-teal-500 text-slate-950 font-bold text-[9px] px-2.5 py-1 rounded-md">
                          Cobrar
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. SCREEN: ASISTENTE (CHAT) */}
                {activeTab === 'chat' && (
                  <div className="space-y-2 animate-fadeIn text-[10px]">
                    {/* Top Mode Bar */}
                    <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                      <span className="px-2 py-0.5 rounded-full bg-purple-950/80 border border-purple-700/60 text-purple-300 font-semibold flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-purple-400" />
                        <span>Modo IA Activo</span>
                      </span>
                      <span className="text-[9px] text-slate-400 font-mono">Tasa BCV: 36.85</span>
                    </div>

                    {/* Suggestion Chips */}
                    <div className="flex gap-1 overflow-x-auto no-scrollbar py-0.5">
                      <span className="shrink-0 bg-slate-900 border border-slate-800 rounded-full px-2 py-0.5 text-slate-300 text-[9px]">
                        🍗 Venta rápida
                      </span>
                      <span className="shrink-0 bg-slate-900 border border-slate-800 rounded-full px-2 py-0.5 text-slate-300 text-[9px]">
                        📋 Registro hoy
                      </span>
                      <span className="shrink-0 bg-slate-900 border border-slate-800 rounded-full px-2 py-0.5 text-slate-300 text-[9px]">
                        💵 Tasa BCV
                      </span>
                    </div>

                    {/* Message Bubble - User */}
                    <div className="p-2 rounded-xl bg-teal-500/15 border border-teal-500/30 text-teal-200 ml-4">
                      <p className="text-[10px]">
                        Vendí 80 pollos a Carnicería Central, pesaron 192 kg a 4.00, cobré $192 de inicial.
                      </p>
                    </div>

                    {/* Message Bubble - Assistant with Real Draft Ticket */}
                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                      <div className="flex items-center justify-between text-teal-400 font-bold text-[9px]">
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Pre-asiento de Venta</span>
                        </span>
                        <span className="font-mono">BCV Oficial</span>
                      </div>
                      <div className="text-slate-300 space-y-0.5 text-[9px]">
                        <div className="flex justify-between">
                          <span>Aves:</span>
                          <span className="font-bold text-white">80 aves (192.0 kg)</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Total Venta:</span>
                          <span className="font-bold text-white">$768.00 (Bs 28,300)</span>
                        </div>
                        <div className="flex justify-between text-emerald-400 font-semibold">
                          <span>Cobro recibido:</span>
                          <span>$192.00</span>
                        </div>
                        <div className="flex justify-between text-amber-400">
                          <span>Saldo crédito:</span>
                          <span>$576.00</span>
                        </div>
                      </div>
                      <div className="pt-1 flex gap-1.5">
                        <button className="flex-1 py-1 rounded-md bg-teal-500 text-slate-950 font-bold text-[9px] text-center">
                          ✓ Confirmar
                        </button>
                        <button className="px-2 py-1 rounded-md bg-slate-800 text-slate-400 text-[9px]">
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. SCREEN: REPORTES */}
                {activeTab === 'reports' && (
                  <div className="space-y-2.5 animate-fadeIn">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-slate-100 block">Rentabilidad de Lote</span>
                        <span className="text-[9px] text-slate-400">Lote #04 · Cobb 500</span>
                      </div>
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold">
                        En Venta
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-2 text-center">
                        <span className="text-[9px] text-slate-400 block uppercase">Costo / Pollo</span>
                        <span className="text-base font-black text-slate-100">$2.35</span>
                        <span className="text-[8px] text-slate-500 block">Bs 86.60</span>
                      </div>

                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-2 text-center">
                        <span className="text-[9px] text-slate-400 block uppercase">Conversión FCR</span>
                        <span className="text-base font-black text-teal-400">1.64</span>
                        <span className="text-[8px] text-emerald-400 block">Meta Cobb: 1.68</span>
                      </div>

                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-2 text-center">
                        <span className="text-[9px] text-slate-400 block uppercase">Margen Est.</span>
                        <span className="text-base font-black text-emerald-400">+38.2%</span>
                        <span className="text-[8px] text-slate-500 block">Venta $4.00/kg</span>
                      </div>

                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-2 text-center">
                        <span className="text-[9px] text-slate-400 block uppercase">Ingreso Proy.</span>
                        <span className="text-base font-black text-slate-100">$19,400</span>
                        <span className="text-[8px] text-slate-500 block">Total lote</span>
                      </div>
                    </div>

                    {/* Breakdown bar */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-2 space-y-1">
                      <span className="text-[9px] font-bold text-slate-400 block uppercase">
                        Distribución de Costos
                      </span>
                      <div className="w-full h-2 rounded-full flex overflow-hidden">
                        <div className="bg-teal-500 h-full" style={{ width: '68%' }} title="Alimento 68%" />
                        <div className="bg-blue-500 h-full" style={{ width: '18%' }} title="Pollitos 18%" />
                        <div className="bg-amber-500 h-full" style={{ width: '8%' }} title="Bio 8%" />
                        <div className="bg-slate-600 h-full" style={{ width: '6%' }} title="Otros 6%" />
                      </div>
                      <div className="flex justify-between text-[8px] text-slate-400 pt-0.5">
                        <span className="text-teal-400">● Alimento 68%</span>
                        <span className="text-blue-400">● Aves 18%</span>
                        <span className="text-amber-400">● Bio 8%</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 5. SCREEN: MODO OFFLINE */}
                {activeTab === 'offline' && (
                  <div className="space-y-2.5 animate-fadeIn text-center py-1">
                    <div className="w-10 h-10 rounded-full bg-red-950/60 border border-red-800/60 flex items-center justify-center mx-auto text-red-400">
                      <WifiOff className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-100 block">Modo Sin Conexión</span>
                      <span className="text-[10px] text-slate-400">
                        Galpón sin señal celular ni WiFi
                      </span>
                    </div>

                    {/* Sync Store Queue Demonstration */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-left space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold uppercase text-amber-400 flex items-center gap-1">
                          <RefreshCw className="w-3 h-3" />
                          <span>3 en cola de subida</span>
                        </span>
                        <span className="text-[8px] text-slate-400">Guardado local</span>
                      </div>

                      <div className="space-y-1 text-[9px]">
                        <div className="p-1.5 rounded-lg bg-slate-950 flex justify-between items-center text-slate-300">
                          <span>Registro Diario (Galpón 2 - 12 bajas)</span>
                          <span className="text-amber-400 font-mono">Pendiente</span>
                        </div>
                        <div className="p-1.5 rounded-lg bg-slate-950 flex justify-between items-center text-slate-300">
                          <span>Venta #051 (Carnicería Central)</span>
                          <span className="text-amber-400 font-mono">Pendiente</span>
                        </div>
                        <div className="p-1.5 rounded-lg bg-slate-950 flex justify-between items-center text-slate-300">
                          <span>Cobro abono $192.00</span>
                          <span className="text-amber-400 font-mono">Pendiente</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-2 rounded-xl bg-teal-500/10 border border-teal-500/20 text-[9px] text-teal-300 text-left">
                      ✓ Al detectar cobertura o volver a la oficina, la app sube todo automáticamente sin perder registros.
                    </div>
                  </div>
                )}
              </div>

              {/* REAL BOTTOM NAVIGATION (From apps/mobile/src/components/layout/bottom-nav.tsx) */}
              <div className="bg-slate-900/95 border-t border-slate-800 px-1 py-1.5 flex items-center justify-around relative">
                {/* 1. Inicio */}
                <button
                  onClick={() => setActiveTab('home')}
                  className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors ${
                    activeTab === 'home' ? 'text-teal-400' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Home className="w-4 h-4" />
                  <span className="text-[9px] font-medium mt-0.5">Inicio</span>
                </button>

                {/* 2. Asistente */}
                <button
                  onClick={() => setActiveTab('chat')}
                  className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors ${
                    activeTab === 'chat' ? 'text-teal-400' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <MessageSquare className="w-4 h-4" />
                  <span className="text-[9px] font-medium mt-0.5">Asistente</span>
                </button>

                {/* 3. Registrar (Main Action FAB Button) */}
                <button
                  onClick={() => setActiveTab('register')}
                  className="flex flex-col items-center justify-center -mt-4 px-1"
                >
                  <div className="w-10 h-10 rounded-full bg-teal-500 shadow-md shadow-teal-500/40 flex items-center justify-center text-slate-950 transition-transform active:scale-90">
                    <PlusCircle className="w-6 h-6 stroke-[2.2]" />
                  </div>
                  <span className="text-[9px] font-semibold text-teal-400 mt-0.5">Registrar</span>
                </button>

                {/* 4. Reportes */}
                <button
                  onClick={() => setActiveTab('reports')}
                  className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors ${
                    activeTab === 'reports' ? 'text-teal-400' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <BarChart3 className="w-4 h-4" />
                  <span className="text-[9px] font-medium mt-0.5">Reportes</span>
                </button>

                {/* 5. Más / Offline */}
                <button
                  onClick={() => setActiveTab('offline')}
                  className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors ${
                    activeTab === 'offline' ? 'text-teal-400' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {activeTab === 'offline' ? (
                    <WifiOff className="w-4 h-4 text-red-400" />
                  ) : (
                    <Menu className="w-4 h-4" />
                  )}
                  <span className="text-[9px] font-medium mt-0.5">
                    {activeTab === 'offline' ? 'Offline' : 'Más'}
                  </span>
                </button>
              </div>

            </div>
          </div>

          {/* Right: Feature Description & Real Value */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-400 text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
              <span>{current.badge}</span>
            </div>

            <h3 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              {current.title}
            </h3>

            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              {current.description}
            </p>

            <div className="space-y-3 pt-2">
              {current.highlights.map((point, index) => (
                <div key={index} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-md bg-teal-500/20 border border-teal-500/40 text-teal-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  </div>
                  <span className="text-slate-300 text-xs sm:text-sm font-medium leading-normal">
                    {point}
                  </span>
                </div>
              ))}
            </div>

            {/* APK CTA & Action Box */}
            <div className="pt-6 border-t border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
              <button
                onClick={onOpenWaitlist}
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-bold text-sm text-slate-950 bg-teal-400 hover:bg-teal-300 active:scale-95 transition-all shadow-lg shadow-teal-500/20"
              >
                <Download className="w-4 h-4" />
                <span>Solicitar APK para Android</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#11151c] border border-white/5 text-slate-400 text-xs">
                <Smartphone className="w-4 h-4 text-teal-400 shrink-0" />
                <span>Compatible con Android 8.0 en adelante · Instalación directa</span>
              </div>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
};

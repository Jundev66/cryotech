import React, { useState } from 'react';
import {
  Sparkles,
  Bot,
  Send,
  CheckCircle,
  RotateCcw,
  Home,
  PlusCircle,
  BarChart3,
  Check,
  Zap,
} from 'lucide-react';

export const InteractiveDemo: React.FC = () => {
  // Mobile app simulated navigation tabs
  const [activeMobileTab, setActiveMobileTab] = useState<'home' | 'chat' | 'register' | 'reports'>('chat');
  
  // Chatbot State
  const [isAiMode, setIsAiMode] = useState<boolean>(false);
  const [chatMessages, setChatMessages] = useState<Array<{
    id: string;
    sender: 'user' | 'assistant';
    text: string;
    draftCard?: {
      title: string;
      items: { label: string; value: string; highlight?: boolean }[];
      totalUsd: string;
      totalBs: string;
    };
  }>>([
    {
      id: '1',
      sender: 'assistant',
      text: '¡Hola, Pedro! Soy tu asistente CryoTech. ¿Qué deseas registrar o consultar hoy?',
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [confirmedDraft, setConfirmedDraft] = useState(false);

  // Simulated live app metrics
  const [batchBirds, setBatchBirds] = useState(1248);
  const [treasuryBalanceUsd, setTreasuryBalanceUsd] = useState(4180.0);

  const quickSuggestions = [
    { label: '🍗 Venta rápida', key: 'sale' },
    { label: '📋 Registro de hoy', key: 'daily' },
    { label: '💵 Ver tasa BCV', key: 'bcv' },
    { label: '🐣 Stock de pollos', key: 'stock' },
  ];

  const handleSuggestionClick = (key: string, label: string) => {
    setConfirmedDraft(false);
    setChatMessages((prev) => [...prev, { id: Date.now().toString(), sender: 'user', text: label }]);
    setIsTyping(true);

    setTimeout(() => {
      setIsTyping(false);
      if (key === 'sale') {
        setChatMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            sender: 'assistant',
            text: 'Detecté una venta. He preparado el borrador con la tasa oficial BCV (36.85 Bs/$):',
            draftCard: {
              title: '🍗 Propuesta de Venta #VEN-0194',
              items: [
                { label: 'Cliente', value: 'Carnicería Los Andes' },
                { label: 'Lote / Galpón', value: 'Lote #14 — Galpón 2 (Cobb 500)' },
                { label: 'Aves / Peso', value: '25 aves (58.20 kg)' },
                { label: 'Precio Unitario', value: '$4.00 / kg' },
                { label: 'Cobro', value: 'Efectivo USD + Abono' },
              ],
              totalUsd: '$232.80 USD',
              totalBs: 'Bs 8,578.68 (Tasa 36.85)',
            },
          },
        ]);
      } else if (key === 'daily') {
        setChatMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            sender: 'assistant',
            text: 'Resumen de bitácora diaria para el Lote #14 (Día 38):',
            draftCard: {
              title: '📋 Registro Diario de Crianza',
              items: [
                { label: 'Galpón', value: 'Galpón 2 (Cobb 500)' },
                { label: 'Consumo Alimento', value: '160 kg (Engorde Fase 2)' },
                { label: 'Mortalidad Hoy', value: '1 ave (Normal: 0.08%)' },
                { label: 'Pesaje Muestra', value: '2,180 g (+30g vs estándar Cobb)' },
              ],
              totalUsd: 'FCR: 1.58 (Excelente)',
              totalBs: 'Salud del Lote: Óptima',
            },
          },
        ]);
      } else if (key === 'bcv') {
        setChatMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            sender: 'assistant',
            text: '💵 **Tasa Oficial BCV:** 36.85 Bs/USD.\n\nExtraída directamente del Banco Central de Venezuela. Todas las conversiones de hoy se liquidan con este valor oficial.',
          },
        ]);
      } else if (key === 'stock') {
        setChatMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            sender: 'assistant',
            text: `🐣 **Stock Actual de Pollos:**\n\n• **Lote #14 (Galpón 2):** ${batchBirds} aves vivas • Raza Cobb 500 • Día 38 de 42.\n• **Lote #15 (Galpón 1):** 2,000 pollitos • Día 12 (Iniciador).`,
          },
        ]);
      }
    }, 600);
  };

  const handleSendCustomMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isTyping) return;

    const userText = inputText.trim();
    setInputText('');
    setConfirmedDraft(false);

    setChatMessages((prev) => [...prev, { id: Date.now().toString(), sender: 'user', text: userText }]);
    setIsTyping(true);

    setTimeout(() => {
      setIsTyping(false);
      setChatMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: 'assistant',
          text: `Comprendido. He procesado tu instrucción en modo ${isAiMode ? 'IA' : 'Rápido'}:`,
          draftCard: {
            title: '⚡ Asiento Interpretado',
            items: [
              { label: 'Mensaje', value: userText },
              { label: 'Tasa BCV', value: '36.85 Bs/$' },
              { label: 'Lote', value: 'Lote #14 (Galpón 2)' },
            ],
            totalUsd: 'Asiento Listo',
            totalBs: 'Validado contra inventario',
          },
        },
      ]);
    }, 700);
  };

  const handleConfirmDraft = () => {
    setConfirmedDraft(true);
    setBatchBirds((prev) => Math.max(0, prev - 25));
    setTreasuryBalanceUsd((prev) => prev + 232.8);
  };

  const handleResetChat = () => {
    setConfirmedDraft(false);
    setChatMessages([
      {
        id: '1',
        sender: 'assistant',
        text: '¡Hola, Pedro! Soy tu asistente CryoTech. ¿Qué deseas registrar o consultar hoy?',
      },
    ]);
  };

  return (
    <section id="demo" className="py-16 sm:py-24 bg-[#070b09] relative">
      {/* Background ambient lighting */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-full sm:w-3/4 h-80 sm:h-96 bg-emerald-500/10 blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-16 space-y-3 sm:space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950 border border-emerald-800 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>Simulador de la App Móvil en Vivo</span>
          </div>
          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight">
            Prueba la app móvil y su chatbot interactivo
          </h2>
          <p className="text-emerald-100/70 text-xs sm:text-base leading-relaxed">
            Navega entre las pantallas reales de la app: habla con el <strong>Chatbot propio</strong>, consulta el <strong>Galpón</strong>, prueba el <strong>Hub de Registro</strong> y analiza los <strong>Reportes</strong>.
          </p>
        </div>

        {/* Simulator Container */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          
          {/* Instructions and Explanatory Panel (5 cols on Desktop) */}
          <div className="lg:col-span-5 space-y-4 sm:space-y-6 order-2 lg:order-1">
            
            {/* Guide Card */}
            <div className="rounded-2xl bg-[#0c1410] border border-emerald-900/50 p-5 sm:p-6 shadow-xl space-y-3 sm:space-y-4">
              <div className="flex items-center gap-2 text-emerald-400">
                <Bot className="w-5 h-5" />
                <h3 className="text-base sm:text-lg font-bold text-white font-display">
                  ¿Cómo usar este simulador?
                </h3>
              </div>
              <p className="text-xs text-emerald-200/80 leading-relaxed">
                El teléfono a la derecha simula la <strong>App Móvil real de CryoTech</strong>. Puedes interactuar directamente:
              </p>

              <div className="space-y-2.5 text-xs">
                <div className="p-3 rounded-xl bg-[#090d0b] border border-emerald-900/40 flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 font-bold font-mono text-[11px]">
                    1
                  </div>
                  <div>
                    <strong className="text-white block mb-0.5">Toca los botones del Chatbot:</strong>
                    <span className="text-emerald-300/70">
                      Prueba pulsar <strong>"🍗 Venta rápida"</strong> o <strong>"📋 Registro de hoy"</strong> para ver cómo el bot responde de inmediato.
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#090d0b] border border-emerald-900/40 flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 font-bold font-mono text-[11px]">
                    2
                  </div>
                  <div>
                    <strong className="text-white block mb-0.5">Confirma la operación:</strong>
                    <span className="text-emerald-300/70">
                      Al presionar <strong>"Confirmar Operación"</strong>, verás cómo el stock del Lote #14 se descuenta en vivo en la pestaña <em>Inicio</em>.
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#090d0b] border border-emerald-900/40 flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 font-bold font-mono text-[11px]">
                    3
                  </div>
                  <div>
                    <strong className="text-white block mb-0.5">Cambia de pestaña en la barra inferior:</strong>
                    <span className="text-emerald-300/70">
                      Toca <em>Inicio</em>, <em>Asistente</em>, <em>Registrar</em> o <em>Reportes</em> en la barra de navegación del teléfono.
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Live Impact Feedback Card */}
            <div className="rounded-2xl bg-[#0c1410] border border-emerald-900/50 p-5 sm:p-6 shadow-xl space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-emerald-900/40 text-xs">
                <span className="font-mono uppercase font-bold text-emerald-400">Estado del Galpón en Vivo</span>
                <span className="flex items-center gap-1.5 text-emerald-400 font-mono text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  Sincronizado
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-[#090d0b] border border-emerald-900/40">
                  <span className="text-emerald-400/70 block mb-1">Aves vivas en Lote #14:</span>
                  <p className="font-mono font-bold text-base text-white">{batchBirds} aves</p>
                  <span className="text-[10px] text-emerald-500">Galpón 2 (Cobb 500)</span>
                </div>

                <div className="p-3 rounded-xl bg-[#090d0b] border border-emerald-900/40">
                  <span className="text-emerald-400/70 block mb-1">Saldo Tesorería:</span>
                  <p className="font-mono font-bold text-base text-emerald-300 font-mono">
                    ${treasuryBalanceUsd.toFixed(2)} USD
                  </p>
                  <span className="text-[10px] text-emerald-500">Tasa BCV: 36.85 Bs/$</span>
                </div>
              </div>
            </div>

          </div>

          {/* Interactive Mobile Device Frame (7 cols on Desktop) */}
          <div className="lg:col-span-7 flex justify-center w-full order-1 lg:order-2">
            <div className="w-full max-w-[380px] sm:max-w-[400px] h-[640px] sm:h-[680px] rounded-[36px] bg-[#020604] border-[6px] sm:border-[8px] border-[#182a20] shadow-2xl shadow-emerald-950/90 flex flex-col overflow-hidden relative">
              
              {/* Speaker & Camera Notch */}
              <div className="w-full bg-[#0a110e] pt-2 pb-1.5 px-6 flex items-center justify-between text-[11px] text-emerald-400 font-mono select-none shrink-0 border-b border-emerald-950/60">
                <span className="font-bold">09:41</span>
                <div className="w-20 h-3.5 bg-black rounded-full mx-auto"></div>
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span>5G</span>
                  <span>100%</span>
                </div>
              </div>

              {/* App Header (Idéntico a AppHeader de apps/mobile) */}
              <div className="bg-[#0b1410] px-4 py-2.5 border-b border-emerald-900/50 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center font-bold text-xs">
                    CT
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white leading-tight">Granja Mata</h4>
                    <p className="text-[10px] text-emerald-400/80 font-mono">
                      {activeMobileTab === 'chat' && 'Asistente CryoTech'}
                      {activeMobileTab === 'home' && 'Galpones & Lotes'}
                      {activeMobileTab === 'register' && 'Hub de Registro'}
                      {activeMobileTab === 'reports' && 'Curvas & FCR'}
                    </p>
                  </div>
                </div>

                {/* Tasa BCV Oficial en Cabecera */}
                <div className="px-2.5 py-1 rounded-lg bg-amber-950/60 border border-amber-500/40 text-amber-300 text-[11px] font-mono font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                  <span>BCV: 36.85</span>
                </div>
              </div>

              {/* Screen Body Viewport */}
              <div className="flex-1 overflow-y-auto no-scrollbar bg-[#070b09] flex flex-col">
                
                {/* TAB 1: ASISTENTE (CHATBOT PROPIO) */}
                {activeMobileTab === 'chat' && (
                  <div className="flex-1 flex flex-col justify-between">
                    
                    {/* Chatbot Controls Bar (Modo Rápido vs Modo IA) */}
                    <div className="bg-[#0d1712] px-3.5 py-2 border-b border-emerald-900/40 flex items-center justify-between text-xs shrink-0">
                      <button
                        onClick={() => setIsAiMode(!isAiMode)}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
                          isAiMode
                            ? 'bg-purple-950 text-purple-300 border border-purple-600/60'
                            : 'bg-emerald-950 text-emerald-300 border border-emerald-600/60'
                        }`}
                      >
                        {isAiMode ? (
                          <>
                            <Sparkles className="w-3 h-3 text-purple-400" />
                            <span>Modo IA (Anthropic)</span>
                          </>
                        ) : (
                          <>
                            <Zap className="w-3 h-3 text-emerald-400" />
                            <span>Modo Rápido (Botones)</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={handleResetChat}
                        className="p-1 text-emerald-400/70 hover:text-white"
                        title="Reiniciar chat"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Chat Messages */}
                    <div className="p-3 space-y-3 flex-1 overflow-y-auto no-scrollbar text-xs">
                      
                      {/* Security notice */}
                      <div className="text-center">
                        <span className="text-[9px] font-mono text-emerald-500/60 bg-emerald-950/60 px-2.5 py-0.5 rounded-full border border-emerald-900/40">
                          Chatbot Interno • Sesión Cifrada
                        </span>
                      </div>

                      {chatMessages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex gap-2 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          {msg.sender === 'assistant' && (
                            <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                              <Bot className="w-3.5 h-3.5" />
                            </div>
                          )}

                          <div
                            className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed ${
                              msg.sender === 'user'
                                ? 'bg-emerald-600 text-white rounded-tr-none shadow-md'
                                : 'bg-[#0e1914] text-emerald-100 rounded-tl-none border border-emerald-900/60 shadow-lg'
                            }`}
                          >
                            <p className="whitespace-pre-line">{msg.text}</p>

                            {/* Draft Card */}
                            {msg.draftCard && (
                              <div className="mt-2.5 pt-2.5 border-t border-emerald-900/60 space-y-2">
                                <span className="font-bold text-white text-[11px] block">
                                  {msg.draftCard.title}
                                </span>

                                <div className="bg-black/40 p-2 rounded-xl border border-emerald-950 space-y-1 text-[10px]">
                                  {msg.draftCard.items.map((it, iIdx) => (
                                    <div key={iIdx} className="flex justify-between items-center">
                                      <span className="text-emerald-400/70">{it.label}:</span>
                                      <span className="font-semibold text-white">{it.value}</span>
                                    </div>
                                  ))}
                                </div>

                                <div className="flex justify-between items-center text-[10px] font-mono pt-1">
                                  <span className="font-bold text-amber-300">{msg.draftCard.totalUsd}</span>
                                  <span className="text-emerald-300">{msg.draftCard.totalBs}</span>
                                </div>

                                {/* Confirmation Button */}
                                {!confirmedDraft ? (
                                  <button
                                    onClick={handleConfirmDraft}
                                    className="w-full mt-1 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-md shadow-emerald-500/20"
                                  >
                                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                                    <span>Confirmar Operación</span>
                                  </button>
                                ) : (
                                  <div className="p-2 rounded-xl bg-emerald-950 border border-emerald-500/50 text-emerald-300 text-[10px] font-medium flex items-center gap-1.5">
                                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                    <span>¡Operación confirmada y stock descontado!</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}

                      {isTyping && (
                        <div className="flex items-center gap-1.5 p-2 bg-[#0e1914] text-emerald-400 rounded-xl w-28 text-[11px]">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce"></span>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce [animation-delay:0.2s]"></span>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce [animation-delay:0.4s]"></span>
                          <span className="text-[10px] font-mono">Escribiendo...</span>
                        </div>
                      )}
                    </div>

                    {/* Quick Suggestions Buttons (Idéntico a apps/mobile SUGGESTIONS) */}
                    <div className="p-2 bg-[#090f0c] border-t border-emerald-900/40">
                      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
                        {quickSuggestions.map((sug) => (
                          <button
                            key={sug.key}
                            onClick={() => handleSuggestionClick(sug.key, sug.label)}
                            className="whitespace-nowrap px-2.5 py-1 rounded-lg bg-[#112018] hover:bg-[#183024] text-emerald-200 text-[11px] font-medium border border-emerald-800/50 active:scale-95 transition-all"
                          >
                            {sug.label}
                          </button>
                        ))}
                      </div>

                      {/* Chat Input */}
                      <form onSubmit={handleSendCustomMessage} className="mt-1 flex items-center gap-1.5">
                        <input
                          type="text"
                          value={inputText}
                          onChange={(e) => setInputText(e.target.value)}
                          placeholder="Mensaje o comando..."
                          className="flex-1 bg-[#122219] text-white text-[11px] px-3 py-2 rounded-xl border border-emerald-800/60 focus:outline-none focus:border-emerald-400"
                        />
                        <button
                          type="submit"
                          disabled={!inputText.trim()}
                          className="p-2 bg-emerald-500 disabled:opacity-40 text-emerald-950 rounded-xl"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>
                      </form>
                    </div>

                  </div>
                )}

                {/* TAB 2: INICIO (HOME / GALPON) */}
                {activeMobileTab === 'home' && (
                  <div className="p-4 space-y-3.5 text-xs animate-fadeIn">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-white text-sm">Galpón 2 • Lote Activo</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 bg-emerald-950 text-emerald-300 rounded border border-emerald-800">
                        Cobb 500
                      </span>
                    </div>

                    {/* Batch Card */}
                    <div className="p-3.5 rounded-2xl bg-[#0c1611] border border-emerald-800/60 space-y-3 shadow-lg">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-bold text-white text-sm">Lote #14 (Engorde)</h4>
                          <p className="text-[11px] text-emerald-400">Día 38 de 42 (90% del ciclo)</p>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-emerald-500 text-emerald-950 font-bold text-[10px]">
                          Para Venta
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="w-full bg-[#14231b] h-2 rounded-full overflow-hidden">
                        <div className="bg-emerald-400 h-full w-[90%]" />
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center text-[10px] pt-1">
                        <div className="p-2 rounded-xl bg-[#070b09] border border-emerald-950">
                          <span className="text-emerald-400/70 block">Aves Vivas</span>
                          <span className="font-bold text-white font-mono text-xs">{batchBirds}</span>
                        </div>
                        <div className="p-2 rounded-xl bg-[#070b09] border border-emerald-950">
                          <span className="text-emerald-400/70 block">FCR Conversión</span>
                          <span className="font-bold text-emerald-300 font-mono text-xs">1.58</span>
                        </div>
                        <div className="p-2 rounded-xl bg-[#070b09] border border-emerald-950">
                          <span className="text-emerald-400/70 block">Peso Promedio</span>
                          <span className="font-bold text-white font-mono text-xs">2,180 g</span>
                        </div>
                      </div>
                    </div>

                    {/* Quick action button to trigger chat */}
                    <button
                      onClick={() => setActiveMobileTab('chat')}
                      className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-emerald-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-95"
                    >
                      <Bot className="w-4 h-4" />
                      <span>Abrir Chatbot para Registrar Venta o Bajas</span>
                    </button>
                  </div>
                )}

                {/* TAB 3: REGISTRAR (REGISTER HUB) */}
                {activeMobileTab === 'register' && (
                  <div className="p-4 space-y-3 text-xs animate-fadeIn">
                    <span className="font-bold text-white text-sm block">Hub de Registro Rápido</span>
                    <p className="text-[11px] text-emerald-300/70">
                      Toca cualquier tarjeta táctil para asentar datos de campo:
                    </p>

                    <div className="grid grid-cols-2 gap-2.5 pt-1">
                      <div
                        onClick={() => {
                          setActiveMobileTab('chat');
                          handleSuggestionClick('sale', '🍗 Venta rápida');
                        }}
                        className="p-3 rounded-xl bg-[#0c1611] border border-emerald-800/60 hover:border-emerald-500 cursor-pointer transition-colors"
                      >
                        <span className="text-lg mb-1 block">🍗</span>
                        <h5 className="font-bold text-white text-xs">Venta de Pollos</h5>
                        <p className="text-[10px] text-emerald-400/70">Vivo o beneficiado</p>
                      </div>

                      <div
                        onClick={() => {
                          setActiveMobileTab('chat');
                          handleSuggestionClick('daily', '📋 Registro de hoy');
                        }}
                        className="p-3 rounded-xl bg-[#0c1611] border border-emerald-800/60 hover:border-emerald-500 cursor-pointer transition-colors"
                      >
                        <span className="text-lg mb-1 block">🌽</span>
                        <h5 className="font-bold text-white text-xs">Alimento Diario</h5>
                        <p className="text-[10px] text-emerald-400/70">Por etapas y sacos</p>
                      </div>

                      <div
                        onClick={() => {
                          setActiveMobileTab('chat');
                          handleSuggestionClick('daily', '📋 Registro de hoy');
                        }}
                        className="p-3 rounded-xl bg-[#0c1611] border border-emerald-800/60 hover:border-emerald-500 cursor-pointer transition-colors"
                      >
                        <span className="text-lg mb-1 block">⚠️</span>
                        <h5 className="font-bold text-white text-xs">Bajas / Mortalidad</h5>
                        <p className="text-[10px] text-emerald-400/70">Descuento de lote</p>
                      </div>

                      <div
                        onClick={() => {
                          setActiveMobileTab('chat');
                          handleSuggestionClick('daily', '📋 Registro de hoy');
                        }}
                        className="p-3 rounded-xl bg-[#0c1611] border border-emerald-800/60 hover:border-emerald-500 cursor-pointer transition-colors"
                      >
                        <span className="text-lg mb-1 block">⚖️</span>
                        <h5 className="font-bold text-white text-xs">Pesaje Muestra</h5>
                        <p className="text-[10px] text-emerald-400/70">Gramos promedio</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 4: REPORTES */}
                {activeMobileTab === 'reports' && (
                  <div className="p-4 space-y-3.5 text-xs animate-fadeIn">
                    <span className="font-bold text-white text-sm block">Curva Genética Cobb 500</span>

                    <div className="p-3.5 rounded-2xl bg-[#0c1611] border border-emerald-800/60 space-y-2.5">
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-emerald-300 font-semibold">Peso Observado vs Tabla:</span>
                        <span className="font-mono text-emerald-400 font-bold">+30 g sobre estándar</span>
                      </div>

                      {/* Mock Chart Bar */}
                      <div className="h-28 bg-[#070b09] rounded-xl border border-emerald-950 p-2 flex items-end justify-between gap-1">
                        <div className="w-1/6 bg-emerald-900/60 h-[30%] rounded-t flex flex-col justify-end items-center text-[8px] text-emerald-400">D7</div>
                        <div className="w-1/6 bg-emerald-800/60 h-[48%] rounded-t flex flex-col justify-end items-center text-[8px] text-emerald-400">D14</div>
                        <div className="w-1/6 bg-emerald-700/60 h-[65%] rounded-t flex flex-col justify-end items-center text-[8px] text-emerald-400">D21</div>
                        <div className="w-1/6 bg-emerald-600/60 h-[80%] rounded-t flex flex-col justify-end items-center text-[8px] text-emerald-400">D28</div>
                        <div className="w-1/6 bg-emerald-500 h-[92%] rounded-t flex flex-col justify-end items-center text-[8px] text-emerald-950 font-bold">D35</div>
                        <div className="w-1/6 bg-emerald-400 h-[98%] rounded-t flex flex-col justify-end items-center text-[8px] text-emerald-950 font-bold">D38</div>
                      </div>

                      <div className="flex justify-between text-[10px] text-emerald-400/80 font-mono pt-1">
                        <span>FCR acumulado: 1.58</span>
                        <span>Mortalidad: 1.8%</span>
                      </div>
                    </div>
                  </div>
                )}

              </div>

              {/* Bottom Navigation Bar (Idéntico a BottomNav de apps/mobile) */}
              <div className="bg-[#0a110e] border-t border-emerald-900/60 px-3 py-2 flex items-center justify-around shrink-0 text-[10px]">
                <button
                  onClick={() => setActiveMobileTab('home')}
                  className={`flex flex-col items-center gap-0.5 transition-colors ${
                    activeMobileTab === 'home' ? 'text-emerald-400 font-bold' : 'text-emerald-400/50 hover:text-emerald-300'
                  }`}
                >
                  <Home className="w-4 h-4" />
                  <span>Inicio</span>
                </button>

                <button
                  onClick={() => setActiveMobileTab('chat')}
                  className={`flex flex-col items-center gap-0.5 transition-colors ${
                    activeMobileTab === 'chat' ? 'text-emerald-400 font-bold' : 'text-emerald-400/50 hover:text-emerald-300'
                  }`}
                >
                  <div className="relative">
                    <Bot className="w-4 h-4" />
                    <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  </div>
                  <span>Asistente</span>
                </button>

                <button
                  onClick={() => setActiveMobileTab('register')}
                  className={`flex flex-col items-center gap-0.5 transition-colors ${
                    activeMobileTab === 'register' ? 'text-emerald-400 font-bold' : 'text-emerald-400/50 hover:text-emerald-300'
                  }`}
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Registrar</span>
                </button>

                <button
                  onClick={() => setActiveMobileTab('reports')}
                  className={`flex flex-col items-center gap-0.5 transition-colors ${
                    activeMobileTab === 'reports' ? 'text-emerald-400 font-bold' : 'text-emerald-400/50 hover:text-emerald-300'
                  }`}
                >
                  <BarChart3 className="w-4 h-4" />
                  <span>Reportes</span>
                </button>
              </div>

            </div>
          </div>

        </div>

      </div>
    </section>
  );
};

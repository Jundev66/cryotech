import { useState, useRef, useEffect } from 'react';
import { useChatStore, type FlowType, type ButtonOption } from '@/stores/chat.store';
import { AppHeader } from '@/components/layout/app-header';
import { haptics } from '@/lib/native';
import {
  Send,
  Sparkles,
  Zap,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Bot,
  User,
  LayoutGrid,
  TrendingUp,
  Receipt,
  Bird,
  DollarSign,
  ClipboardList,
  Flame,
  ArrowRight,
} from 'lucide-react';

const SUGGESTIONS = [
  '🍗 Venta rápida',
  '📋 Registro de hoy',
  '💵 Ver tasa BCV',
  '🐣 Stock de pollos',
];

export function ChatPage() {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const {
    messages,
    isAiMode,
    isTyping,
    activeFlow,
    toggleAiMode,
    openMenu,
    startFlow,
    answerFlowStep,
    runQuickQuery,
    sendMessage,
    confirmDraft,
    cancelDraft,
    clearHistory,
  } = useChatStore();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isTyping) return;
    const text = input.trim();
    setInput('');
    await sendMessage(text);
  };

  const handleStartFlow = async (type: FlowType) => {
    await haptics.light();
    await startFlow(type);
  };

  const handleQuery = async (query: 'bcv' | 'stock' | 'debtors' | 'summary') => {
    await haptics.light();
    await runQuickQuery(query);
  };

  const handleButtonClick = async (btn: ButtonOption) => {
    await haptics.light();
    await answerFlowStep(btn.key || btn.id, btn.value, btn.label);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 pb-20">
      <AppHeader title="Asistente CryoTech" />

      {/* Mode Selector & Controls Bar */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-2 flex items-center justify-between">
        <button
          onClick={toggleAiMode}
          className={`touch-active flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
            isAiMode
              ? 'bg-purple-950/80 text-purple-300 border border-purple-700/60 shadow-sm shadow-purple-900/50'
              : 'bg-teal-950/80 text-teal-300 border border-teal-700/60 shadow-sm shadow-teal-900/50'
          }`}
        >
          {isAiMode ? (
            <>
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>Modo IA (Anthropic)</span>
            </>
          ) : (
            <>
              <Zap className="w-3.5 h-3.5 text-teal-400" />
              <span>Modo Rápido por Botones</span>
            </>
          )}
        </button>

        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              haptics.light();
              openMenu();
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
            title="Menú Principal"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-teal-400" />
            <span>Menú</span>
          </button>

          <button
            onClick={() => {
              haptics.light();
              clearHistory();
            }}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg"
            title="Reiniciar chat"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 max-w-lg mx-auto w-full no-scrollbar">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-2.5 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.sender === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400 shrink-0 mt-0.5">
                <Bot className="w-4 h-4" />
              </div>
            )}

            <div
              className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                msg.sender === 'user'
                  ? 'bg-teal-600 text-white rounded-tr-none'
                  : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none'
              }`}
            >
              <p className="whitespace-pre-line leading-relaxed">{msg.text}</p>

              {/* Categorized Command Center (Menu de Botones) */}
              {msg.showCategoryMenu && (
                <div className="mt-3.5 pt-3 border-t border-slate-800 space-y-3">
                  {/* Categoría: Granja */}
                  <div>
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-400 uppercase tracking-wider mb-1.5">
                      <Bird className="w-3.5 h-3.5" />
                      <span>Granja & Galpones</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        onClick={() => handleStartFlow('daily_log')}
                        className="touch-active bg-slate-950/80 hover:bg-slate-800/90 border border-slate-800/80 p-2.5 rounded-xl text-left flex items-start gap-2 transition-colors"
                      >
                        <ClipboardList className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="text-xs font-semibold text-slate-100">Registro Diario</div>
                          <div className="text-[10px] text-slate-400">Bajas, alimento, peso</div>
                        </div>
                      </button>

                      <button
                        onClick={() => handleStartFlow('processing')}
                        className="touch-active bg-slate-950/80 hover:bg-slate-800/90 border border-slate-800/80 p-2.5 rounded-xl text-left flex items-start gap-2 transition-colors"
                      >
                        <Flame className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="text-xs font-semibold text-slate-100">Beneficio</div>
                          <div className="text-[10px] text-slate-400">Faenar a cava</div>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Categoría: Comercial */}
                  <div>
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-teal-400 uppercase tracking-wider mb-1.5">
                      <DollarSign className="w-3.5 h-3.5" />
                      <span>Comercial & Ventas</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        onClick={() => handleStartFlow('sale')}
                        className="touch-active bg-teal-950/40 hover:bg-teal-900/50 border border-teal-700/50 p-2.5 rounded-xl text-left flex items-start gap-2 transition-colors col-span-2"
                      >
                        <Receipt className="w-4 h-4 text-teal-300 shrink-0 mt-0.5" />
                        <div>
                          <div className="text-xs font-bold text-teal-200">🍗 Venta Rápida de Pollos</div>
                          <div className="text-[10px] text-teal-300/80">Pollo vivo en pie o beneficiado en cava</div>
                        </div>
                      </button>

                      <button
                        onClick={() => handleStartFlow('payment')}
                        className="touch-active bg-slate-950/80 hover:bg-slate-800/90 border border-slate-800/80 p-2.5 rounded-xl text-left flex items-start gap-2 transition-colors"
                      >
                        <DollarSign className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="text-xs font-semibold text-slate-100">Cobrar Cuenta</div>
                          <div className="text-[10px] text-slate-400">Abonos de clientes</div>
                        </div>
                      </button>

                      <button
                        onClick={() => handleStartFlow('expense')}
                        className="touch-active bg-slate-950/80 hover:bg-slate-800/90 border border-slate-800/80 p-2.5 rounded-xl text-left flex items-start gap-2 transition-colors"
                      >
                        <TrendingUp className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="text-xs font-semibold text-slate-100">Registrar Gasto</div>
                          <div className="text-[10px] text-slate-400">Gasoil, fletes, jornales</div>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Categoría: Consultas Rápidas */}
                  <div>
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-sky-400 uppercase tracking-wider mb-1.5">
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span>Consultas Rápidas</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => handleQuery('bcv')}
                        className="touch-active text-xs bg-slate-950/90 border border-slate-800 px-3 py-1.5 rounded-lg text-slate-200 hover:border-slate-700 font-medium flex items-center gap-1"
                      >
                        <span>💵 Tasa BCV</span>
                      </button>

                      <button
                        onClick={() => handleQuery('stock')}
                        className="touch-active text-xs bg-slate-950/90 border border-slate-800 px-3 py-1.5 rounded-lg text-slate-200 hover:border-slate-700 font-medium flex items-center gap-1"
                      >
                        <span>🐣 Stock Aves</span>
                      </button>

                      <button
                        onClick={() => handleQuery('debtors')}
                        className="touch-active text-xs bg-slate-950/90 border border-slate-800 px-3 py-1.5 rounded-lg text-slate-200 hover:border-slate-700 font-medium flex items-center gap-1"
                      >
                        <span>📋 Clientes Deudores</span>
                      </button>

                      <button
                        onClick={() => handleQuery('summary')}
                        className="touch-active text-xs bg-slate-950/90 border border-slate-800 px-3 py-1.5 rounded-lg text-emerald-300 hover:border-emerald-700 font-medium flex items-center gap-1"
                      >
                        <span>📊 Cierre de Hoy</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Step-by-Step Flow Buttons / Chips */}
              {msg.buttons && msg.buttons.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-800 flex flex-wrap gap-1.5">
                  {msg.buttons.map((btn) => (
                    <button
                      key={btn.id}
                      onClick={() => handleButtonClick(btn)}
                      className={`touch-active text-xs px-3.5 py-2 rounded-xl font-semibold transition-all ${
                        btn.variant === 'primary'
                          ? 'bg-teal-500 hover:bg-teal-400 text-slate-950 shadow-sm'
                          : btn.variant === 'danger'
                          ? 'bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 border border-rose-800/60'
                          : btn.variant === 'secondary'
                          ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                          : 'bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-200'
                      }`}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Interactive Draft Confirmation Card */}
              {msg.draft && (
                <div className="mt-3 pt-3 border-t border-slate-800">
                  <div className="bg-slate-950/90 border border-teal-500/30 rounded-xl p-3 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-teal-400 uppercase tracking-wider text-[10px]">
                        Operación Lista para Guardar
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-teal-300 font-mono text-[10px]">
                        {msg.draft.intent}
                      </span>
                    </div>

                    <div className="text-xs text-slate-200 font-medium whitespace-pre-line bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                      {msg.draft.summary}
                    </div>

                    {msg.status === 'confirmed' ? (
                      <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold pt-1">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>¡Registrado exitosamente en el sistema!</span>
                      </div>
                    ) : msg.status === 'cancelled' ? (
                      <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium pt-1">
                        <XCircle className="w-4 h-4" />
                        <span>Operación cancelada</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 pt-1.5">
                        <button
                          onClick={() => confirmDraft(msg.id)}
                          className="touch-active flex-1 py-2.5 px-3 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-teal-950"
                        >
                          <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                          <span>Confirmar y Guardar</span>
                        </button>
                        <button
                          onClick={() => cancelDraft(msg.id)}
                          className="touch-active py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {msg.sender === 'user' && (
              <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 shrink-0 mt-0.5">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}

        {isTyping && (
          <div className="flex gap-2.5 items-center text-slate-400 text-xs">
            <div className="w-8 h-8 rounded-full bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl px-4 py-2.5 flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-bounce" />
              <div className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-bounce delay-100" />
              <div className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-bounce delay-200" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Suggestions Chips */}
      {messages.length <= 4 && (
        <div className="px-4 py-2 overflow-x-auto no-scrollbar flex gap-2 max-w-lg mx-auto w-full">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => {
                haptics.light();
                sendMessage(s);
              }}
              className="touch-active shrink-0 text-xs bg-slate-900 border border-slate-800 text-slate-300 px-3 py-1.5 rounded-full hover:border-slate-700 font-medium flex items-center gap-1"
            >
              <span>{s}</span>
              <ArrowRight className="w-3 h-3 text-teal-400" />
            </button>
          ))}
        </div>
      )}

      {/* Input Bar */}
      <div className="p-3 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 max-w-lg mx-auto w-full space-y-2">
        {/* Active Flow Typing Guidance */}
        {activeFlow && (
          <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-teal-950/60 border border-teal-700/40 text-[11px] text-teal-300">
            <span>
              {activeFlow.substep === 'manual_weight' || (activeFlow.type === 'sale' && activeFlow.step === 5)
                ? '⚖️ Ingresa el peso exacto en kg con el teclado (ej: 2.35 o 4.80)'
                : activeFlow.substep === 'new_client'
                ? '👤 Ingresa el nombre del nuevo cliente'
                : activeFlow.substep === 'manual_amount' || (activeFlow.type === 'payment' && activeFlow.step === 2)
                ? '💵 Ingresa el monto a cobrar en $ o Bs'
                : activeFlow.type === 'sale' && activeFlow.step === 4
                ? '🔢 Ingresa la cantidad de aves con el teclado'
                : '✍️ Puedes responder escribiendo con el teclado'}
            </span>
            <button
              onClick={clearHistory}
              className="text-[10px] text-teal-400 hover:text-teal-200 underline ml-2"
            >
              Reiniciar
            </button>
          </div>
        )}

        <form onSubmit={handleSend} className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              haptics.light();
              openMenu();
            }}
            className="touch-active w-11 h-11 rounded-xl bg-slate-800 hover:bg-slate-700 text-teal-400 flex items-center justify-center shrink-0 border border-slate-700"
            title="Menú de botones"
          >
            <LayoutGrid className="w-5 h-5" />
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              activeFlow?.substep === 'manual_weight' || (activeFlow?.type === 'sale' && activeFlow?.step === 5)
                ? 'Escribe los kilos (ej: 2.35 o 4.80)...'
                : activeFlow?.substep === 'new_client'
                ? 'Escribe el nombre del cliente...'
                : activeFlow?.substep === 'manual_amount' || (activeFlow?.type === 'payment' && activeFlow?.step === 2)
                ? 'Escribe el monto ($ o Bs)...'
                : 'O escribe una instrucción...'
            }
            className="flex-1 px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder:text-slate-500 text-sm focus:outline-none focus:border-teal-500 transition-colors"
          />

          <button
            type="submit"
            disabled={!input.trim() || isTyping}
            className="touch-active w-11 h-11 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 flex items-center justify-center shrink-0 disabled:opacity-40 transition-opacity font-bold"
          >
            <Send className="w-5 h-5 stroke-[2.2]" />
          </button>
        </form>
      </div>
    </div>
  );
}

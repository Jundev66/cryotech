import React from 'react';
import { ArrowRight, Sparkles, TrendingUp, DollarSign, Smartphone, ShieldCheck } from 'lucide-react';

interface HeroProps {
  onOpenWaitlist: () => void;
  onStartDemo?: () => void;
  demoLoading?: boolean;
}

export const Hero: React.FC<HeroProps> = ({ onOpenWaitlist, onStartDemo, demoLoading }) => {
  return (
    <section className="relative pt-24 pb-16 sm:pt-32 sm:pb-20 overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] sm:w-[550px] h-[250px] sm:h-[400px] bg-emerald-500/10 blur-[100px] rounded-full pointer-events-none" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 relative z-10 text-center">
        
        {/* Pill Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 border border-white/10 text-emerald-400 text-xs font-medium mb-6">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Gestión Avícola & Conversión Alimenticia</span>
        </div>

        {/* Main Headline */}
        <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-white leading-tight sm:leading-none mb-5">
          El control de tu granja avícola, <br className="hidden sm:inline" />
          <span className="text-emerald-400">del galpón a la venta final</span>
        </h1>

        {/* Subtitle */}
        <p className="text-sm sm:text-lg text-slate-300 max-w-2xl mx-auto mb-8 leading-relaxed">
          Optimiza la conversión de alimento (FCR), controla tus finanzas en dólares y bolívares a tasa oficial BCV, y registra en el corral sin necesidad de señal celular.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto mb-12">
          {onStartDemo ? (
            <button
              onClick={onStartDemo}
              disabled={demoLoading}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-sm text-slate-950 bg-emerald-400 hover:bg-emerald-300 active:scale-95 transition-all shadow-md shadow-emerald-500/20 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>{demoLoading ? 'Cargando Demo...' : 'Probar Demo en Vivo'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <a
              href="#app-mobile"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-sm text-slate-950 bg-emerald-400 hover:bg-emerald-300 active:scale-95 transition-all shadow-md shadow-emerald-500/20"
            >
              <Smartphone className="w-4 h-4" />
              <span>Conoce la App Móvil</span>
              <ArrowRight className="w-4 h-4" />
            </a>
          )}

          <button
            onClick={onOpenWaitlist}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium text-sm text-slate-200 bg-[#161b24] hover:bg-[#1e2532] border border-white/10 transition-all active:scale-95"
          >
            <Smartphone className="w-4 h-4 text-emerald-400" />
            <span>Descargar APK Móvil</span>
          </button>
        </div>

        {/* Modern Responsive Dashboard Preview Widget (NO overflow, sleek dark slate) */}
        <div className="w-full max-w-3xl mx-auto rounded-2xl bg-[#11151c] border border-white/10 p-4 sm:p-6 shadow-2xl text-left">
          
          {/* Header of widget */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-white/10 gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-semibold text-white font-mono uppercase tracking-wider">
                Lote Activo #14 — Cobb 500 (Día 38)
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">Tasa BCV Oficial:</span>
              <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 font-mono font-bold border border-emerald-800/50">
                36.85 Bs/$
              </span>
            </div>
          </div>

          {/* 3 Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4">
            <div className="p-3.5 rounded-xl bg-[#161c26] border border-white/5">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Conversión (FCR)</span>
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-xl font-bold text-white font-mono">1.68</div>
              <span className="text-[11px] text-emerald-400 font-medium">
                ★ 0.12 pts mejor que la meta
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-[#161c26] border border-white/5">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Población Actual</span>
                <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
              </div>
              <div className="text-xl font-bold text-white font-mono">4,860 aves</div>
              <span className="text-[11px] text-slate-400 font-medium">
                Mortalidad: 2.8% (Baja)
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-[#161c26] border border-white/5">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Ingreso Proyectado</span>
                <DollarSign className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="text-xl font-bold text-white font-mono">$41,850 USD</div>
              <span className="text-[11px] text-amber-400 font-mono">
                Bs 1,542,172 (BCV)
              </span>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
};

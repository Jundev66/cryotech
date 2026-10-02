import React, { useState } from 'react';
import { Check, ArrowRight } from 'lucide-react';

interface PricingProps {
  onOpenWaitlist: () => void;
}

export const Pricing: React.FC<PricingProps> = ({ onOpenWaitlist }) => {
  const [annualBilling, setAnnualBilling] = useState<boolean>(true);

  const plans = [
    {
      id: 'familiar',
      name: 'Granja Básica',
      description: 'Para pequeños productores con 1 a 2 galpones.',
      price: annualBilling ? 24 : 29,
      features: [
        'Hasta 2 galpones (5,000 aves/ciclo)',
        'Cálculo automático de FCR y mortalidad',
        'App móvil con Modo Offline para galpón',
        'Tasa oficial BCV en vivo en cabecera',
        'Bitácora de consumo y pesajes diarios',
      ],
      highlight: false,
      cta: 'Empezar Básico',
    },
    {
      id: 'pro',
      name: 'Productor Pro',
      description: 'Para granjas comerciales con control financiero total.',
      price: annualBilling ? 49 : 59,
      features: [
        'Hasta 10 galpones (35,000 aves/ciclo)',
        'Todo lo del plan Básico',
        'Bot de Telegram con lector OCR de comprobantes',
        'Curvas genéticas oficiales Cobb 500 y Ross 308',
        'Tesorería bi-monetaria multi-cuenta ($ y Bs)',
        'Multi-usuario con roles (Dueño y Galponeros)',
      ],
      highlight: true,
      cta: 'Probar Productor Pro',
    },
  ];

  return (
    <section id="precios" className="py-16 sm:py-20 bg-[#090b0e]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        
        {/* Header */}
        <div className="text-center max-w-xl mx-auto mb-10">
          <span className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider block mb-2">
            Planes Transparentes
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Precios simples, sin sorpresas
          </h2>

          {/* Toggle */}
          <div className="mt-4 flex items-center justify-center gap-3 text-xs">
            <span className={!annualBilling ? 'text-white font-medium' : 'text-slate-400'}>
              Mensual
            </span>
            <button
              onClick={() => setAnnualBilling(!annualBilling)}
              className="relative w-12 h-6 rounded-full bg-slate-800 p-0.5 transition-colors"
              aria-label="Facturación"
            >
              <div
                className={`w-5 h-5 rounded-full bg-emerald-400 transform transition-transform ${
                  annualBilling ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
            <div className="flex items-center gap-1.5">
              <span className={annualBilling ? 'text-white font-medium' : 'text-slate-400'}>
                Anual
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-300 font-mono font-bold border border-emerald-800/60">
                -20%
              </span>
            </div>
          </div>
        </div>

        {/* 2 Clean Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
          {plans.map((p) => (
            <div
              key={p.id}
              className={`rounded-2xl p-6 flex flex-col justify-between transition-all ${
                p.highlight
                  ? 'bg-[#141a24] border-2 border-emerald-400/80 shadow-xl'
                  : 'bg-[#11151c] border border-white/10'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-bold text-white font-display">
                    {p.name}
                  </h3>
                  {p.highlight && (
                    <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-400 text-slate-950 font-bold">
                      Popular
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mb-4">{p.description}</p>

                <div className="mb-5 pb-5 border-b border-white/10">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold text-white font-mono">
                      ${p.price}
                    </span>
                    <span className="text-xs text-slate-400">USD / mes</span>
                  </div>
                </div>

                <ul className="space-y-2.5 text-xs text-slate-300 mb-6">
                  {p.features.map((f, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                onClick={onOpenWaitlist}
                className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 active:scale-95 ${
                  p.highlight
                    ? 'bg-emerald-400 hover:bg-emerald-300 text-slate-950 shadow-md'
                    : 'bg-[#1a2230] hover:bg-[#222c3e] text-slate-200 border border-white/10'
                }`}
              >
                <span>{p.cta}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
};

import React, { useState } from 'react';
import { Bot, DollarSign, ClipboardList, TrendingUp, Check, Sparkles, Smartphone } from 'lucide-react';
import { MOBILE_APP_MODULES } from './demoData';

export const MobileAppFeatures: React.FC = () => {
  const [activeTab, setActiveTab] = useState<number>(0);

  return (
    <section id="chatbot" className="py-16 sm:py-24 bg-[#090d0b] relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-0 w-72 sm:w-96 h-72 sm:h-96 bg-emerald-600/5 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-72 sm:w-96 h-72 sm:h-96 bg-teal-600/5 blur-[100px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16 space-y-3 sm:space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950 border border-emerald-800 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
            <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
            <span>Módulos de la App Móvil</span>
          </div>
          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight">
            Todo el poder de CryoTech en la palma de tu mano
          </h2>
          <p className="text-emerald-100/70 text-xs sm:text-base leading-relaxed">
            Diseñada meticulosamente para simplificar la vida del productor avícola y sus operarios, eliminando la fricción y el papeleo.
          </p>
        </div>

        {/* 4 Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-14 sm:mb-20">
          {MOBILE_APP_MODULES.map((mod, idx) => {
            return (
              <div
                key={mod.id}
                onClick={() => setActiveTab(idx)}
                className={`rounded-2xl p-5 sm:p-6 bg-[#0c1410] border transition-all duration-300 flex flex-col justify-between cursor-pointer ${
                  activeTab === idx
                    ? 'border-emerald-500/80 shadow-lg shadow-emerald-950/60 scale-[1.01]'
                    : 'border-emerald-900/40 hover:border-emerald-700/50'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3.5">
                    <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-950 text-emerald-300 border border-emerald-800/60">
                      {mod.badge}
                    </span>
                    {idx === 0 && <Bot className="w-5 h-5 text-emerald-400" />}
                    {idx === 1 && <DollarSign className="w-5 h-5 text-amber-400" />}
                    {idx === 2 && <ClipboardList className="w-5 h-5 text-sky-400" />}
                    {idx === 3 && <TrendingUp className="w-5 h-5 text-purple-400" />}
                  </div>

                  <h3 className="text-base sm:text-lg font-bold text-white mb-1.5 font-display">
                    {mod.title}
                  </h3>
                  <p className="text-xs text-emerald-400/80 mb-3 font-medium">
                    {mod.subtitle}
                  </p>
                  <p className="text-xs text-emerald-200/70 leading-relaxed mb-4">
                    {mod.description}
                  </p>

                  <ul className="space-y-2 text-[11px] sm:text-xs text-emerald-100/80">
                    {mod.highlights.map((h, hIdx) => (
                      <li key={hIdx} className="flex items-start gap-2">
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-5 pt-3 border-t border-emerald-950/80 flex items-center justify-between text-[11px] text-emerald-400/80">
                  <span className="font-mono">Módulo #{idx + 1}</span>
                  <span className={`w-2 h-2 rounded-full ${activeTab === idx ? 'bg-emerald-400' : 'bg-emerald-800'}`}></span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Feature Spotlight Banner */}
        <div className="rounded-3xl bg-gradient-to-r from-[#0c1813] to-[#070d0a] border border-emerald-700/50 p-5 sm:p-8 shadow-2xl">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-emerald-400">
                <Sparkles className="w-4 h-4" />
                <span>ASISTENTE CONVERSACIONAL INTEGRADO</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-white">
                ¿Por qué un chatbot nativo dentro de la app?
              </h3>
              <p className="text-xs sm:text-sm text-emerald-200/80 leading-relaxed">
                Porque escribir en formularios con las manos ocupadas o en medio del corral es incómodo. Con el chatbot de CryoTech Mobile puedes presionar un botón como <strong>"🍗 Venta rápida"</strong> o escribir <em>"Vendí 20 pollos..."</em> y la app propone el asiento con la tasa del BCV en un instante.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 w-full md:w-auto shrink-0">
              <div className="p-3 rounded-xl bg-[#090d0b] border border-emerald-900/60 text-xs">
                <span className="text-emerald-400 font-bold block mb-0.5">Modo Rápido</span>
                <span className="text-emerald-200/70 text-[11px]">Flujos por botones táctiles</span>
              </div>
              <div className="p-3 rounded-xl bg-[#090d0b] border border-emerald-900/60 text-xs">
                <span className="text-purple-400 font-bold block mb-0.5">Modo IA</span>
                <span className="text-emerald-200/70 text-[11px]">Procesamiento inteligente</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
};

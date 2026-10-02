import React from 'react';
import { Smartphone, DollarSign, EyeOff, CheckCircle2, XCircle } from 'lucide-react';

export const ProblemSolution: React.FC = () => {
  const points = [
    {
      icon: Smartphone,
      title: 'Depender de Apps Externas vs Chatbot Móvil Propio',
      problem:
        'Usar WhatsApp o Telegram para registrar la granja expone tu operación a bloqueos de cuentas, cobro por plantillas de Meta, y falta de funcionamiento cuando se cae la señal en el galpón.',
      solution:
        'CryoTech tiene su propio Chatbot integrado directamente en la app móvil. Puedes interactuar por lenguaje natural o por botones rápidos táctiles, con persistencia y cola offline.',
    },
    {
      icon: DollarSign,
      title: 'Economía Bi-monetaria & Pérdidas por Tasa Desfasada',
      problem:
        'Comprar alimento en dólares, cobrar ventas por Pago Móvil en bolívares y calcular con tasas del día anterior. Una diferencia de apenas 2 a 5 Bs/USD genera fugas financieras graves.',
      solution:
        'La app móvil consulta la tasa oficial del Banco Central de Venezuela (BCV) en tiempo real y la mantiene visible en cabecera. Cada transacción se calcula en $ y Bs sin desfases.',
    },
    {
      icon: EyeOff,
      title: 'Costo Real por Lote y Control de Conversión (FCR)',
      problem:
        'Registrar alimento en cuadernos impide saber a tiempo si las aves están asimilando bien la comida o si hay desperdicio en las tolvas hasta que ya es tarde.',
      solution:
        'Curvas de ganancia de peso y cálculo de Conversión Alimenticia (FCR) día a día, comparadas con el estándar genético Cobb 500 y Ross 308 para cosechar en el peso óptimo.',
    },
  ];

  return (
    <section id="app-mobile" className="py-16 sm:py-24 bg-[#070b09] relative border-t border-b border-emerald-950/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16 space-y-3 sm:space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950 border border-emerald-800 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
            <span>Diseño Especializado en Granja</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-bold text-white tracking-tight">
            Por qué desarrollamos una app móvil nativa con chatbot propio
          </h2>
          <p className="text-emerald-100/70 text-xs sm:text-base leading-relaxed">
            Las soluciones genéricas de oficina no funcionan en el corral. CryoTech Mobile fue concebida para operar en el bolsillo del productor y su personal.
          </p>
        </div>

        {/* 3 Columns Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          {points.map((item, index) => {
            const Icon = item.icon;
            return (
              <div
                key={index}
                className="rounded-2xl bg-[#0b1310] border border-emerald-900/50 p-5 sm:p-6 flex flex-col justify-between hover:border-emerald-700/60 transition-all duration-300 shadow-xl"
              >
                <div>
                  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-emerald-950 flex items-center justify-center text-emerald-400 border border-emerald-800/80 mb-4 sm:mb-5">
                    <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  
                  <h3 className="text-base sm:text-lg font-bold text-white mb-3 sm:mb-4 font-display">
                    {item.title}
                  </h3>

                  {/* Problem */}
                  <div className="p-3 rounded-xl bg-red-950/25 border border-red-900/30 mb-3 sm:mb-4">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-red-400 mb-1">
                      <XCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>El Método Tradicional:</span>
                    </div>
                    <p className="text-xs text-red-200/75 leading-relaxed">
                      {item.problem}
                    </p>
                  </div>

                  {/* Solution */}
                  <div className="p-3 rounded-xl bg-emerald-950/35 border border-emerald-800/40">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 mb-1">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>CryoTech Mobile:</span>
                    </div>
                    <p className="text-xs text-emerald-200/80 leading-relaxed">
                      {item.solution}
                    </p>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-emerald-950/80 flex items-center justify-between text-xs text-emerald-400/80 font-mono">
                  <span>Ventaja #{index + 1}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};

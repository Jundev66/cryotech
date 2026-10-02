import React from 'react';
import { TrendingUp, DollarSign, Smartphone, Check } from 'lucide-react';

export const Features: React.FC = () => {
  const items = [
    {
      icon: TrendingUp,
      title: 'Conversión Alimenticia (FCR)',
      subtitle: 'Optimiza el alimento, tu mayor costo',
      description:
        'Compara día a día el peso de tus pollos contra las tablas oficiales de Cobb 500 y Ross 308. Detecta a tiempo problemas de asimilación o fugas de alimento en tolvas.',
      points: [
        'Curvas de ganancia de peso por edad',
        'Cálculo de FCR real vs meta genética',
        'Proyección de fecha óptima de cosecha',
      ],
      tag: 'Eficiencia',
    },
    {
      icon: DollarSign,
      title: 'Finanzas Bi-Monetarias (BCV)',
      subtitle: 'Cero pérdidas por tasa desfasada',
      description:
        'Insumos en dólares y cobros en bolívares. El sistema sincroniza automáticamente la cotización oficial del Banco Central de Venezuela para liquidar cada operación al valor real.',
      points: [
        'Tasa BCV oficial visible en cabecera',
        'Conversión automática en $ y Bs',
        'Control de ventas a crédito y abonos',
      ],
      tag: 'Economía',
    },
    {
      icon: Smartphone,
      title: 'App Móvil en Galpón (Offline)',
      subtitle: 'Registra en el corral sin señal',
      description:
        'Diseñada para operarios con guantes o bajo el sol. Guarda bajas y sacos de alimento en la memoria local y los sincroniza en la nube al recuperar cobertura.',
      points: [
        'Botones táctiles grandes y rápidos',
        'Modo Offline-First garantizado',
        'Lector OCR de comprobantes de pago',
      ],
      tag: 'Campo',
    },
  ];

  return (
    <section id="funciones" className="py-16 sm:py-20 bg-[#0c0f14] border-t border-b border-white/5">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider block mb-2">
            Todo lo necesario
          </span>
          <h2 className="text-2xl sm:text-4xl font-bold text-white tracking-tight">
            Diseñado para la realidad del productor avícola
          </h2>
        </div>

        {/* 3 Clean Bento Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {items.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={idx}
                className="rounded-2xl bg-[#11151c] border border-white/10 p-6 flex flex-col justify-between hover:border-emerald-500/40 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-white/5 text-slate-300 border border-white/10">
                      {item.tag}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-white mb-1 font-display">
                    {item.title}
                  </h3>
                  <p className="text-xs text-emerald-400/90 font-medium mb-3">
                    {item.subtitle}
                  </p>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-5">
                    {item.description}
                  </p>
                </div>

                <ul className="space-y-2 pt-4 border-t border-white/5 text-xs text-slate-300">
                  {item.points.map((p, pIdx) => (
                    <li key={pIdx} className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};

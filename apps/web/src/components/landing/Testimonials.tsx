import React from 'react';
import { Star, Quote, TrendingDown, Clock, ShieldCheck, MapPin } from 'lucide-react';

export const Testimonials: React.FC = () => {
  const testimonials = [
    {
      name: 'Ing. Carlos Mendoza',
      role: 'Gerente de Producción',
      farm: 'Granja Avícola El Samán',
      location: 'Calabozo, Guárico',
      capacity: '14,000 pollos / ciclo',
      breed: 'Cobb 500',
      metricBadge: 'FCR bajó de 1.84 a 1.67',
      metricIcon: TrendingDown,
      quote:
        'El mayor problema que teníamos era que los galponeros anotaban el alimento en pizarras que se borraban con el polvo. Con CryoTech en el teléfono registran los sacos en 20 segundos. En el primer lote nos dimos cuenta de que estábamos sobrealimentando en los días 30 a 35 y nos ahorramos casi 60 sacos de finalizador.',
    },
    {
      name: 'María Alejandra Bastidas',
      role: 'Administradora General',
      farm: 'Agropecuaria Mata & Hnos',
      location: 'San Juan de los Morros',
      capacity: '8,000 pollos / ciclo',
      breed: 'Ross 308',
      metricBadge: '0 errores en Pago Móvil',
      metricIcon: ShieldCheck,
      quote:
        'Vender pollo beneficiado al detal por Pago Móvil era una pesadilla para cuadrar la tasa BCV del día. Con el bot de Telegram, los choferes mandan la captura del pago y el OCR extrae el banco, referencia y monto al segundo. Se acabó la fuga de dinero por cobrar con la tasa de ayer.',
    },
    {
      name: 'Nelson Rivas',
      role: 'Productor Avícola Independiente',
      farm: 'Granja San Antonio',
      location: 'Barquisimeto, Lara',
      capacity: '6,500 pollos / ciclo',
      breed: 'Cobb 500',
      metricBadge: '2 horas diarias ahorradas',
      metricIcon: Clock,
      quote:
        'No soy de estar pegado a una computadora, ando siempre en el corral. Que la app funcione sin señal dentro del galpón y que además tenga el chatbot con botones rápidos para poner las bajas y pesadas hace que mi personal de verdad la use sin quejarse.',
    },
  ];

  return (
    <section className="py-16 sm:py-24 bg-[#090d0b] relative overflow-hidden border-t border-emerald-950/80">
      {/* Background ambient lighting */}
      <div className="absolute top-1/2 right-1/4 w-80 h-80 bg-emerald-500/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16 space-y-3 sm:space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950 border border-emerald-800 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
            <Quote className="w-3.5 h-3.5 text-emerald-400" />
            <span>Casos Reales en Terreno</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight">
            Validado en galpones reales, no en un laboratorio
          </h2>
          <p className="text-emerald-100/70 text-sm sm:text-base leading-relaxed">
            Nacimos de resolver los problemas cotidianos del productor: dos monedas, caminos de tierra sin señal celular y márgenes apretados por el costo del alimento.
          </p>
        </div>

        {/* Testimonials Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          {testimonials.map((t, idx) => {
            const Icon = t.metricIcon;

            return (
              <div
                key={idx}
                className="rounded-3xl bg-[#0c1410] border border-emerald-900/50 p-6 sm:p-7 flex flex-col justify-between hover:border-emerald-700/60 transition-all duration-300 shadow-xl"
              >
                <div>
                  {/* Rating stars & metric tag */}
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <div className="flex items-center gap-1 text-amber-400">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className="w-3.5 h-3.5 fill-current" />
                      ))}
                    </div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] font-mono font-bold">
                      <Icon className="w-3 h-3 text-emerald-400" />
                      <span>{t.metricBadge}</span>
                    </div>
                  </div>

                  {/* Quote */}
                  <p className="text-xs sm:text-sm text-emerald-100/80 leading-relaxed mb-6 italic">
                    "{t.quote}"
                  </p>
                </div>

                <div className="pt-4 border-t border-emerald-950/80 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-white font-display">
                      {t.name}
                    </h4>
                    <p className="text-[11px] text-emerald-400 font-medium">
                      {t.role} • {t.farm}
                    </p>
                    <div className="flex items-center gap-1 text-[10px] text-emerald-500/70 mt-0.5">
                      <MapPin className="w-3 h-3 text-emerald-500" />
                      <span>{t.location}</span>
                    </div>
                  </div>

                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#13231a] text-emerald-300 border border-emerald-800/60 shrink-0">
                    {t.breed}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Impact numbers strip */}
        <div className="mt-12 sm:mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 p-6 rounded-2xl bg-[#0c1410] border border-emerald-900/50 text-center">
          <div>
            <span className="block text-2xl sm:text-3xl font-extrabold text-white font-display">
              -0.15 pts
            </span>
            <span className="text-xs text-emerald-400/80 font-medium">Reducción promedio FCR</span>
          </div>
          <div>
            <span className="block text-2xl sm:text-3xl font-extrabold text-white font-display">
              100%
            </span>
            <span className="text-xs text-emerald-400/80 font-medium">Tasa oficial BCV verificada</span>
          </div>
          <div>
            <span className="block text-2xl sm:text-3xl font-extrabold text-white font-display">
              3 seg
            </span>
            <span className="text-xs text-emerald-400/80 font-medium">Lectura OCR de comprobantes</span>
          </div>
          <div>
            <span className="block text-2xl sm:text-3xl font-extrabold text-white font-display">
              0 bytes
            </span>
            <span className="text-xs text-emerald-400/80 font-medium">Pérdida de datos offline</span>
          </div>
        </div>

      </div>
    </section>
  );
};

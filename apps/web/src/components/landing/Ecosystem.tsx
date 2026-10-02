import React from 'react';
import { Monitor, Smartphone, MessageSquareText, Check, ArrowRight, Zap, Camera, Layers } from 'lucide-react';

interface EcosystemProps {
  onOpenWaitlist: () => void;
}

export const Ecosystem: React.FC<EcosystemProps> = ({ onOpenWaitlist }) => {
  return (
    <section id="ecosistema" className="py-16 sm:py-24 bg-[#060a08] relative overflow-hidden border-t border-emerald-950/80">
      {/* Decorative gradients */}
      <div className="absolute top-1/2 -left-40 w-96 h-96 bg-emerald-500/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute top-1/3 -right-40 w-96 h-96 bg-teal-500/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-14 sm:mb-20 space-y-3 sm:space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/90 border border-emerald-800 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            <span>Ecosistema Unificado</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight">
            Tres formas de operar tu granja, <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-200 bg-clip-text text-transparent">
              una sola fuente de verdad
            </span>
          </h2>
          <p className="text-emerald-100/70 text-sm sm:text-base leading-relaxed">
            Desde la comodidad del escritorio de oficina hasta el pasillo del galpón o la carretera con el camión: CryoTech conecta a todo tu equipo en tiempo real.
          </p>
        </div>

        {/* 3 Pillars Bento Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
          
          {/* Pillar 1: Web App */}
          <div className="rounded-3xl bg-[#0c1410] border border-emerald-900/50 p-6 sm:p-8 flex flex-col justify-between hover:border-emerald-700/60 transition-all duration-300 group shadow-xl">
            <div>
              <div className="flex items-center justify-between mb-5">
                <div className="w-12 h-12 rounded-2xl bg-emerald-950/80 border border-emerald-800/80 flex items-center justify-center text-emerald-400 shadow-inner group-hover:scale-105 transition-transform">
                  <Monitor className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
                  Para Administración
                </span>
              </div>

              <h3 className="text-xl font-bold text-white mb-2 font-display">
                Plataforma Web Integral
              </h3>
              <p className="text-xs text-emerald-400/90 font-medium mb-3">
                El centro de comando financiero y productivo
              </p>
              <p className="text-xs sm:text-sm text-emerald-200/70 leading-relaxed mb-6">
                Diseñada para el productor y el equipo contable. Visualiza curvas de crecimiento comparadas con la raza Cobb 500, tesorería bi-monetaria, arqueo de cuentas y facturación.
              </p>

              <ul className="space-y-2.5 text-xs text-emerald-100/80 pb-6 border-b border-emerald-950">
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Curvas de ganancia de peso y FCR en tiempo real</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Cuentas por cobrar, fiados y abonos parciales</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Control de roles: Dueño, Administrador, Galponero</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Exportación de reportes para auditoría y contabilidad</span>
                </li>
              </ul>
            </div>

            <div className="pt-6">
              <a
                href="#vistas"
                className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-400 hover:text-emerald-300 group-hover:translate-x-1 transition-all"
              >
                <span>Explorar vistas de la plataforma</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Pillar 2: Mobile App (Highlighted) */}
          <div className="rounded-3xl bg-gradient-to-b from-[#101e17] to-[#0c1410] border-2 border-emerald-500/70 p-6 sm:p-8 flex flex-col justify-between relative shadow-2xl shadow-emerald-950/80 group">
            {/* Spotlight badge */}
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-emerald-400 text-emerald-950 font-bold text-[11px] font-mono shadow-md uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>Mobile-First en Campo</span>
            </div>

            <div>
              <div className="flex items-center justify-between mb-5 mt-2">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300 shadow-inner group-hover:scale-105 transition-transform">
                  <Smartphone className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700/80">
                  En el Galpón
                </span>
              </div>

              <h3 className="text-xl font-bold text-white mb-2 font-display">
                App Móvil con Chatbot Propio
              </h3>
              <p className="text-xs text-emerald-400/90 font-medium mb-3">
                Táctil, rápida y resistente a la falta de señal
              </p>
              <p className="text-xs sm:text-sm text-emerald-200/70 leading-relaxed mb-6">
                Especialmente creada para manos con guantes o bajo el sol del corral. Botones de gran tamaño, asistente interno por texto o voz y tasa BCV siempre visible en cabecera.
              </p>

              <ul className="space-y-2.5 text-xs text-emerald-100/80 pb-6 border-b border-emerald-900/60">
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>Modo Offline-First</strong>: guarda datos sin señal y sincroniza al volver</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Chatbot interno con <strong>Modo Rápido</strong> y <strong>Modo IA</strong></span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Tasa oficial BCV en vivo para liquidar al instante en Bs y $</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Entrada rápida de sacos de alimento, bajas y pesajes</span>
                </li>
              </ul>
            </div>

            <div className="pt-6">
              <a
                href="#demo"
                className="w-full py-2.5 px-4 rounded-xl font-bold text-xs text-center text-[#022c22] bg-emerald-400 hover:bg-emerald-300 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-md shadow-emerald-500/20"
              >
                <span>Probar Simulador Móvil en Vivo</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Pillar 3: Telegram & WhatsApp Bot with OCR */}
          <div className="rounded-3xl bg-[#0c1410] border border-emerald-900/50 p-6 sm:p-8 flex flex-col justify-between hover:border-emerald-700/60 transition-all duration-300 group shadow-xl">
            <div>
              <div className="flex items-center justify-between mb-5">
                <div className="w-12 h-12 rounded-2xl bg-emerald-950/80 border border-emerald-800/80 flex items-center justify-center text-emerald-400 shadow-inner group-hover:scale-105 transition-transform">
                  <MessageSquareText className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
                  Lectura OCR
                </span>
              </div>

              <h3 className="text-xl font-bold text-white mb-2 font-display">
                Bot de Mensajería con OCR
              </h3>
              <p className="text-xs text-emerald-400/90 font-medium mb-3">
                Telegram y WhatsApp directo a tu base de datos
              </p>
              <p className="text-xs sm:text-sm text-emerald-200/70 leading-relaxed mb-6">
                ¿Te pagaron por Pago Móvil o transferencia? Envía la captura de pantalla al bot: nuestro motor OCR lee el comprobante y genera el cobro en segundos.
              </p>

              <ul className="space-y-2.5 text-xs text-emerald-100/80 pb-6 border-b border-emerald-950">
                <li className="flex items-start gap-2.5">
                  <Camera className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Lectura de capturas: Banesco, Mercantil, Venezuela, Zelle</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Detección de referencia, banco, monto y fecha de operación</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Registro por notas de voz ("ayer salieron 300 pollos a $4")</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Lista blanca de remitentes para máxima seguridad contable</span>
                </li>
              </ul>
            </div>

            <div className="pt-6">
              <button
                onClick={onOpenWaitlist}
                className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-400 hover:text-emerald-300 group-hover:translate-x-1 transition-all"
              >
                <span>Ver cómo funciona el bot OCR</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
};

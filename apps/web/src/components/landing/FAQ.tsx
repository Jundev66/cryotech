import React, { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';

export const FAQ: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
      q: '¿Cómo funciona la lectura automática de comprobantes de pago (OCR)?',
      a: 'Tanto desde Telegram como desde WhatsApp o la plataforma web, puedes enviar una foto o captura de pantalla de un comprobante de Pago Móvil o transferencia bancaria (Banesco, Banco de Venezuela, Mercantil, Provincial, Zelle, etc.). Nuestro motor de OCR extrae en 3 segundos el número de referencia, banco emisor, monto y fecha de operación, proponiendo el asiento contable listo para confirmar con un solo clic.',
    },
    {
      q: '¿Por qué la tasa del BCV es tan crítica y cómo la actualiza CryoTech?',
      a: 'En Venezuela, los insumos y alimentos se cotizan en dólares pero las ventas al mayor o detal suelen cobrarse en bolívares. Usar APIs no oficiales o tasas aproximadas puede generar una diferencia de hasta 5 Bs/USD, lo que en un lote de 2,000 pollos significa cientos de dólares de pérdida invisible. CryoTech consulta directamente la cotización oficial del Banco Central de Venezuela (BCV) en tiempo real, garantizando que cada venta y compra quede registrada a la tasa legal exacta del día.',
    },
    {
      q: '¿Puedo usar la aplicación si no hay señal celular o internet en el galpón?',
      a: 'Sí, absolutamente. La app móvil de CryoTech está diseñada con arquitectura Offline-First. En medio del corral, sin WiFi ni datos móviles, puedes registrar los sacos de alimento suministrados, las bajas del día y las pesadas de control. Las operaciones quedan guardadas en el almacenamiento seguro de tu teléfono y se sincronizan automáticamente con la nube en cuanto vuelves a tener conexión.',
    },
    {
      q: '¿Qué razas y parámetros genéticos están calibrados en el sistema?',
      a: 'CryoTech viene pre-calibrado con las tablas de rendimiento oficiales mundiales de las dos principales líneas genéticas comerciales: Cobb 500 y Ross 308. El sistema compara diariamente la ganancia de peso en gramos y el consumo acumulado de alimento contra el estándar de la raza, alertándote de inmediato si el Índice de Conversión Alimenticia (FCR) se desvía del objetivo.',
    },
    {
      q: '¿Puedo limitar el acceso a mis galponeros o capataces para que no vean los números financieros?',
      a: 'Sí. El sistema cuenta con control de roles granulares (Dueño, Administrador, Galponero, Chofer/Despachador). Los operarios de campo solo tienen acceso a la bitácora de alimento, mortalidad y pesaje, mientras que los saldos de tesorería, cuentas bancarias, costos y márgenes de ganancia quedan exclusivamente reservados para el dueño y su administración.',
    },
    {
      q: '¿Cómo solicito acceso para probar la APK o la demostración del sistema?',
      a: 'Haz clic en el botón "Solicitar Demo / APK" en esta página y déjanos los datos de tu granja. Nos pondremos en contacto contigo para coordinar el acceso y entregarte las credenciales de prueba adaptadas a la cantidad de galpones y aves de tu operación.',
    },
  ];

  return (
    <section id="faq" className="py-16 sm:py-24 bg-[#090d0b] relative border-t border-emerald-950/60 overflow-hidden">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center mb-10 sm:mb-14 space-y-3 sm:space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950 border border-emerald-800 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
            <HelpCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span>Preguntas Frecuentes</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-bold text-white tracking-tight">
            Respuestas claras para el productor avícola
          </h2>
          <p className="text-emerald-100/70 text-xs sm:text-base">
            Conoce los detalles sobre el OCR de comprobantes, la tasa oficial BCV y la operación offline en granja.
          </p>
        </div>

        {/* Accordion */}
        <div className="space-y-3">
          {faqs.map((faq, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div
                key={idx}
                className="rounded-2xl bg-[#0c1410] border border-emerald-900/50 overflow-hidden transition-colors"
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : idx)}
                  className="w-full p-4 sm:p-5 text-left flex items-center justify-between gap-4 hover:bg-emerald-950/30 transition-colors"
                >
                  <span className="font-semibold text-white text-xs sm:text-base font-display">
                    {faq.q}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 shrink-0 transition-transform duration-200 ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 sm:px-5 sm:pb-5 pt-1 text-xs sm:text-sm text-emerald-200/80 leading-relaxed border-t border-emerald-950/80 bg-[#090e0b]/50">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};

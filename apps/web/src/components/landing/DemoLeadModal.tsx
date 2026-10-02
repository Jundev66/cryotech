import React, { useState } from 'react';
import { X, Sparkles, Loader2, ArrowRight, ShieldCheck } from 'lucide-react';

export interface LeadInfo {
  fullName: string;
  email: string;
  phone: string;
  farmSize: string;
}

interface DemoLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (lead: LeadInfo) => void;
  isLoading: boolean;
}

export const DemoLeadModal: React.FC<DemoLeadModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isLoading,
}) => {
  const [formData, setFormData] = useState<LeadInfo>({
    fullName: '',
    email: '',
    phone: '',
    farmSize: '5000-15000',
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const existing = JSON.parse(localStorage.getItem('cryotech_demo_leads') || '[]');
      existing.push({ ...formData, timestamp: new Date().toISOString() });
      localStorage.setItem('cryotech_demo_leads', JSON.stringify(existing));
    } catch {
      // fallback
    }
    onSubmit(formData);
  };

  const handleSkip = () => {
    onSubmit({
      fullName: 'Productor Invitado',
      email: '',
      phone: '',
      farmSize: '1000-5000',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-md rounded-3xl bg-[#090e0c] border border-emerald-500/40 p-6 sm:p-8 shadow-2xl shadow-emerald-950/90 text-left">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Badge & Header */}
        <div className="mb-6 space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Acceso Instantáneo a la Demo</span>
          </div>
          <h3 className="text-xl sm:text-2xl font-bold text-white font-display">
            Personaliza tu Demostración
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Ingresa tus datos para generar un entorno con datos acordes a tu escala productiva.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 font-medium mb-1">Tu Nombre o Granja *</label>
            <input
              type="text"
              required
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              placeholder="Ej. Carlos Mata / Granja El Sol"
              className="w-full bg-[#131b17] text-white px-3.5 py-2.5 rounded-xl border border-emerald-500/30 focus:outline-none focus:border-emerald-400 text-xs placeholder:text-slate-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">WhatsApp / Teléfono *</label>
              <input
                type="tel"
                required
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+58 412 1234567"
                className="w-full bg-[#131b17] text-white px-3.5 py-2.5 rounded-xl border border-emerald-500/30 focus:outline-none focus:border-emerald-400 text-xs placeholder:text-slate-500"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">Correo Electrónico</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="carlos@correo.com"
                className="w-full bg-[#131b17] text-white px-3.5 py-2.5 rounded-xl border border-emerald-500/30 focus:outline-none focus:border-emerald-400 text-xs placeholder:text-slate-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Capacidad / Población de Aves</label>
            <select
              value={formData.farmSize}
              onChange={(e) => setFormData({ ...formData, farmSize: e.target.value })}
              className="w-full bg-[#131b17] text-white px-3.5 py-2.5 rounded-xl border border-emerald-500/30 focus:outline-none focus:border-emerald-400 text-xs"
            >
              <option value="500-2000">500 a 2,000 aves (Pequeño productor)</option>
              <option value="2000-10000">2,000 a 10,000 aves (Mediano productor)</option>
              <option value="10000-30000">10,000 a 30,000 aves (Comercial)</option>
              <option value="30000+">Más de 30,000 aves (Industrial)</option>
              <option value="investor">Iniciando nuevo proyecto / Inversionista</option>
            </select>
          </div>

          <div className="pt-3 space-y-2">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-emerald-950 font-bold text-xs tracking-wide transition-all shadow-lg shadow-emerald-500/20 active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Preparando tu Granja Demo...</span>
                </>
              ) : (
                <>
                  <span>Ingresar a la Demostración</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <button
              type="button"
              disabled={isLoading}
              onClick={handleSkip}
              className="w-full py-2 text-[11px] text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            >
              Omitir e ingresar como invitado anónimo
            </button>
          </div>

          <div className="flex items-center justify-center gap-1.5 text-[10px] text-emerald-500/60 pt-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Datos 100% seguros y privados. Sin tarjeta de crédito.</span>
          </div>
        </form>
      </div>
    </div>
  );
};

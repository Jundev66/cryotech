import React, { useState } from 'react';
import { X, Sparkles, Loader2, ArrowRight, ShieldCheck, Mail, User } from 'lucide-react';

export interface LeadInfo {
  email: string;
  fullName?: string;
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
    email: '',
    fullName: '',
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email.trim()) return;

    try {
      const existing = JSON.parse(localStorage.getItem('cryotech_demo_leads') || '[]');
      existing.push({ ...formData, timestamp: new Date().toISOString() });
      localStorage.setItem('cryotech_demo_leads', JSON.stringify(existing));
    } catch {
      // fallback
    }
    onSubmit({
      email: formData.email.trim(),
      fullName: formData.fullName?.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-md rounded-3xl bg-[#090e0c] border border-emerald-500/40 p-6 sm:p-8 shadow-2xl shadow-emerald-950/90 text-left">
        {/* Close */}
        <button
          onClick={onClose}
          disabled={isLoading}
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
            Prueba CryoTech en Vivo
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Ingresa tu correo para generar tu granja avícola de demostración con datos reales de producción y tesorería.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 font-medium mb-1.5 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-emerald-400" />
              <span>Correo Electrónico *</span>
            </label>
            <input
              type="email"
              required
              autoFocus
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="tu@correo.com"
              className="w-full bg-[#131b17] text-white px-3.5 py-2.5 rounded-xl border border-emerald-500/30 focus:outline-none focus:border-emerald-400 text-xs placeholder:text-slate-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span>Tu Nombre (Opcional)</span>
            </label>
            <input
              type="text"
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              placeholder="Ej. Juan Mata"
              className="w-full bg-[#131b17] text-white px-3.5 py-2.5 rounded-xl border border-emerald-500/30 focus:outline-none focus:border-emerald-400 text-xs placeholder:text-slate-500"
            />
          </div>

          <div className="pt-2 space-y-2">
            <button
              type="submit"
              disabled={isLoading || !formData.email.trim()}
              className="w-full py-3.5 px-4 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-emerald-950 font-bold text-xs tracking-wide transition-all shadow-lg shadow-emerald-500/20 active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Aprovisionando Granja Demo...</span>
                </>
              ) : (
                <>
                  <span>Ingresar a la Demostración</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

          <div className="flex items-center justify-center gap-1.5 text-[10px] text-emerald-500/60 pt-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Entorno efímero aislado (2 horas de vigencia). Sin tarjeta de crédito.</span>
          </div>
        </form>
      </div>
    </div>
  );
};

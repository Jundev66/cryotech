import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { demoLeadSchema, type DemoLeadInput } from '@cryotech/shared-types';
import { X, Sparkles, Loader2, ArrowRight, ShieldCheck, Mail, User, AlertCircle } from 'lucide-react';

export type LeadInfo = DemoLeadInput;

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
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DemoLeadInput>({
    resolver: zodResolver(demoLeadSchema),
    defaultValues: {
      email: '',
      fullName: '',
    },
    mode: 'onTouched',
  });

  useEffect(() => {
    if (isOpen) {
      reset({ email: '', fullName: '' });
    }
  }, [isOpen, reset]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  const onFormSubmit = (data: DemoLeadInput) => {
    try {
      const existing = JSON.parse(localStorage.getItem('cryotech_demo_leads') || '[]');
      existing.push({ ...data, timestamp: new Date().toISOString() });
      localStorage.setItem('cryotech_demo_leads', JSON.stringify(existing));
    } catch {
      // fallback
    }
    onSubmit(data);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-md rounded-3xl bg-[#090e0c] border border-emerald-500/40 p-6 sm:p-8 shadow-2xl shadow-emerald-950/90 text-left">
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-50"
          aria-label="Cerrar modal"
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

        {/* Form with noValidate to disable ugly native HTML tooltips */}
        <form onSubmit={handleSubmit(onFormSubmit)} noValidate className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 font-medium mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-emerald-400" />
                <span>Correo Electrónico *</span>
              </span>
            </label>
            <div className="relative">
              <input
                type="email"
                {...register('email')}
                autoFocus
                disabled={isLoading}
                placeholder="tu@correo.com"
                className={`w-full bg-[#131b17] text-white px-3.5 py-2.5 rounded-xl border text-xs placeholder:text-slate-500 transition-colors focus:outline-none ${
                  errors.email
                    ? 'border-rose-500/80 focus:border-rose-400 focus:ring-1 focus:ring-rose-500/40'
                    : 'border-emerald-500/30 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30'
                }`}
              />
              {errors.email && (
                <div className="absolute right-3 top-2.5 text-rose-400 pointer-events-none">
                  <AlertCircle className="w-4 h-4" />
                </div>
              )}
            </div>
            {errors.email && (
              <p className="mt-1.5 flex items-center gap-1 text-[11px] text-rose-400 font-medium animate-in fade-in">
                <span>{errors.email.message}</span>
              </p>
            )}
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span>Tu Nombre (Opcional)</span>
            </label>
            <input
              type="text"
              {...register('fullName')}
              disabled={isLoading}
              placeholder="Ej. Juan Mata"
              className={`w-full bg-[#131b17] text-white px-3.5 py-2.5 rounded-xl border text-xs placeholder:text-slate-500 transition-colors focus:outline-none ${
                errors.fullName
                  ? 'border-rose-500/80 focus:border-rose-400 focus:ring-1 focus:ring-rose-500/40'
                  : 'border-emerald-500/30 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30'
              }`}
            />
            {errors.fullName && (
              <p className="mt-1.5 text-[11px] text-rose-400 font-medium animate-in fade-in">
                {errors.fullName.message}
              </p>
            )}
          </div>

          <div className="pt-2 space-y-2">
            <button
              type="submit"
              disabled={isLoading}
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

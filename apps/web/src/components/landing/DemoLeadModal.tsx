import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createDemoLeadSchema, type CreateDemoLeadInput } from '@cryotech/shared-types';
import {
  X,
  Sparkles,
  Loader2,
  ArrowRight,
  ShieldCheck,
  Mail,
  User,
  Phone,
  Layers,
  AlertCircle,
} from 'lucide-react';

export type LeadInfo = CreateDemoLeadInput;

interface DemoLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (lead: LeadInfo) => void;
  isLoading: boolean;
  source?: 'erp_landing' | 'erp_login';
}

export const DemoLeadModal: React.FC<DemoLeadModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isLoading,
  source = 'erp_landing',
}) => {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateDemoLeadInput>({
    resolver: zodResolver(createDemoLeadSchema),
    defaultValues: {
      fullName: '',
      phone: '',
      email: '',
      farmSize: '500-2000',
      source,
    },
    mode: 'onTouched',
  });

  useEffect(() => {
    if (isOpen) {
      reset({
        fullName: '',
        phone: '',
        email: '',
        farmSize: '500-2000',
        source,
      });
    }
  }, [isOpen, reset, source]);

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

  const onFormSubmit = (data: CreateDemoLeadInput) => {
    try {
      const existing = JSON.parse(localStorage.getItem('cryotech_demo_leads') || '[]');
      existing.push({ ...data, timestamp: new Date().toISOString() });
      localStorage.setItem('cryotech_demo_leads', JSON.stringify(existing));
    } catch {
      // fallback
    }
    onSubmit({
      ...data,
      source,
    });
  };

  const handleSkip = () => {
    onSubmit({
      fullName: 'Productor Invitado',
      phone: '+58 000 0000000',
      email: '',
      farmSize: '500-2000',
      source,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-md rounded-3xl bg-[#090e0c] border border-emerald-500/40 p-6 sm:p-8 shadow-2xl shadow-emerald-950/90 text-left">
        {/* Close Button */}
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
        <div className="mb-5 space-y-1.5">
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
        <form onSubmit={handleSubmit(onFormSubmit)} noValidate className="space-y-3.5 text-xs">
          {/* Nombre o Granja */}
          <div>
            <label className="block text-slate-300 font-medium mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-emerald-400" />
                <span>Tu Nombre o Granja *</span>
              </span>
            </label>
            <div className="relative">
              <input
                type="text"
                {...register('fullName')}
                autoFocus
                disabled={isLoading}
                placeholder="Ej. Carlos Mata / Granja El Sol"
                className={`w-full bg-[#131b17] text-white px-3.5 py-2.5 rounded-xl border text-xs placeholder:text-slate-500 transition-colors focus:outline-none ${
                  errors.fullName
                    ? 'border-rose-500/80 focus:border-rose-400 focus:ring-1 focus:ring-rose-500/40'
                    : 'border-emerald-500/30 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30'
                }`}
              />
              {errors.fullName && (
                <div className="absolute right-3 top-2.5 text-rose-400 pointer-events-none">
                  <AlertCircle className="w-4 h-4" />
                </div>
              )}
            </div>
            {errors.fullName && (
              <p className="mt-1 text-[11px] text-rose-400 font-medium">
                {errors.fullName.message}
              </p>
            )}
          </div>

          {/* Telefono / WhatsApp y Correo en 2 columnas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-emerald-400" />
                  <span>WhatsApp / Teléfono *</span>
                </span>
              </label>
              <div className="relative">
                <input
                  type="tel"
                  {...register('phone')}
                  disabled={isLoading}
                  placeholder="+58 412 1234567"
                  className={`w-full bg-[#131b17] text-white px-3.5 py-2.5 rounded-xl border text-xs placeholder:text-slate-500 font-mono transition-colors focus:outline-none ${
                    errors.phone
                      ? 'border-rose-500/80 focus:border-rose-400 focus:ring-1 focus:ring-rose-500/40'
                      : 'border-emerald-500/30 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30'
                  }`}
                />
                {errors.phone && (
                  <div className="absolute right-3 top-2.5 text-rose-400 pointer-events-none">
                    <AlertCircle className="w-4 h-4" />
                  </div>
                )}
              </div>
              {errors.phone && (
                <p className="mt-1 text-[11px] text-rose-400 font-medium">
                  {errors.phone.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span>Correo Electrónico</span>
                </span>
              </label>
              <div className="relative">
                <input
                  type="email"
                  {...register('email')}
                  disabled={isLoading}
                  placeholder="carlos@correo.com"
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
                <p className="mt-1 text-[11px] text-rose-400 font-medium">
                  {errors.email.message}
                </p>
              )}
            </div>
          </div>

          {/* Capacidad / Poblacion */}
          <div>
            <label className="block text-slate-300 font-medium mb-1 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              <span>Capacidad / Población de Aves</span>
            </label>
            <select
              {...register('farmSize')}
              disabled={isLoading}
              className="w-full bg-[#131b17] text-white px-3.5 py-2.5 rounded-xl border border-emerald-500/30 focus:border-emerald-400 focus:outline-none text-xs"
            >
              <option value="500-2000">500 a 2,000 aves (Pequeño productor)</option>
              <option value="2000-10000">2,000 a 10,000 aves (Mediano productor)</option>
              <option value="10000-30000">10,000 a 30,000 aves (Comercial)</option>
              <option value="30000+">Más de 30,000 aves (Industrial)</option>
              <option value="investor">Iniciando nuevo proyecto / Inversionista</option>
            </select>
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
            <span>Entorno efímero aislado (2 horas de vigencia). Sin tarjeta de crédito.</span>
          </div>
        </form>
      </div>
    </div>
  );
};

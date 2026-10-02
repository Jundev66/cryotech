import React, { useState } from 'react';
import { X, CheckCircle, Smartphone } from 'lucide-react';

interface EarlyAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EarlyAccessModal: React.FC<EarlyAccessModalProps> = ({ isOpen, onClose }) => {
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [formData, setFormData] = useState({
    fullName: '',
    farmName: '',
    location: '',
    birdCapacity: '1000-5000',
    phone: '',
    email: '',
    deviceOs: 'android',
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const existing = JSON.parse(localStorage.getItem('cryotech_pilot_requests') || '[]');
      existing.push({ ...formData, timestamp: new Date().toISOString() });
      localStorage.setItem('cryotech_pilot_requests', JSON.stringify(existing));
    } catch {
      // fallback
    }
    setSubmitted(true);
  };

  const handleReset = () => {
    setSubmitted(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg rounded-3xl bg-[#0c1410] border border-emerald-700/60 p-5 sm:p-8 shadow-2xl shadow-emerald-950/80 max-h-[92vh] overflow-y-auto">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-emerald-400 hover:text-white hover:bg-emerald-950 transition-colors"
          aria-label="Cerrar modal"
        >
          <X className="w-5 h-5" />
        </button>

        {!submitted ? (
          <div>
            {/* Header */}
            <div className="mb-5 sm:mb-6 space-y-1.5 sm:space-y-2 pr-6">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-950 border border-emerald-800 text-emerald-400 text-[11px] font-mono font-bold">
                <Smartphone className="w-3.5 h-3.5" />
                <span>Acceso a la APK Demo</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-white font-display">
                Solicita Acceso a CryoTech Mobile
              </h3>
              <p className="text-xs text-emerald-200/70 leading-relaxed">
                Dado que la app se encuentra en fase de demo privado, distribuimos la APK de prueba a productores seleccionados. Déjanos tus datos para postular tu granja:
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-3.5 sm:space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-emerald-300 font-medium mb-1">Nombre Completo *</label>
                  <input
                    type="text"
                    required
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    placeholder="Ej. Carlos Mata"
                    className="w-full bg-[#121f18] text-white px-3 py-2 rounded-xl border border-emerald-800/60 focus:outline-none focus:border-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-emerald-300 font-medium mb-1">Nombre de la Granja *</label>
                  <input
                    type="text"
                    required
                    value={formData.farmName}
                    onChange={(e) => setFormData({ ...formData, farmName: e.target.value })}
                    placeholder="Ej. Granja Los Andes"
                    className="w-full bg-[#121f18] text-white px-3 py-2 rounded-xl border border-emerald-800/60 focus:outline-none focus:border-emerald-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-emerald-300 font-medium mb-1">Ubicación (Estado/Ciudad) *</label>
                  <input
                    type="text"
                    required
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    placeholder="Ej. Portuguesa, Acarigua"
                    className="w-full bg-[#121f18] text-white px-3 py-2 rounded-xl border border-emerald-800/60 focus:outline-none focus:border-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-emerald-300 font-medium mb-1">Capacidad por Ciclo *</label>
                  <select
                    value={formData.birdCapacity}
                    onChange={(e) => setFormData({ ...formData, birdCapacity: e.target.value })}
                    className="w-full bg-[#121f18] text-white px-3 py-2 rounded-xl border border-emerald-800/60 focus:outline-none focus:border-emerald-400"
                  >
                    <option value="500-1000">500 a 1,000 aves</option>
                    <option value="1000-5000">1,000 a 5,000 aves</option>
                    <option value="5000-15000">5,000 a 15,000 aves</option>
                    <option value="15000+">Más de 15,000 aves</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-emerald-300 font-medium mb-1">Teléfono de Contacto *</label>
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+58 412 1234567"
                    className="w-full bg-[#121f18] text-white px-3 py-2 rounded-xl border border-emerald-800/60 focus:outline-none focus:border-emerald-400 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-emerald-300 font-medium mb-1">Sistema Operativo *</label>
                  <select
                    value={formData.deviceOs}
                    onChange={(e) => setFormData({ ...formData, deviceOs: e.target.value })}
                    className="w-full bg-[#121f18] text-white px-3 py-2 rounded-xl border border-emerald-800/60 focus:outline-none focus:border-emerald-400"
                  >
                    <option value="android">Android (APK Instalable)</option>
                    <option value="ios">iOS (Apple TestFlight)</option>
                    <option value="web">Navegador Web / Tablet</option>
                  </select>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3 px-4 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-emerald-950 font-bold text-xs sm:text-sm tracking-wide transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
                >
                  Solicitar APK para mi Granja
                </button>
              </div>

              <p className="text-[10px] sm:text-[11px] text-emerald-500/60 text-center">
                🔒 Tus datos se manejan con estricta confidencialidad. Sin spam.
              </p>
            </form>
          </div>
        ) : (
          <div className="py-6 text-center space-y-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8 sm:w-10 sm:h-10" />
            </div>

            <h3 className="text-xl sm:text-2xl font-bold text-white font-display">
              ¡Postulación Registrada!
            </h3>

            <p className="text-xs sm:text-sm text-emerald-200/80 max-w-sm mx-auto leading-relaxed">
              Hemos guardado la información de <strong className="text-white">{formData.farmName}</strong>. Te contactaremos para coordinar la instalación de la APK y activar tus credenciales del demo.
            </p>

            <div className="pt-2">
              <button
                onClick={handleReset}
                className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-bold text-xs rounded-xl transition-colors"
              >
                Volver a la Página
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

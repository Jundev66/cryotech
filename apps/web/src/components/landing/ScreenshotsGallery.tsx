import React, { useState } from 'react';
import { REAL_SCREENSHOTS } from './demoData';

export const ScreenshotsGallery: React.FC = () => {
  const [activeTab, setActiveTab] = useState<number>(0);

  // Take first 4 primary screenshots
  const shots = REAL_SCREENSHOTS.slice(0, 4);
  const current = shots[activeTab] || shots[0];

  return (
    <section id="capturas" className="py-16 sm:py-20 bg-[#0c0f14] border-t border-b border-white/5">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        
        {/* Header */}
        <div className="text-center max-w-xl mx-auto mb-8 sm:mb-10">
          <span className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider block mb-2">
            Interfaz Real
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Así se ve CryoTech en producción
          </h2>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center justify-center gap-2 mb-6 overflow-x-auto pb-2 no-scrollbar">
          {shots.map((shot, idx) => (
            <button
              key={shot.id}
              onClick={() => setActiveTab(idx)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${
                activeTab === idx
                  ? 'bg-emerald-400 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white bg-[#11151c] border border-white/5'
              }`}
            >
              {shot.title}
            </button>
          ))}
        </div>

        {/* Screenshot Viewport */}
        <div className="rounded-2xl overflow-hidden border border-white/10 bg-[#11151c] shadow-2xl">
          <div className="px-4 py-3 border-b border-white/5 bg-[#161c26] flex items-center justify-between">
            <span className="text-xs font-medium text-slate-300">
              {current.title} — <span className="text-slate-400">{current.description}</span>
            </span>
          </div>

          <div className="p-2 sm:p-4 bg-[#090b0e]">
            <img
              src={current.darkSrc}
              alt={current.title}
              className="w-full h-auto rounded-xl border border-white/5 object-cover"
              loading="lazy"
            />
          </div>
        </div>

      </div>
    </section>
  );
};

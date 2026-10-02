import React from 'react';
import { Logo } from './Logo';

interface FooterProps {
  onOpenWaitlist: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenWaitlist }) => {
  const webAppLoginUrl = window.location.port === '3005' ? 'http://localhost:3002/login' : '/login';

  return (
    <footer className="bg-[#07090c] border-t border-white/5 py-10 text-xs text-slate-400">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Logo className="w-3.5 h-3.5" />
          </div>
          <span className="font-display font-bold text-sm text-white">
            Cryo<span className="text-emerald-400">Tech</span>
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-[11px] text-slate-500">Gestión Avícola Integral</span>
        </div>

        {/* Links */}
        <div className="flex items-center gap-5 text-xs">
          <a href="#funciones" className="hover:text-slate-200">Funciones</a>
          <a href="#app-mobile" className="hover:text-slate-200 text-emerald-400">PWA Móvil</a>
          <a href="#capturas" className="hover:text-slate-200">Plataforma Web</a>
          <a href={webAppLoginUrl} className="hover:text-slate-200">Iniciar Sesión</a>
          <a
            href="https://mobile-ochre-pi.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300"
          >
            Probar PWA
          </a>
        </div>

        {/* Copyright */}
        <div className="text-[11px] text-slate-500">
          © {new Date().getFullYear()} CryoTech. Todos los derechos reservados.
        </div>

      </div>
    </footer>
  );
};

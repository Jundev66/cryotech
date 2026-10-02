import React, { useState, useEffect } from 'react';
import { Menu, X, ArrowRight, LogIn } from 'lucide-react';
import { Logo } from './Logo';

interface NavbarProps {
  onOpenWaitlist: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenWaitlist }) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const webAppLoginUrl = window.location.port === '3005' ? 'http://localhost:3002/login' : '/login';

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-200 ${
        isScrolled
          ? 'bg-[#090b0e]/90 backdrop-blur-md border-b border-white/10 py-3 shadow-md'
          : 'bg-transparent py-4'
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between">
          
          {/* Logo & Brand */}
          <a href="#" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Logo className="w-4 h-4 text-emerald-400" />
            </div>
            <span className="font-display font-bold text-lg tracking-tight text-white">
              Cryo<span className="text-emerald-400">Tech</span>
            </span>
          </a>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6 text-sm text-slate-300 font-medium">
            <a href="#funciones" className="hover:text-white transition-colors">
              Funciones
            </a>
            <a href="#app-mobile" className="hover:text-white transition-colors text-emerald-400 font-semibold">
              App Móvil
            </a>
            <a href="#capturas" className="hover:text-white transition-colors">
              Plataforma Web (ERP)
            </a>
          </nav>

          {/* Desktop CTAs */}
          <div className="hidden sm:flex items-center gap-3">
            <a
              href={webAppLoginUrl}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white transition-colors"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Iniciar Sesión</span>
            </a>

            <a
              href="https://mobile-ochre-pi.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 active:scale-95 transition-all shadow-sm"
            >
              <span>Probar PWA Móvil</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-slate-400 hover:text-white rounded-lg border border-white/10"
            aria-label="Menú"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-3 p-4 rounded-xl bg-[#11151c] border border-white/10 flex flex-col gap-3 text-sm text-slate-200 animate-fadeIn">
            <a
              href="#funciones"
              onClick={() => setMobileMenuOpen(false)}
              className="py-1 hover:text-emerald-400"
            >
              Funciones
            </a>
            <a
              href="#app-mobile"
              onClick={() => setMobileMenuOpen(false)}
              className="py-1 text-emerald-400 font-medium"
            >
              App Móvil
            </a>
            <a
              href="#capturas"
              onClick={() => setMobileMenuOpen(false)}
              className="py-1 hover:text-emerald-400"
            >
              Plataforma Web (ERP)
            </a>

            <div className="pt-2 border-t border-white/10 flex flex-col gap-2">
              <a
                href={webAppLoginUrl}
                className="py-2 text-center rounded-lg border border-white/10 text-xs font-medium text-slate-300"
              >
                Iniciar Sesión
              </a>
              <a
                href="https://mobile-ochre-pi.vercel.app"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileMenuOpen(false)}
                className="py-2 text-center rounded-lg bg-emerald-400 text-slate-950 font-bold text-xs"
              >
                Probar PWA Móvil
              </a>
            </div>
          </div>
        )}

      </div>
    </header>
  );
};

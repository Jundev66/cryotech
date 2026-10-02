import { useNavigate, useLocation } from 'react-router';
import { Home, MessageSquare, PlusCircle, BarChart3, Menu } from 'lucide-react';
import { haptics } from '@/lib/native';
import { useSyncStore } from '@/stores/sync.store';

const TABS = [
  { path: '/', label: 'Inicio', icon: Home },
  { path: '/chat', label: 'Asistente', icon: MessageSquare },
  { path: '/register', label: 'Registrar', icon: PlusCircle, isMain: true },
  { path: '/reports', label: 'Reportes', icon: BarChart3 },
  { path: '/more', label: 'Más', icon: Menu },
];

export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const pendingCount = useSyncStore((s) => s.queue.length);

  const handleTabPress = async (path: string) => {
    await haptics.light();
    navigate(path);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 safe-bottom-nav">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {TABS.map((tab) => {
          const isActive = location.pathname === tab.path;
          const Icon = tab.icon;

          if (tab.isMain) {
            return (
              <button
                key={tab.path}
                onClick={() => handleTabPress(tab.path)}
                className="touch-active flex flex-col items-center justify-center -mt-5"
              >
                <div className="w-13 h-13 rounded-full bg-teal-500 shadow-lg shadow-teal-500/30 flex items-center justify-center text-slate-950">
                  <Icon className="w-7 h-7 stroke-[2.2]" />
                </div>
                <span className="text-[10px] font-semibold text-teal-400 mt-1">
                  {tab.label}
                </span>
              </button>
            );
          }

          return (
            <button
              key={tab.path}
              onClick={() => handleTabPress(tab.path)}
              className="touch-active flex flex-col items-center justify-center flex-1 py-1"
            >
              <div className="relative">
                <Icon
                  className={`w-5 h-5 transition-colors ${
                    isActive ? 'text-teal-400 stroke-[2.4]' : 'text-slate-400'
                  }`}
                />
                {tab.path === '/' && pendingCount > 0 && (
                  <span className="absolute -top-1 -right-2 w-3.5 h-3.5 bg-amber-500 rounded-full text-[9px] font-bold text-slate-950 flex items-center justify-center">
                    {pendingCount}
                  </span>
                )}
              </div>
              <span
                className={`text-[10px] font-medium mt-1 transition-colors ${
                  isActive ? 'text-teal-400' : 'text-slate-400'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

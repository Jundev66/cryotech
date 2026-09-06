import { useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useCompany } from '@/providers/company-provider';
import { useTheme } from '@/hooks/use-theme';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { LogOut, Building2, ChevronDown, Menu, Sun, Moon } from 'lucide-react';

export function AppHeader({ onToggleSidebar }: { onToggleSidebar?: () => void }) {
  const { user, logout } = useAuth();
  const { company, companies, switchCompany } = useCompany();
  const { theme, toggleTheme } = useTheme();
  const [rotating, setRotating] = useState(false);

  const initials = user?.fullName
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  const handleToggleTheme = () => {
    setRotating(true);
    toggleTheme();
    setTimeout(() => setRotating(false), 300);
  };

  return (
    <header className="flex h-16 items-center gap-4 bg-background px-4 shadow-[0_1px_3px_-1px_oklch(0_0_0/0.08)] md:px-6">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onToggleSidebar}>
        <Menu className="h-5 w-5" />
      </Button>

      <Breadcrumb />

      {companies.length > 1 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2" data-testid="company-switcher">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">{company?.name}</span>
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Empresas</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {companies.map((c) => (
              <DropdownMenuItem
                key={c.id}
                data-testid="company-option"
                onClick={() => switchCompany(c.id)}
                className={c.id === company?.id ? 'bg-accent' : ''}
              >
                {c.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleToggleTheme}
          className="h-8 w-8"
        >
          <span
            className="transition-transform duration-300"
            style={{ transform: rotating ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              <Avatar className="h-8 w-8 ring-2 ring-primary/20">
                <AvatarFallback className="text-xs font-semibold">{initials}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span>{user?.fullName || 'Usuario'}</span>
                <span className="text-xs font-normal text-muted-foreground">{user?.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout}>
              <LogOut className="mr-2 h-4 w-4" />
              Cerrar sesion
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

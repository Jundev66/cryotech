import { Link, useLocation } from 'react-router';
import { useCompany } from '@/providers/company-provider';
import { usePermission } from '@/hooks/use-permission';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/brand/logo';
import {
  LayoutDashboard, ClipboardList, DollarSign, ShoppingCart,
  Users, Package, Warehouse, BarChart3, Settings, ShieldCheck,
  PackagePlus, Scissors, Layers, Wheat, Landmark,
} from 'lucide-react';

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  permissionKey?: string;
}

const mainNav: NavItem[] = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { title: 'Lotes', href: '/dashboard/batches', icon: Layers, permissionKey: 'batches' },
  { title: 'Registros Diarios', href: '/dashboard/daily-logs', icon: ClipboardList, permissionKey: 'daily_logs' },
  { title: 'Formulas', href: '/dashboard/feed', icon: Wheat, permissionKey: 'batches' },
];

const financeNav: NavItem[] = [
  { title: 'Ventas', href: '/dashboard/sales', icon: ShoppingCart, permissionKey: 'sales' },
  { title: 'Finanzas', href: '/dashboard/transactions', icon: DollarSign, permissionKey: 'transactions' },
  { title: 'Entradas', href: '/dashboard/entries', icon: PackagePlus, permissionKey: 'entries' },
  { title: 'Beneficio', href: '/dashboard/processing', icon: Scissors, permissionKey: 'processing' },
];

const resourceNav: NavItem[] = [
  { title: 'Clientes', href: '/dashboard/clients', icon: Users, permissionKey: 'clients' },
  { title: 'Productos', href: '/dashboard/products', icon: Package, permissionKey: 'products' },
  { title: 'Galpones', href: '/dashboard/warehouses', icon: Warehouse, permissionKey: 'warehouses' },
];

const adminNav: NavItem[] = [
  { title: 'Tesoreria', href: '/dashboard/treasury', icon: Landmark, permissionKey: 'treasury' },
  { title: 'Reportes', href: '/dashboard/reports', icon: BarChart3, permissionKey: 'reports' },
  { title: 'Usuarios y Roles', href: '/dashboard/users', icon: ShieldCheck, permissionKey: 'users' },
  { title: 'Configuracion', href: '/dashboard/settings', icon: Settings, permissionKey: 'settings' },
];

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  const { pathname } = useLocation();
  const { can, isOwner } = usePermission();

  const visible = items.filter(
    (item) => !item.permissionKey || isOwner || can(item.permissionKey, 'view'),
  );
  if (visible.length === 0) return null;

  return (
    <div className="mb-4">
      <h3 className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-sidebar-primary/30">{label}</h3>
      <nav className="space-y-0.5">
        {visible.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                'relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
                isActive
                  ? 'text-sidebar-foreground before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-full before:bg-sidebar-primary'
                  : 'text-sidebar-foreground/45 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground/80',
              )}
            >
              <item.icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-sidebar-primary' : '')} />
              {item.title}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function AppSidebar() {
  const { company } = useCompany();

  return (
    <aside className="hidden w-56 shrink-0 bg-sidebar md:block">
      <div className="flex h-full flex-col">
        <div className="border-b border-sidebar-border px-4 py-4">
          <Link to="/dashboard" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sidebar-primary/15 to-sidebar-primary/5">
              <Logo className="h-5 w-5 text-sidebar-primary" animate />
            </div>
            <div className="flex flex-col">
              <span className="font-display text-[14px] font-bold text-sidebar-foreground">CryoTech</span>
              {company && (
                <span className="max-w-[130px] truncate text-[11px] text-sidebar-foreground/35">{company.name}</span>
              )}
            </div>
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto px-2.5 py-4">
          <NavGroup label="Principal" items={mainNav} />
          <NavGroup label="Comercial" items={financeNav} />
          <NavGroup label="Recursos" items={resourceNav} />
          <NavGroup label="Admin" items={adminNav} />
        </div>
        <div className="border-t border-sidebar-border px-4 py-3">
          <p className="text-center text-[11px] italic text-sidebar-foreground/15">Gestion Avicola Inteligente</p>
        </div>
      </div>
    </aside>
  );
}

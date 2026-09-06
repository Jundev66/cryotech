import { useLocation } from 'react-router';
import { ChevronRight } from 'lucide-react';

const ROUTE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  batches: 'Lotes',
  'daily-logs': 'Registros Diarios',
  sales: 'Ventas',
  transactions: 'Finanzas',
  clients: 'Clientes',
  products: 'Productos',
  warehouses: 'Galpones',
  feed: 'Formulas Alimento',
  reports: 'Reportes',
  users: 'Usuarios y Roles',
  settings: 'Configuracion',
  entries: 'Entradas',
  processing: 'Beneficio',
  consumptions: 'Consumo Insumos',
  treasury: 'Tesoreria',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function Breadcrumb() {
  const { pathname } = useLocation();
  const segments = pathname.split('/').filter(Boolean);

  // Only show breadcrumb for nested dashboard routes
  if (segments.length < 2) return null;

  // The id of a detail route is not a crumb; the page itself shows the name.
  const crumbs = segments
    .slice(1)
    .filter((seg) => !UUID.test(seg))
    .map((seg) => ROUTE_LABELS[seg] || seg);

  return (
    <nav className="hidden items-center gap-1.5 text-sm text-muted-foreground md:flex">
      {crumbs.map((crumb, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="h-3 w-3" />}
          <span className={i === crumbs.length - 1 ? 'text-foreground font-medium' : ''}>
            {crumb}
          </span>
        </span>
      ))}
    </nav>
  );
}

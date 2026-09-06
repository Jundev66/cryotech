export const APP_NAME = 'CryoTech';
export const APP_DESCRIPTION = 'Sistema de gestión avícola';

export const BATCH_STATUS_LABELS: Record<string, string> = {
  planned: 'Planificado',
  breeding: 'En Crianza',
  for_sale: 'En Venta',
  finished: 'Finalizado',
};

export const BATCH_STATUS_COLORS: Record<string, string> = {
  planned: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  breeding: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  for_sale: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  finished: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

export const TRANSACTION_CATEGORY_LABELS: Record<string, string> = {
  feed: 'Alimento',
  vaccine: 'Vacunas',
  chicks: 'Pollos Bebé',
  sale_live: 'Venta (Vivos)',
  sale_dead: 'Venta (Muertos)',
  processing: 'Beneficio',
  utility: 'Servicios',
  labor: 'Mano de Obra',
  transport: 'Transporte',
  other: 'Otros',
  capital_in: 'Aporte de Capital',
  owner_draw: 'Retiro del Dueño',
};

export const PRODUCT_TYPE_LABELS: Record<string, string> = {
  consumable: 'Consumible',
  equipment: 'Equipo',
};

export const SALE_TYPE_LABELS: Record<string, string> = {
  live: 'Pollos Vivos',
  dead: 'Pollos Muertos',
};

export const FEED_PHASE_LABELS: Record<string, string> = {
  inicio: 'Inicio',
  engorde: 'Engorde',
};

export const CONSUMPTION_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  adjusted: 'Ajustado',
};

export const CONSUMPTION_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  confirmed: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  adjusted: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
};

export const ENTRY_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  received: 'Recibido',
};

export const ENTRY_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  received: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  partial: 'Parcial',
  paid: 'Pagado',
};

export const PAYMENT_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  partial: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  paid: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
};

export const EQUIPMENT_CONDITION_LABELS: Record<string, string> = {
  active: 'Activo',
  damaged: 'Dañado',
  transferred: 'Transferido',
};

export const DEFAULT_ENGORDE_START_WEEK = 4;

export const BREED_STANDARDS: Record<string, Record<number, number>> = {
  'Cobb 500': { 1: 185, 2: 460, 3: 950, 4: 1580, 5: 2350, 6: 3100 },
  'Ross 308': { 1: 180, 2: 450, 3: 920, 4: 1520, 5: 2250, 6: 2980 },
  'Hubbard': { 1: 170, 2: 430, 3: 880, 4: 1450, 5: 2150, 6: 2850 },
};

export const DEFAULT_FEED_FORMULAS: Record<string, Record<number, number>> = {
  'Cobb 500': { 1: 18, 2: 35, 3: 65, 4: 105, 5: 145, 6: 165, 7: 175 },
  'Ross 308': { 1: 17, 2: 33, 3: 62, 4: 100, 5: 140, 6: 160, 7: 170 },
  'Hubbard': { 1: 16, 2: 32, 3: 60, 4: 98, 5: 138, 6: 158, 7: 168 },
};

export const PERMISSIONS_MODULES = [
  { key: 'batches', label: 'Lotes' },
  { key: 'daily_logs', label: 'Registros Diarios' },
  { key: 'sales', label: 'Ventas' },
  { key: 'transactions', label: 'Finanzas' },
  { key: 'entries', label: 'Entradas' },
  { key: 'processing', label: 'Beneficio' },
  { key: 'clients', label: 'Clientes' },
  { key: 'products', label: 'Productos/Insumos' },
  { key: 'warehouses', label: 'Galpones' },
  { key: 'reports', label: 'Reportes' },
  { key: 'treasury', label: 'Tesorería' },
  { key: 'settings', label: 'Configuración' },
  { key: 'users', label: 'Usuarios' },
] as const;

export const ACCOUNT_KIND_LABELS: Record<string, string> = {
  bank: 'Banco',
  cash: 'Efectivo',
  digital: 'Digital',
};

export const MOVEMENT_DIRECTION_LABELS: Record<string, string> = {
  in: 'Entrada',
  out: 'Salida',
};

export const MOVEMENT_SOURCE_LABELS: Record<string, string> = {
  sale_payment: 'Cobro de venta',
  transaction: 'Gasto',
  fx_trade: 'Compra de divisas',
  transfer: 'Traslado entre cuentas',
  manual: 'Manual',
};

export const PERMISSIONS_ACTIONS = ['view', 'create', 'edit', 'delete'] as const;

export const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  planned: ['breeding'],
  breeding: ['for_sale'],
  for_sale: ['finished'],
  finished: [],
};

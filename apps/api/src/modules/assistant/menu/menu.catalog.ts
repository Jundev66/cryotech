/**
 * The operations the bot offers, in the order they appear.
 *
 * These are things the business does, not accounting categories. Offering
 * "servicios / mano de obra / transporte" made the user pick the closest-looking
 * label for an operation the system already knew about, and the cost landed on
 * the books twice. Naming the operation is what makes that impossible.
 *
 * WhatsApp lists cap at ten rows, and this is now at ten. There is no room for
 * an eleventh: the next operation that deserves a place has to take one, or two
 * of these have to merge behind a screen of their own.
 */
export const MENU_OPERATIONS = [
  {
    key: 'collect',
    title: '💰 Cobrar una venta',
    description: 'Ver quién debe y aplicar un pago',
  },
  {
    key: 'pay',
    title: '💳 Pagar algo pendiente',
    description: 'Compras y beneficios por pagar',
  },
  {
    key: 'sale',
    title: '🧾 Registrar una venta',
    description: 'Cliente, lote, kilos y precio',
  },
  // Used to live only inside Lotes: a slaughter could be paid from the main
  // menu, but there was no way to find where to record one without knowing to
  // go through Lotes first and to have a batch marked "Listo para venta".
  {
    key: 'processing',
    title: '🔪 Registrar un beneficio',
    description: 'Lote, cantidad y quién lo hizo',
  },
  // Recording a purchase also lived inside Lotes, and was hidden with no active
  // batch — which is exactly when the feed for the next batch is bought. A bag
  // of feed does not need a batch to exist.
  {
    key: 'register_entry',
    title: '📦 Registrar una compra',
    description: 'Alimento, vacunas y demás insumos',
  },
  {
    key: 'batches',
    title: '🐣 Lotes',
    description: 'Planificar, confirmar y ver los activos',
  },
  {
    key: 'daily_log',
    title: '📋 Registro diario',
    description: 'Mortalidad, alimento y peso del día',
  },
  {
    key: 'reports',
    title: '📊 Consultas',
    description: 'Deudores, vencidas y estado de cuenta',
  },
  {
    key: 'balances',
    title: '🏦 Saldos',
    description: 'Cuánto hay en cada cuenta',
  },
  {
    key: 'pending',
    title: '📸 Comprobantes',
    description: 'Los que quedaron sin clasificar',
  },
] as const;

export type MenuOperation = (typeof MENU_OPERATIONS)[number]['key'];

const KEYS = new Set<string>(MENU_OPERATIONS.map((operation) => operation.key));

export function isMenuOperation(value: string): value is MenuOperation {
  return KEYS.has(value);
}

/**
 * Words that open an operation directly.
 *
 * Everything unrecognised opens the menu, so these only save a tap — they are
 * never the only way to reach anything.
 */
export const TEXT_SHORTCUTS: Record<string, MenuOperation> = {
  pendiente: 'pending',
  pendientes: 'pending',
  comprobantes: 'pending',
  deudores: 'reports',
  deudas: 'reports',
  consultas: 'reports',
  saldo: 'balances',
  saldos: 'balances',
  cuentas: 'balances',
  lotes: 'batches',
  comprar: 'register_entry',
  compra: 'register_entry',
  compras: 'register_entry',
  insumos: 'register_entry',
  sacos: 'register_entry',
  alimento: 'register_entry',
  cobrar: 'collect',
  pagar: 'pay',
  debo: 'pay',
  beneficio: 'processing',
  beneficios: 'processing',
  ventas: 'sale',
  venta: 'sale',
  vender: 'sale',
  diario: 'daily_log',
  registro: 'daily_log',
};

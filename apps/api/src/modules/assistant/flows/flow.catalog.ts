/**
 * The forms published to WhatsApp, and where their definitions live.
 *
 * `services/whatsapp-flows/flows/<file>.json` is the source of truth for the
 * layout; this only records what the API needs to send one and to route the
 * answer back. Keys, screen ids and file names must stay in step — the publish
 * script validates the JSON, and `check-flows.ts` validates this table against
 * it, so a rename cannot silently break a form.
 */
export const FLOWS = {
  sale: {
    file: 'sale',
    screen: 'SALE',
    cta: 'Registrar venta',
    header: 'Nueva venta',
  },
  daily_log: {
    file: 'daily-log',
    screen: 'DAILY_LOG',
    cta: 'Abrir el registro',
    header: 'Registro diario',
  },
  processing: {
    file: 'processing',
    screen: 'PROCESSING',
    cta: 'Registrar beneficio',
    header: 'Nuevo beneficio',
  },
  batch_plan: {
    file: 'batch-plan',
    screen: 'BATCH_PLAN',
    cta: 'Planificar lote',
    header: 'Nuevo lote',
  },
  entry: {
    file: 'entry',
    screen: 'ENTRY',
    cta: 'Registrar compra',
    header: 'Nueva compra',
  },
} as const;

export type FlowKind = keyof typeof FLOWS;

export function isFlowKind(value: string): value is FlowKind {
  return Object.prototype.hasOwnProperty.call(FLOWS, value);
}

/**
 * How far back a form's calendar may reach.
 *
 * Wide enough to record something forgotten from last month, narrow enough that
 * a mis-tap cannot file a sale into last year.
 */
export const CALENDAR_PAST_DAYS = 60;
/** Only a planned batch may be dated forward; everything else happened already. */
export const CALENDAR_FUTURE_DAYS: Record<FlowKind, number> = {
  sale: 0,
  daily_log: 0,
  processing: 0,
  batch_plan: 90,
  entry: 0,
};

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
 * Operations that only exist as the step-by-step wizard.
 *
 * They have no WhatsApp form behind them, so they stay out of `FLOWS`: that
 * table is checked against `services/whatsapp-flows/flows/*.json`, and a row
 * with no file would fail the check for a form nobody means to publish.
 */
export const WIZARD_ONLY_KINDS = ['expense', 'collect'] as const;

export type WizardOnlyKind = (typeof WIZARD_ONLY_KINDS)[number];

/** Everything the wizard can open: the forms plus the wizard-only operations. */
export type OperationKind = FlowKind | WizardOnlyKind;

export function isOperationKind(value: string): value is OperationKind {
  return isFlowKind(value) || (WIZARD_ONLY_KINDS as readonly string[]).includes(value);
}

/**
 * How far back a form's calendar may reach.
 *
 * Wide enough to record something forgotten from last month, narrow enough that
 * a mis-tap cannot file a sale into last year.
 */
export const CALENDAR_PAST_DAYS = 60;
/** Only a planned batch may be dated forward; everything else happened already. */
export const CALENDAR_FUTURE_DAYS: Record<OperationKind, number> = {
  sale: 0,
  daily_log: 0,
  processing: 0,
  batch_plan: 90,
  entry: 0,
  expense: 0,
  collect: 0,
};

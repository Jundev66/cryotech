import type { FlowKind } from '../flows/flow.catalog';

/**
 * What kind of answer a question takes.
 *
 * `choice` and `date` are tapped; only `number` and `text` are typed, and those
 * are the ones a list genuinely cannot express — nobody can offer 22,5 kg as a
 * button. Everything else the user picks.
 */
export type StepKind = 'choice' | 'number' | 'text' | 'date';

export interface WizardStep {
  /** Where the answer lands. Matches the field name the executor reads. */
  key: string;
  question: string;
  kind: StepKind;
  /**
   * For `choice`: which list in the session context holds the options, or a
   * fixed set written here when the answer is not data-driven.
   *
   * A function when the right list depends on what came before — selling live
   * birds offers the batches that still have some, selling processed ones
   * offers whatever the slaughtered stock can be attributed to.
   */
  optionsKey?: string | ((answers: Record<string, string>) => string);
  fixedOptions?: Array<{ id: string; title: string; description?: string }>;
  /** Skippable questions show an "Omitir" button next to the question. */
  optional?: boolean;
  /** Hides a question that the answers so far have made pointless. */
  skipIf?: (answers: Record<string, string>) => boolean;
  /** Shown under the question, e.g. the standard price. */
  hint?: string;
  /** How far the calendar list may reach forward, in days. */
  futureDays?: number;
}

const PAYMENT_OPTIONS = [
  { id: 'paid', title: '💵 Pagada', description: 'Ya te pagaron' },
  { id: 'pending', title: '📋 Fiada', description: 'Queda debiendo' },
];

/** The four supply questions all hang off the same answer. */
function notAddingSupplies(answers: Record<string, string>): boolean {
  return answers.add_supplies !== 'yes';
}

export const WIZARDS: Record<FlowKind, { title: string; steps: WizardStep[] }> = {
  sale: {
    title: '🧾 Registrar una venta',
    steps: [
      { key: 'client', question: '¿Quién compra?', kind: 'choice', optionsKey: 'clients' },
      // Type comes before batch because it decides where the birds come from:
      // live ones from the batch, processed ones from the processed inventory.
      // Asked afterwards, the assistant filtered by live birds and answered
      // "no batches available" with the freezer full.
      { key: 'sale_type', question: '¿Cómo va el pollo?', kind: 'choice', optionsKey: 'saleTypes' },
      {
        key: 'batch',
        question: '¿De qué lote?',
        kind: 'choice',
        optionsKey: (answers) => (answers.sale_type === 'dead' ? 'processedBatches' : 'batches'),
      },
      { key: 'quantity', question: '¿Cuántas aves?', kind: 'number' },
      { key: 'weight_kg', question: '¿Cuántos kilos en total?', kind: 'number' },
      {
        key: 'price_per_kg',
        question: '¿A cuánto el kilo?',
        kind: 'number',
        hint: 'Escribe el precio en dólares, por ejemplo 4 o 4,20',
      },
      { key: 'sale_date', question: '¿Qué día fue?', kind: 'date' },
      { key: 'payment', question: '¿Cómo quedó?', kind: 'choice', fixedOptions: PAYMENT_OPTIONS },
    ],
  },

  daily_log: {
    title: '📋 Registro diario',
    steps: [
      { key: 'batch', question: '¿De qué lote?', kind: 'choice', optionsKey: 'batches' },
      { key: 'log_date', question: '¿De qué día?', kind: 'date' },
      {
        key: 'mortality',
        question: '¿Cuántas aves murieron?',
        kind: 'number',
        hint: 'Escribe 0 si no murió ninguna',
      },
      { key: 'feed_consumed_kg', question: '¿Cuántos kilos de alimento?', kind: 'number', optional: true },
      { key: 'average_weight_g', question: '¿Peso promedio en gramos?', kind: 'number', optional: true },
    ],
  },

  processing: {
    title: '🔪 Registrar un beneficio',
    steps: [
      { key: 'batch', question: '¿De qué lote?', kind: 'choice', optionsKey: 'batches' },
      { key: 'quantity', question: '¿Cuántas aves se beneficiaron?', kind: 'number' },
      {
        key: 'who',
        question: '¿Quién las benefició?',
        kind: 'choice',
        fixedOptions: [
          { id: 'third_party', title: '👤 Alguien más', description: 'Hay que pagarle' },
          { id: 'self', title: '🏠 Nosotros', description: 'No hay nada que pagar' },
        ],
      },
      {
        key: 'supplier_name',
        question: '¿A quién se le paga?',
        kind: 'text',
        skipIf: (answers) => answers.who === 'self',
      },
      {
        key: 'total_cost_bs',
        question: '¿Cuánto costó en total?',
        kind: 'number',
        hint: 'En bolívares, como dice el comprobante',
        skipIf: (answers) => answers.who === 'self',
      },
      { key: 'processing_date', question: '¿Qué día fue?', kind: 'date' },
    ],
  },

  batch_plan: {
    title: '🐣 Planificar un lote',
    steps: [
      { key: 'warehouse', question: '¿En qué galpón?', kind: 'choice', optionsKey: 'warehouses' },
      { key: 'breed', question: '¿Qué raza?', kind: 'choice', optionsKey: 'breeds' },
      { key: 'initial_quantity', question: '¿Cuántos pollitos?', kind: 'number' },
      {
        key: 'price_per_chick',
        question: '¿A cuánto sale cada pollito?',
        kind: 'number',
        hint: 'En bolívares',
        optional: true,
      },
      // With no product to charge them to, the per-chick price was stored but
      // never reached the books: no expense, no payable, and so nothing for a
      // receipt to settle. Usually seeded from `batchPlanData` and not asked.
      {
        key: 'chick_product',
        question: '¿Qué pollito compraste?',
        kind: 'choice',
        optionsKey: 'chickProducts',
        skipIf: (answers) => !answers.price_per_chick,
      },
      { key: 'start_date', question: '¿Qué día entran?', kind: 'date', futureDays: 30 },
      // Feed bought with the batch is loaded here and becomes a real purchase
      // when the batch is confirmed, which is when it arrives. Loading it as a
      // standalone purchase would mark it received weeks earlier.
      {
        key: 'add_supplies',
        question: '¿Compraste insumos para este lote?',
        kind: 'choice',
        fixedOptions: [
          { id: 'yes', title: '➕ Sí, agregar', description: 'Alimento, vacunas, cama…' },
          { id: 'no', title: 'No, así está bien' },
        ],
      },
      {
        key: 'supply_product',
        question: '¿Qué compraste?',
        kind: 'choice',
        optionsKey: 'products',
        skipIf: notAddingSupplies,
      },
      {
        key: 'supply_quantity',
        question: '¿Cuánta cantidad?',
        kind: 'number',
        skipIf: notAddingSupplies,
      },
      // Per unit, not the total: `batch_entry_lines` stores only the unit cost
      // and derives the total on confirmation, so asking for the total forces a
      // division that loses cents — 6 bags at Bs 2,900 landed as Bs 2,899.98.
      {
        key: 'supply_cost',
        question: '¿A cuánto salió cada uno?',
        kind: 'number',
        hint: 'En bolívares, el precio de uno solo',
        skipIf: notAddingSupplies,
      },
      {
        key: 'supply_delivery',
        question: '¿Cuánto fue el flete?',
        kind: 'number',
        optional: true,
        skipIf: notAddingSupplies,
      },
    ],
  },

  entry: {
    title: '📦 Registrar una compra',
    steps: [
      { key: 'product', question: '¿Qué compraste?', kind: 'choice', optionsKey: 'products' },
      { key: 'quantity', question: '¿Cuánta cantidad?', kind: 'number' },
      { key: 'total_cost', question: '¿Cuánto costó en total?', kind: 'number', hint: 'En bolívares' },
      { key: 'delivery_cost', question: '¿Cuánto fue el flete?', kind: 'number', optional: true },
      { key: 'supplier_name', question: '¿A quién le compraste?', kind: 'text', optional: true },
      { key: 'batch', question: '¿Para qué lote es?', kind: 'choice', optionsKey: 'batches' },
      { key: 'entry_date', question: '¿Qué día fue?', kind: 'date' },
      {
        key: 'received',
        question: '¿Ya llegó la mercancía?',
        kind: 'choice',
        fixedOptions: [
          { id: 'yes', title: '✅ Sí, ya llegó' },
          { id: 'no', title: '⏳ Todavía no' },
        ],
      },
    ],
  },
};

/** The questions that actually apply, given what has been answered so far. */
export function visibleSteps(kind: FlowKind, answers: Record<string, string>): WizardStep[] {
  return WIZARDS[kind].steps.filter((step) => !step.skipIf?.(answers));
}

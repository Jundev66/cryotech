/**
 * Output contract for the AI reader.
 *
 * Every field is a plain string holding what is literally printed on the
 * receipt, with an empty string meaning "not present". The model transcribes;
 * it never parses, converts or computes. Our own validators — the same ones the
 * local OCR path uses — turn these strings into numbers and dates, so a
 * misread from either reader has to survive exactly the same checks.
 *
 * Keeping the shape flat and all-strings also keeps the response near 150
 * tokens, which is why `max_tokens` can sit at 400.
 */
export interface RawReceiptExtraction {
  amountText: string;
  dateText: string;
  referenceText: string;
  counterpartyText: string;
  originText: string;
  destinationText: string;
  conceptText: string;
  bankText: string;
}

export const RECEIPT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'amountText',
    'dateText',
    'referenceText',
    'counterpartyText',
    'originText',
    'destinationText',
    'conceptText',
    'bankText',
  ],
  properties: {
    amountText: {
      type: 'string',
      description: 'Monto tal como está impreso, con separadores y moneda. Ej: "2.450,00 Bs". Vacío si no aparece.',
    },
    dateText: {
      type: 'string',
      description: 'Fecha tal como está impresa. Ej: "08/08/2026". Vacío si no aparece.',
    },
    referenceText: {
      type: 'string',
      description: 'Número de operación, referencia o comprobante. Solo los dígitos. Vacío si no aparece.',
    },
    counterpartyText: {
      type: 'string',
      description: 'Nombre de la persona o empresa que aparece en el recibo. Vacío si no aparece.',
    },
    originText: {
      type: 'string',
      description: 'Cuenta o teléfono de origen, tal como está impreso. Ej: "0102****5678". Vacío si no aparece.',
    },
    destinationText: {
      type: 'string',
      description: 'Cuenta o teléfono de destino, tal como está impreso. Vacío si no aparece.',
    },
    conceptText: {
      type: 'string',
      description: 'Concepto, motivo o descripción. Vacío si no aparece.',
    },
    bankText: {
      type: 'string',
      description: 'Nombre del banco si aparece en el recibo. Vacío si no aparece.',
    },
  },
} as const;

export const EMPTY_EXTRACTION: RawReceiptExtraction = {
  amountText: '',
  dateText: '',
  referenceText: '',
  counterpartyText: '',
  originText: '',
  destinationText: '',
  conceptText: '',
  bankText: '',
};

export function isRawReceiptExtraction(value: unknown): value is RawReceiptExtraction {
  if (!value || typeof value !== 'object') return false;
  return RECEIPT_JSON_SCHEMA.required.every(
    (key) => typeof (value as Record<string, unknown>)[key] === 'string',
  );
}

/**
 * Field patterns for Venezuelan bank transfer receipts.
 *
 * These are label-anchored rather than position-anchored: we look for the
 * printed caption and take the value that follows it. Venezuelan banks use a
 * fairly consistent vocabulary even though every app lays the screen out
 * differently, so this survives redesigns that a coordinate template would not.
 */

export interface AccountRef {
  /** Four-digit bank code, e.g. '0102' for Banco de Venezuela. */
  bankCode: string | null;
  /** Last four digits of a masked account number. */
  last4: string | null;
  /** Phone number for pago movil, normalised to its last 10 digits. */
  phone: string | null;
  /** What was actually printed, kept for the audit trail. */
  raw: string;
}

export interface ReceiptFields {
  amount: number | null;
  currency: 'VES' | 'USD' | null;
  /** ISO `yyyy-mm-dd`. */
  date: string | null;
  reference: string | null;
  counterparty: string | null;
  originAccount: AccountRef | null;
  destinationAccount: AccountRef | null;
  concept: string | null;
  bankName: string | null;
}

export const EMPTY_FIELDS: ReceiptFields = {
  amount: null,
  currency: null,
  date: null,
  reference: null,
  counterparty: null,
  originAccount: null,
  destinationAccount: null,
  concept: null,
  bankName: null,
};

/** Label variants seen across Venezuelan banking apps, per logical field. */
export const LABELS = {
  amount: ['monto', 'importe', 'total', 'monto transferido'],
  date: ['fecha', 'fecha y hora', 'fecha de operacion', 'fecha operacion'],
  reference: [
    'operacion',
    'referencia',
    'nro referencia',
    'nro de referencia',
    'n de referencia',
    'numero de referencia',
    'cod referencia',
    'codigo de referencia',
    'comprobante',
  ],
  origin: ['origen', 'cuenta origen', 'desde', 'cuenta debito', 'cuenta de debito', 'debitado de'],
  destination: [
    'destino',
    'cuenta destino',
    'para',
    'cuenta beneficiario',
    'cuenta de beneficiario',
    'acreditado a',
  ],
  counterparty: ['nombre', 'beneficiario', 'titular', 'a nombre de', 'razon social', 'ordenante'],
  concept: ['concepto', 'motivo', 'descripcion', 'observacion'],
} as const;

/** Bank code -> display name, for the confirmation summary. */
export const BANK_NAMES: Record<string, string> = {
  '0102': 'Banco de Venezuela',
  '0104': 'Venezolano de Crédito',
  '0105': 'Mercantil',
  '0108': 'Provincial',
  '0114': 'Bancaribe',
  '0115': 'Exterior',
  '0128': 'Banco Caroní',
  '0134': 'Banesco',
  '0138': 'Banco Plaza',
  '0151': 'BFC Banco Fondo Común',
  '0156': '100% Banco',
  '0163': 'Banco del Tesoro',
  '0166': 'Banco Agrícola',
  '0168': 'Bancrecer',
  '0169': 'Mi Banco',
  '0171': 'Banco Activo',
  '0172': 'Bancamiga',
  '0174': 'Banplus',
  '0175': 'Bicentenario',
  '0177': 'Banfanb',
  '0191': 'BNC Banco Nacional de Crédito',
};

/** `0102****5678`, `0102 **** 5678`, `0102-XXXX-5678`. */
const MASKED_ACCOUNT = /(\d{4})\s*[*xX\-–—.\s]{2,}\s*(\d{4})\b/;
/** A bare masked tail with no bank code: `****5678`. */
const MASKED_TAIL = /[*xX]{3,}\s*(\d{4})\b/;
/** Venezuelan mobile: 0412/0414/0416/0424/0426, optionally +58 prefixed. */
const PHONE = /(?:\+?58)?\s*[-(]?\s*0?(4(?:12|14|16|24|26))\s*[-)]?\s*(\d{3})\s*[-.\s]?\s*(\d{4})\b/;
/** A full 20-digit Venezuelan account number. */
const FULL_ACCOUNT = /\b(\d{4})[\s-]?\d{4}[\s-]?\d{2}[\s-]?\d{10}\b/;

/** Amount with either es-VE (`2.450,00`) or en-US (`2,450.00`) grouping. */
const AMOUNT = /(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2}|\d+)\s*(Bs\.?S?|BsS|VES|USD|\$)?/i;

const DATE_DMY = /\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/;
const DATE_ISO = /\b(\d{4})-(\d{2})-(\d{2})\b/;

/**
 * Parses a printed amount into a number.
 *
 * Both `2.450,00` (es-VE) and `2,450.00` (en-US) appear in the wild, and
 * getting this backwards turns 2450 into 2.45 — an error that would silently
 * under-record a payment by three orders of magnitude. The rule: whichever
 * separator appears last is the decimal one.
 */
export function parseAmount(raw: string): number | null {
  const match = raw.match(AMOUNT);
  if (!match) return null;

  let digits = match[1];
  const lastComma = digits.lastIndexOf(',');
  const lastDot = digits.lastIndexOf('.');

  if (lastComma === -1 && lastDot === -1) {
    const plain = Number(digits);
    return Number.isFinite(plain) ? plain : null;
  }

  if (lastComma > lastDot) {
    // es-VE: dots group thousands, comma is the decimal separator.
    digits = digits.replace(/\./g, '').replace(',', '.');
  } else {
    // en-US: commas group thousands, dot is the decimal separator.
    digits = digits.replace(/,/g, '');
  }

  const value = Number(digits);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function parseCurrency(raw: string): 'VES' | 'USD' | null {
  // `$` sits outside the word-boundary group: `\b` needs a word character on
  // both sides, so inside it "$40.00" could never match.
  if (/\b(usd|dolar|dólar|dolares|dólares)\b|\$/i.test(raw)) return 'USD';
  if (/\b(bs\.?s?|bss|ves|bolivar|bolívar)\b/i.test(raw)) return 'VES';
  return null;
}

/**
 * Parses a printed date to ISO `yyyy-mm-dd`.
 *
 * Venezuelan receipts are day-first. A date in the future or more than a year
 * old is rejected rather than accepted: it means the OCR misread a digit, and
 * booking a movement on the wrong date is worse than asking for it.
 */
export function parseDate(raw: string, today = new Date()): string | null {
  const iso = raw.match(DATE_ISO);
  let year: number;
  let month: number;
  let day: number;

  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else {
    const dmy = raw.match(DATE_DMY);
    if (!dmy) return null;
    day = Number(dmy[1]);
    month = Number(dmy[2]);
    year = Number(dmy[3]);
    if (year < 100) year += 2000;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const oneDay = 86_400_000;
  if (parsed.getTime() > todayUtc + oneDay) return null;
  if (parsed.getTime() < todayUtc - 366 * oneDay) return null;

  return parsed.toISOString().slice(0, 10);
}

/** A bank reference is a run of digits; anything shorter than 6 is noise. */
export function parseReference(raw: string): string | null {
  const candidates = raw.match(/\d[\d\s-]{5,}\d/g) ?? [];
  for (const candidate of candidates) {
    const digits = candidate.replace(/\D/g, '');
    if (digits.length >= 6 && digits.length <= 20) return digits;
  }
  return null;
}

export function parseAccountRef(raw: string): AccountRef | null {
  const masked = raw.match(MASKED_ACCOUNT);
  if (masked) {
    return { bankCode: masked[1], last4: masked[2], phone: null, raw: raw.trim() };
  }

  const phone = raw.match(PHONE);
  if (phone) {
    return { bankCode: null, last4: null, phone: `0${phone[1]}${phone[2]}${phone[3]}`, raw: raw.trim() };
  }

  const full = raw.match(FULL_ACCOUNT);
  if (full) {
    const digits = raw.replace(/\D/g, '');
    return { bankCode: full[1], last4: digits.slice(-4), phone: null, raw: raw.trim() };
  }

  const tail = raw.match(MASKED_TAIL);
  if (tail) {
    return { bankCode: null, last4: tail[1], phone: null, raw: raw.trim() };
  }

  return null;
}

/** Strips accents and collapses whitespace so labels match regardless of OCR fidelity. */
export function normalizeLabel(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Venezuelan formatting: '.' groups thousands, ',' is the decimal separator. */
const esVE = new Intl.NumberFormat('es-VE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatAmount(value: number): string {
  return esVE.format(value);
}

export function formatBs(value: number): string {
  return `Bs ${esVE.format(value)}`;
}

export function formatUsd(value: number): string {
  return `$${esVE.format(value)}`;
}

/**
 * Reads a number the way it is written here.
 *
 * In Venezuela `.` groups thousands and `,` is the decimal separator, so
 * `2.450` is two thousand four hundred fifty — not two point forty-five.
 * Treating that dot as a decimal point turned a Bs 2.450 slaughtering fee into
 * Bs 2,45, a thousandfold error on real money.
 *
 * The rule, in order:
 *   - a comma present → dots group thousands, the comma is the decimal point
 *   - no comma, and every dot is followed by exactly three digits → thousands
 *   - anything else → a plain decimal point, so `3.5` still means three and a half
 *
 * Returns null for anything that is not a number at all.
 */
export function parseLocalNumber(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;

  const text = String(raw).replace(/[^\d.,-]/g, '').trim();
  if (text === '') return null;

  let normalized: string;
  if (text.includes(',')) {
    normalized = text.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(text)) {
    normalized = text.replace(/\./g, '');
  } else {
    normalized = text;
  }

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** `06/08/2026`, or `hoy` when the date is today in the operating timezone. */
export function formatReceiptDate(iso: string | null, todayIso: string): string {
  if (!iso) return 'sin fecha';
  if (iso === todayIso) return 'hoy';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

/** Today's date in a given IANA timezone, as `yyyy-mm-dd`. */
export function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

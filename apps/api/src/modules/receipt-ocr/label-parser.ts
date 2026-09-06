import {
  BANK_NAMES,
  EMPTY_FIELDS,
  LABELS,
  normalizeLabel,
  parseAccountRef,
  parseAmount,
  parseCurrency,
  parseDate,
  parseReference,
  type ReceiptFields,
} from './patterns';

/** Which logical field a caption maps to. */
type FieldKey = keyof typeof LABELS;

interface LabelledLine {
  field: FieldKey;
  value: string;
}

/**
 * Turns raw OCR text into receipt fields by anchoring on printed captions.
 *
 * Deliberately conservative: a caption it does not recognise yields no field
 * rather than a guess, and the caller escalates to the AI reader. A wrong
 * amount that looks plausible is far more damaging than a missing one, because
 * the missing one gets asked about and the wrong one gets confirmed.
 */
export function parseReceiptText(text: string, today = new Date()): ReceiptFields {
  const rawLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const fields: ReceiptFields = { ...EMPTY_FIELDS };
  const labelled: LabelledLine[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const hit = matchLabel(rawLines[i]);
    if (!hit) continue;

    // Some layouts print the caption and its value on separate lines; when the
    // caption line has nothing after the colon, look at the next line.
    let value = hit.rest;
    if (!value && i + 1 < rawLines.length && !matchLabel(rawLines[i + 1])) {
      value = rawLines[i + 1];
    }
    if (value) labelled.push({ field: hit.field, value });
  }

  const pick = (field: FieldKey) => labelled.find((l) => l.field === field)?.value ?? null;

  const amountLine = pick('amount');
  if (amountLine) {
    fields.amount = parseAmount(amountLine);
    fields.currency = parseCurrency(amountLine);
  }

  const dateLine = pick('date');
  if (dateLine) fields.date = parseDate(dateLine, today);

  const referenceLine = pick('reference');
  if (referenceLine) fields.reference = parseReference(referenceLine);

  const originLine = pick('origin');
  if (originLine) fields.originAccount = parseAccountRef(originLine);

  const destinationLine = pick('destination');
  if (destinationLine) fields.destinationAccount = parseAccountRef(destinationLine);

  const counterpartyLine = pick('counterparty');
  if (counterpartyLine) fields.counterparty = cleanName(counterpartyLine);

  const conceptLine = pick('concept');
  if (conceptLine) fields.concept = conceptLine.slice(0, 200);

  // The amount is usually the headline figure and carries no caption at all —
  // on the BDV receipt it sits alone in a pill above the labelled rows.
  if (fields.amount === null) {
    const standalone = findStandaloneAmount(rawLines, labelled);
    if (standalone) {
      fields.amount = standalone.amount;
      fields.currency = standalone.currency;
    }
  }

  fields.bankName = detectBank(rawLines, fields);

  return fields;
}

function matchLabel(line: string): { field: FieldKey; rest: string } | null {
  const normalized = normalizeLabel(line);

  for (const [field, captions] of Object.entries(LABELS) as [FieldKey, readonly string[]][]) {
    for (const caption of captions) {
      if (!normalized.startsWith(caption)) continue;

      // Guard against a caption being a prefix of an unrelated word
      // ("para" matching "parametros"): the next char must be a separator.
      const next = normalized.charAt(caption.length);
      if (next && next !== ' ') continue;

      // Slice the original line, not the normalized one, so the value keeps
      // its accents and punctuation.
      const separator = line.search(/[:>\-–—]/);
      const sliced =
        separator !== -1 && separator < line.length - 1
          ? line.slice(separator + 1)
          : line.slice(caption.length);

      // A caption alone on its line ("Referencia:") used to leave the colon
      // behind as the value, which stopped the lookahead below.
      const rest = sliced.replace(/^[\s:>\-–—]+/, '').trim();

      return { field, rest };
    }
  }

  return null;
}

/**
 * Finds the headline amount on receipts that print it without a caption.
 * Prefers a line carrying an explicit currency marker, and ignores lines
 * already consumed as a labelled value so a reference number cannot be
 * mistaken for an amount.
 */
function findStandaloneAmount(
  lines: string[],
  labelled: LabelledLine[],
): { amount: number; currency: 'VES' | 'USD' | null } | null {
  const consumed = new Set(labelled.map((l) => l.value));
  let best: { amount: number; currency: 'VES' | 'USD' | null } | null = null;

  for (const line of lines) {
    if (consumed.has(line) || matchLabel(line)) continue;
    // A decimal separator is what distinguishes a money figure from a
    // reference number or an account tail.
    if (!/\d[.,]\d{2}\b/.test(line)) continue;

    const amount = parseAmount(line);
    if (amount === null) continue;

    const currency = parseCurrency(line);
    if (currency && !best) return { amount, currency };
    if (!best) best = { amount, currency };
  }

  return best;
}

function detectBank(lines: string[], fields: ReceiptFields): string | null {
  const code = fields.originAccount?.bankCode ?? fields.destinationAccount?.bankCode;
  if (code && BANK_NAMES[code]) return BANK_NAMES[code];

  const haystack = normalizeLabel(lines.join(' '));
  for (const name of Object.values(BANK_NAMES)) {
    const needle = normalizeLabel(name);
    if (needle.length > 4 && haystack.includes(needle)) return name;
  }

  return null;
}

function cleanName(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/[|_]+/g, '')
    .trim()
    .slice(0, 120);
}

/** Fields without which we cannot safely register anything. */
export function missingCriticalFields(fields: ReceiptFields): string[] {
  const missing: string[] = [];
  if (fields.amount === null) missing.push('amount');
  if (!fields.reference) missing.push('reference');
  if (!fields.date) missing.push('date');
  if (!fields.originAccount && !fields.destinationAccount) missing.push('account');
  return missing;
}

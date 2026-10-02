import { parseLocalNumber } from '../formatting/number.format';

export type QuickEntryKind = 'expense' | 'collect' | 'entry' | 'sale';

export interface QuickEntry {
  kind: QuickEntryKind;
  /** Wizard answers read off the message. Whatever is missing, the wizard asks. */
  seed: Record<string, string>;
  /** For a collection or sale, the name as typed. The caller resolves it to a client. */
  clientName?: string;
}

/**
 * "gasté 20$ gasoil" — the verb opens the sentence.
 *
 * "Pagué" is deliberately not here: most of what gets paid is a purchase or a
 * slaughter already on the books, and opening a new expense for it is how the
 * same cost got counted twice. Those are paid from "Pagos y gastos".
 */
const EXPENSE_VERBS = new Set(['gasto', 'gastos', 'gaste', 'gastamos', 'gastar', 'gasta']);
/** "cobré 100$ juan" — same shape, money coming in. */
const COLLECT_VERBS = new Set(['cobro', 'cobre', 'cobramos', 'recaudar', 'recaudo']);
/** "vendi 1 pollo 2.7kg a juan" — quick sales */
const SALE_VERBS = new Set([
  'venta', 'ventas', 'vendi', 'vender', 'vendio', 'vendimos', 'despacho', 'despache', 'despachamos', 'entregue',
]);
/**
 * "juan pagó 50$" — the name comes first, so the verb is looked for later on.
 * Only counts with an amount present: "juan pagó" alone is not enough to act on.
 */
const PAID_VERBS = new Set(['pago', 'pagaron', 'abono', 'abonaron', 'transfirio', 'dio']);

const USD_WORDS = new Set(['$', 'usd', 'us$', 'dolar', 'dolares', 'verdes', 'divisas']);
const VES_WORDS = new Set(['bs', 'bs.', 'bss', 'bolivar', 'bolivares', 'ves']);

/** "20 mil" is how twenty thousand gets said and typed. */
const THOUSAND = 'mil';

/** Glue words that say nothing on their own and should not end up in a note or a name. */
const FILLERS = new Set([
  'de', 'del', 'en', 'por', 'para', 'a', 'al', 'el', 'la', 'los', 'las', 'un', 'una', 'y', 'con', 'me', 'nos',
  'se', 'le', 'les', 'que', 'pollo', 'pollos', 'cuenta', 'saldo',
]);

/** How the money moved. Useful to a human, meaningless as part of a client's name. */
const METHOD_WORDS = new Set(['efectivo', 'zelle', 'movil', 'transferencia', 'binance', 'punto', 'cash']);

/**
 * Keywords per expense category, in the order they are tried.
 *
 * Feed and chicks are deliberately absent: they are purchases, which move
 * stock and become a payable. Filing them as a plain expense is how a cost ends
 * up on the books twice — see `menu.catalog.ts`.
 */
const CATEGORY_WORDS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['transport', ['gasoil', 'gasolina', 'combustible', 'flete', 'fletes', 'transporte', 'pasaje', 'pasajes', 'taxi', 'caucho', 'cauchos', 'peaje', 'mototaxi']],
  ['labor', ['obrero', 'obreros', 'jornal', 'jornales', 'sueldo', 'sueldos', 'trabajador', 'trabajadores', 'ayudante', 'nomina', 'obra']],
  ['utility', ['luz', 'electricidad', 'corpoelec', 'agua', 'gas', 'bombona', 'internet', 'telefono', 'cantv', 'servicio', 'servicios']],
  ['vaccine', ['vacuna', 'vacunas', 'medicina', 'medicinas', 'vitamina', 'vitaminas', 'antibiotico', 'antibioticos', 'desinfectante', 'veterinario']],
  ['owner_draw', ['retiro', 'personal']],
];

const BOUGHT_VERBS = new Set([
  'tiene',
  'llevo',
  'lleva',
  'compro',
  'compra',
  'pidio',
  'pide',
  'debe',
  'agarro',
  'agarra',
]);

/** Words that mean the "expense" is really a purchase of stock. */
const ENTRY_WORDS = new Set(['alimento', 'alimentos', 'saco', 'sacos', 'concentrado', 'pollito', 'pollitos']);

const DAY_OFFSETS: Record<string, number> = { hoy: 0, ayer: -1, antier: -2, anteayer: -2 };

/**
 * Reads a one-line operation typed in the chat, without any AI.
 *
 * It only prefills the same wizard the buttons open: nothing is registered
 * from the text alone, and whatever it could not read is asked. So a wrong
 * guess costs a "Cancelar", never a wrong entry in the books.
 *
 * Returns null when the message does not start like an operation, which lets
 * the caller fall through to shortcuts, client search and the menu.
 */
export function parseQuickEntry(text: string, todayIso: string): QuickEntry | null {
  const original = text.trim().split(/\s+/).filter(Boolean);
  if (original.length === 0) return null;

  const words = original.map(normalizeWord);

  let kind: QuickEntryKind;
  let verbIndex: number;
  if (EXPENSE_VERBS.has(words[0])) {
    kind = 'expense';
    verbIndex = 0;
  } else if (COLLECT_VERBS.has(words[0]) || (words[0] === 'cobrar' && words.length > 1)) {
    kind = 'collect';
    verbIndex = 0;
  } else if (SALE_VERBS.has(words[0]) && words.length > 1) {
    kind = 'sale';
    verbIndex = 0;
  } else {
    const paid = words.findIndex((word, index) => index > 0 && PAID_VERBS.has(word));
    if (paid >= 0 && findAmount(words).index >= 0) {
      kind = 'collect';
      verbIndex = paid;
    } else {
      const bought = words.findIndex((word, index) => index > 0 && BOUGHT_VERBS.has(word));
      if (bought >= 0) {
        kind = 'sale';
        verbIndex = bought;
      } else {
        return null;
      }
    }
  }

  const consumed = new Set<number>([verbIndex]);
  const seed: Record<string, string> = {};

  if (kind === 'sale') {
    const rawText = original.join(' ');
    // Quantity: digit or word
    let qty: number | undefined;
    const qtyExplicit = rawText.match(/\b(\d+)\s*(?:pollos?|aves?|animales?)?\b/i);
    if (qtyExplicit) {
      const parsedQty = parseInt(qtyExplicit[1], 10);
      const afterNumber = rawText.slice((qtyExplicit.index ?? 0) + qtyExplicit[1].length).trim();
      if (!afterNumber.startsWith('.') && !afterNumber.startsWith(',') && !afterNumber.match(/^(?:kg|kilos?|k|\$|usd|bs)/i)) {
        qty = parsedQty;
      }
    }
    if (!qty) {
      const NUMBER_WORDS: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, diez: 10 };
      const wordQty = words.find((w) => NUMBER_WORDS[w]);
      if (wordQty) qty = NUMBER_WORDS[wordQty];
    }
    if (qty && qty > 0) seed.quantity = String(qty);

    // Weight in kg: e.g. "2.7kg", "2,7 kilos", "de 2.7", "peso 2.7"
    const kgMatch =
      rawText.match(/(?:peso\s*)?(\d+(?:[.,]\d+)?)\s*(?:kg|kilos?|k)\b/i) ||
      rawText.match(/(?:de|pesa|peso)\s*(\d+(?:[.,]\d+)?)(?!\s*\$|\s*usd|\s*bs)/i);
    if (kgMatch) {
      let kgVal = parseLocalNumber(kgMatch[1]);
      if (kgVal && kgVal >= 1000 && /^\d+\.\d{3}$/.test(kgMatch[1].trim())) {
        kgVal = kgVal / 1000;
      }
      if (kgVal && kgVal > 0) seed.weight_kg = String(kgVal);
    }

    // Price per kg: e.g. "$4.5", "a 4$", "a 4.50", "a 4 el kilo", "precio 4.5"
    const priceMatch =
      rawText.match(/\b(?:a\s*\$|precio\s*\$|\$)\s*(\d+(?:[.,]\d+)?)/i) ||
      rawText.match(/\ba\s*(\d+(?:[.,]\d+)?)\s*\$/i) ||
      rawText.match(/\b(?:a|precio)\s*(\d+(?:[.,]\d+)?)\s*(?:\$|usd|dolares|el kilo|\/kg|por kilo|kilos?)\b/i) ||
      rawText.match(/\bprecio\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\b/i);
    if (priceMatch) {
      let pVal = parseLocalNumber(priceMatch[1]);
      if (pVal && pVal >= 1000 && /^\d+\.\d{3}$/.test(priceMatch[1].trim())) {
        pVal = pVal / 1000;
      }
      if (pVal && pVal > 0) seed.price_per_kg = String(pVal);
    }

    // Sale type:
    if (words.some((w) => ['vivo', 'vivos', 'viva', 'vivas', 'pie'].includes(w))) seed.sale_type = 'live';
    else seed.sale_type = 'dead';

    let offset = 0;
    words.forEach((word) => {
      if (word in DAY_OFFSETS) offset = DAY_OFFSETS[word];
    });
    seed.sale_date = shiftDays(todayIso, offset);

    // If client was before verb (e.g. "Mercedes tiene un pollo de 2.7")
    if (verbIndex > 0) {
      const nameBeforeVerb = pickWords(
        original,
        words,
        original.map((_, i) => i).filter((i) => i < verbIndex),
        consumed,
        new Set(),
      );
      if (nameBeforeVerb) {
        return { kind, seed, clientName: nameBeforeVerb };
      }
    }

    // Client: "a Mercedes", "para Carlos", "cliente Maria"
    const clientMatch = rawText.match(/(?:a|para|cliente)\s+([a-zA-ZáéíóúÁÉÍÓÚñÑ]+(?:\s+[a-zA-ZáéíóúÁÉÍÓÚñÑ]+)?)/i);
    if (clientMatch) {
      const nameCandidate = clientMatch[1].trim();
      const ignore = ['el', 'la', 'los', 'un', 'una', 'pie', 'cava', 'galpon', 'pollo', 'pollos'];
      if (!ignore.includes(nameCandidate.toLowerCase())) {
        return { kind, seed, clientName: nameCandidate };
      }
    }

    const lastWord = original[original.length - 1];
    if (lastWord && !/^\d/.test(lastWord) && !FILLERS.has(normalizeWord(lastWord))) {
      return { kind, seed, clientName: lastWord };
    }

    return { kind, seed };
  }

  const amount = findAmount(words);
  if (amount.index >= 0) {
    seed.amount = String(amount.value);
    consumed.add(amount.index);
    for (const index of amount.extraIndexes) consumed.add(index);
    if (amount.currency) seed.currency = amount.currency;
  }

  let offset = 0;
  words.forEach((word, index) => {
    if (word in DAY_OFFSETS) {
      offset = DAY_OFFSETS[word];
      consumed.add(index);
    }
  });
  seed[kind === 'collect' ? 'payment_date' : 'expense_date'] = shiftDays(todayIso, offset);

  if (kind === 'collect') {
    // Either side of the verb: "cobré 100$ juan" or "juan pagó 100$".
    const candidates = verbIndex === 0
      ? original.map((_, index) => index).filter((index) => index > 0)
      : original.map((_, index) => index).filter((index) => index < verbIndex);
    const name = pickWords(original, words, candidates, consumed, METHOD_WORDS);
    return name ? { kind, seed, clientName: name } : { kind, seed };
  }

  const rest = words.filter((_, index) => !consumed.has(index));
  const category = CATEGORY_WORDS.find(([, keywords]) => rest.some((word) => keywords.includes(word)));
  if (!category && rest.some((word) => ENTRY_WORDS.has(word))) {
    return { kind: 'entry', seed: {} };
  }
  if (category) seed.category = category[0];

  const indexes = original.map((_, index) => index).filter((index) => index > 0);
  const note = pickWords(original, words, indexes, consumed, new Set());
  if (note) seed.description = capitalize(note);

  return { kind, seed };
}

interface AmountMatch {
  index: number;
  value: number;
  currency: 'USD' | 'VES' | null;
  /** The separate words that were part of the amount — "mil", the currency. */
  extraIndexes: number[];
}

/**
 * The first number in the message, with its "mil" and its currency.
 *
 * The currency can be glued to the number ("20$", "bs1500") or sit beside it
 * ("20 dólares", "bs 1.500", "20 mil bs"), so all those places are looked at.
 */
function findAmount(words: string[]): AmountMatch {
  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    const digits = word.match(/\d[\d.,]*\d|\d/);
    if (!digits) continue;

    let value = parseLocalNumber(digits[0]);
    if (value === null || value <= 0) continue;

    let glued = word.replace(digits[0], '');
    const extraIndexes: number[] = [];
    let next = index + 1;

    if (glued === THOUSAND) {
      value *= 1000;
      glued = '';
    } else if (words[next] === THOUSAND) {
      value *= 1000;
      extraIndexes.push(next);
      next += 1;
    }

    let currency = currencyOf(glued);

    if (!currency && next < words.length && currencyOf(words[next])) {
      currency = currencyOf(words[next]);
      extraIndexes.push(next);
    }
    if (!currency && index > 0 && currencyOf(words[index - 1])) {
      currency = currencyOf(words[index - 1]);
      extraIndexes.push(index - 1);
    }

    return { index, value: Math.round(value * 100) / 100, currency, extraIndexes };
  }
  return { index: -1, value: 0, currency: null, extraIndexes: [] };
}

function currencyOf(word: string): 'USD' | 'VES' | null {
  if (word === '') return null;
  if (USD_WORDS.has(word) || word.includes('$')) return 'USD';
  if (VES_WORDS.has(word)) return 'VES';
  return null;
}

/** The untouched words among `indexes`, in their original spelling, without edge fillers. */
function pickWords(
  original: string[],
  words: string[],
  indexes: number[],
  consumed: Set<number>,
  skip: Set<string>,
): string {
  const kept = indexes.filter(
    (index) => !consumed.has(index) && !skip.has(words[index]) && !(words[index] === 'pago' && words[index + 1] === 'movil'),
  );

  while (kept.length > 0 && FILLERS.has(words[kept[0]])) kept.shift();
  while (kept.length > 0 && FILLERS.has(words[kept[kept.length - 1]])) kept.pop();

  return kept.map((index) => stripPunctuation(original[index])).join(' ').trim();
}

/** Lowercase, without accents or trailing punctuation: "Gasté," reads as "gaste". */
function normalizeWord(word: string): string {
  return stripPunctuation(word.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase());
}

function stripPunctuation(word: string): string {
  return word.replace(/^[¡¿"'(]+|[!?,;:"')]+$/g, '').replace(/(?<!\d)\.+$/, '');
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function shiftDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

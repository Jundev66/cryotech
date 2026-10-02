/**
 * Fuzzy text similarity and Spanish phonetic matching.
 *
 * Designed for real-world agricultural & mobile operations where farmers
 * type names with typos, accent variations (María / Maria), phonetic variants
 * (Mercedes / Mercedez, Gonzalez / Gonzales, Pique / Pike), abbreviations,
 * or partial names (Abuela / Abuela Maria).
 */

/**
 * Lowercases, strips accents and punctuation, collapses whitespace.
 */
export function normalize(value: string): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Reduces Spanish text to a phonetic key to handle common Latin American / Venezuelan
 * sound-alike substitutions:
 * - 'z' and soft 'c' (ce, ci) sound like 's' (seseo)
 * - 'v' sounds like 'b'
 * - 'ge', 'gi' sound like 'je', 'ji'
 * - 'qu' and hard 'c' sound like 'k'
 * - 'll' sounds like 'y'
 * - Silent 'h' is dropped
 */
export function phoneticSpanish(value: string): string {
  let s = normalize(value);
  if (!s) return '';

  // Preserve 'ch' by temporarily replacing it
  s = s.replace(/ch/g, '@');
  // Silent 'h'
  s = s.replace(/h/g, '');
  s = s.replace(/@/g, 'ch');

  // Phonetic substitutions
  s = s.replace(/z/g, 's');
  s = s.replace(/c(?=[ei])/g, 's');
  s = s.replace(/qu(?=[ei])/g, 'k');
  s = s.replace(/c(?=[aou])/g, 'k');
  s = s.replace(/c(?=[^aouei]|$)/g, 'k');
  s = s.replace(/g(?=[ei])/g, 'j');
  s = s.replace(/v/g, 'b');
  s = s.replace(/ll/g, 'y');
  s = s.replace(/y(?=\s|$|[^aeiou])/g, 'i');

  // Collapse repeated characters (e.g. tt -> t, ss -> s, rr -> r)
  s = s.replace(/(.)\1+/g, '$1');

  return s.trim();
}

/**
 * Standard Levenshtein edit distance between two strings.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const row = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const val = a[i - 1] === b[j - 1] ? row[j - 1] : Math.min(row[j - 1], prev, row[j]) + 1;
      row[j - 1] = prev;
      prev = val;
    }
    row[b.length] = prev;
  }

  return row[b.length];
}

/**
 * Extract 2-character n-grams (bigrams) for Dice coefficient.
 */
function bigrams(value: string): string[] {
  const pairs: string[] = [];
  const words = value.split(' ');
  for (const word of words) {
    for (let i = 0; i < word.length - 1; i++) {
      pairs.push(word.slice(i, i + 2));
    }
  }
  return pairs;
}

/**
 * Dice coefficient over bigrams (0.0 to 1.0).
 */
function diceCoefficient(leftPairs: string[], rightPairs: string[]): number {
  if (leftPairs.length === 0 || rightPairs.length === 0) return 0;

  const pool = new Map<string, number>();
  for (const pair of rightPairs) pool.set(pair, (pool.get(pair) ?? 0) + 1);

  let hits = 0;
  for (const pair of leftPairs) {
    const remaining = pool.get(pair) ?? 0;
    if (remaining > 0) {
      pool.set(pair, remaining - 1);
      hits++;
    }
  }

  return (2 * hits) / (leftPairs.length + rightPairs.length);
}

/**
 * Calculates similarity between two names or phrases (returns 0.0 to 1.0).
 * Combines exact normalized matching, Spanish phonetic matching,
 * token containment (e.g. "abuela" in "Abuela Maria"), Levenshtein distance,
 * and Dice character bigrams.
 */
export function similarity(a: string, b: string): number {
  const normA = normalize(a);
  const normB = normalize(b);

  if (!normA || !normB) return 0;
  if (normA === normB) return 1.0;

  // Exact phonetic match (e.g. "mercedez" vs "mercedes")
  const phonA = phoneticSpanish(normA);
  const phonB = phoneticSpanish(normB);
  if (phonA && phonB && phonA === phonB) return 0.99;

  // Word token containment
  const wordsA = normA.split(' ').filter(Boolean);
  const wordsB = normB.split(' ').filter(Boolean);

  // If one string is a subset of the other's words
  const aInB = wordsA.every((w) => wordsB.includes(w));
  const bInA = wordsB.every((w) => wordsA.includes(w));
  if (aInB || bInA) {
    // If the subset represents a substantial part of the longer string
    const ratio = Math.min(normA.length, normB.length) / Math.max(normA.length, normB.length);
    return Math.max(0.92, ratio);
  }

  // Check phonetic word containment
  const phonWordsA = phonA.split(' ').filter(Boolean);
  const phonWordsB = phonB.split(' ').filter(Boolean);
  const phonAInB = phonWordsA.every((w) => phonWordsB.includes(w));
  const phonBInA = phonWordsB.every((w) => phonWordsA.includes(w));
  if (phonAInB || phonBInA) {
    return 0.90;
  }

  // Levenshtein ratio on normalized and phonetic strings
  const maxNormLen = Math.max(normA.length, normB.length);
  const normDist = levenshtein(normA, normB);
  const normLevScore = Math.max(0, 1 - normDist / maxNormLen);

  const maxPhonLen = Math.max(phonA.length, phonB.length);
  const phonDist = levenshtein(phonA, phonB);
  const phonLevScore = Math.max(0, 1 - phonDist / maxPhonLen);

  // Dice bigram coefficient
  const diceNorm = diceCoefficient(bigrams(normA), bigrams(normB));
  const dicePhon = diceCoefficient(bigrams(phonA), bigrams(phonB));

  return Math.max(normLevScore, phonLevScore, diceNorm, dicePhon);
}

export interface Scored<T> {
  item: T;
  score: number;
}

/**
 * Ranks items by similarity to a search query, descending.
 */
export function rankByName<T>(query: string, items: T[], nameOf: (item: T) => string): Scored<T>[] {
  return items
    .map((item) => ({ item, score: similarity(query, nameOf(item)) }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Finds the single best match among items if it meets or exceeds the threshold.
 */
export function findBestMatch<T>(
  query: string,
  items: T[],
  nameOf: (item: T) => string,
  threshold = 0.6,
): { best: T; score: number } | null {
  if (!items.length) return null;
  const ranked = rankByName(query, items, nameOf);
  if (ranked.length > 0 && ranked[0].score >= threshold) {
    return { best: ranked[0].item, score: ranked[0].score };
  }
  return null;
}

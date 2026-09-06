/**
 * Dice coefficient over character bigrams.
 *
 * Enough to match "Juan" against "Juan Mata" or "maria" against "María Sosa"
 * across a client list of a few dozen names, with no new dependency and no
 * `pg_trgm` extension to install.
 */
export function similarity(a: string, b: string): number {
  const left = normalize(a);
  const right = normalize(b);

  if (!left || !right) return 0;
  if (left === right) return 1;

  // A short query that is a whole word inside the candidate is a strong signal
  // that bigram overlap alone would understate ("Juan" vs "Juan Pérez Mata").
  if (right.split(' ').includes(left) || left.split(' ').includes(right)) return 0.95;

  const leftPairs = bigrams(left);
  const rightPairs = bigrams(right);
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

/** Lowercases, strips accents and punctuation, collapses whitespace. */
export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function bigrams(value: string): string[] {
  const pairs: string[] = [];
  for (const word of value.split(' ')) {
    for (let i = 0; i < word.length - 1; i++) pairs.push(word.slice(i, i + 2));
  }
  return pairs;
}

export interface Scored<T> {
  item: T;
  score: number;
}

export function rankByName<T>(query: string, items: T[], nameOf: (item: T) => string): Scored<T>[] {
  return items
    .map((item) => ({ item, score: similarity(query, nameOf(item)) }))
    .sort((a, b) => b.score - a.score);
}

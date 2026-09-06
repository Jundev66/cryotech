import { normalize } from './fuzzy.util';

/**
 * Builds the text part of a list `where`.
 *
 * Every word typed has to appear in some field — an AND of ORs — so "juan mata"
 * finds "Juan Pérez Mata" and not every Juan on the books. A single `contains`
 * over the whole phrase would find neither.
 *
 * A dotted field is a relation: `'client.name'` becomes
 * `{ client: { name: … } }`.
 *
 * Note what this does *not* do: Postgres `mode: 'insensitive'` ignores case but
 * not accents, so "jose" will not match "José" here. Where that matters —
 * clients, typed by hand every day — the caller falls back to `rankByName`,
 * which normalizes accents away. See `ClientsService.findAll`.
 */
export function textSearchWhere(
  search: string | undefined,
  fields: string[],
): Record<string, unknown> | undefined {
  const tokens = (search ?? '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || fields.length === 0) return undefined;

  return {
    AND: tokens.map((token) => ({
      OR: fields.map((field) => nest(field, { contains: token, mode: 'insensitive' })),
    })),
  };
}

/** `'client.name'` + leaf → `{ client: { name: leaf } }` */
function nest(path: string, leaf: unknown): Record<string, unknown> {
  return path
    .split('.')
    .reverse()
    .reduce<unknown>((value, key) => ({ [key]: value }), leaf) as Record<string, unknown>;
}

/**
 * Translates a typed word into enum values via its Spanish labels.
 *
 * Prisma rejects `contains` on an enum column, so without this, searching
 * "vacuna" in Finanzas — where every row is labelled *Vacuna* on screen —
 * returns nothing and the search looks broken. Matches on prefix rather than
 * equality so "pag" already finds *Pagado*.
 */
export function enumSearchValues(
  search: string | undefined,
  labels: Record<string, string>,
): string[] {
  const query = normalize(search ?? '');
  if (query.length < 3) return [];

  return Object.entries(labels)
    .filter(([, label]) => normalize(label).includes(query))
    .map(([value]) => value);
}

import { describe, expect, it } from 'vitest';
import { enumSearchValues, textSearchWhere } from './search.util';

describe('textSearchWhere', () => {
  it('requires every word to appear somewhere — an AND of ORs', () => {
    // "juan mata" has to find Juan Pérez Mata and not every Juan on the books.
    expect(textSearchWhere('juan mata', ['name'])).toEqual({
      AND: [
        { OR: [{ name: { contains: 'juan', mode: 'insensitive' } }] },
        { OR: [{ name: { contains: 'mata', mode: 'insensitive' } }] },
      ],
    });
  });

  it('turns a dotted field into a nested relation filter', () => {
    expect(textSearchWhere('ana', ['client.name'])).toEqual({
      AND: [{ OR: [{ client: { name: { contains: 'ana', mode: 'insensitive' } } }] }],
    });
  });

  it('is undefined with nothing to search for, so the caller omits the filter', () => {
    expect(textSearchWhere(undefined, ['name'])).toBeUndefined();
    expect(textSearchWhere('   ', ['name'])).toBeUndefined();
    expect(textSearchWhere('ana', [])).toBeUndefined();
  });
});

describe('enumSearchValues', () => {
  const labels = { feed: 'Alimento', vaccine: 'Vacuna', sale_live: 'Venta en pie' };

  it('finds the enum member behind the label shown on screen', () => {
    // Prisma refuses `contains` on an enum column, so without this, searching
    // "vacuna" in a table where every row reads *Vacuna* returns nothing.
    expect(enumSearchValues('vacuna', labels)).toEqual(['vaccine']);
  });

  it('matches on a prefix, so a half-typed word already narrows', () => {
    expect(enumSearchValues('ali', labels)).toEqual(['feed']);
  });

  it('ignores accents and case', () => {
    expect(enumSearchValues('ALIMENTO', labels)).toEqual(['feed']);
  });

  it('stays quiet under three characters instead of matching everything', () => {
    expect(enumSearchValues('va', labels)).toEqual([]);
    expect(enumSearchValues(undefined, labels)).toEqual([]);
  });

  it('is empty when nothing matches', () => {
    expect(enumSearchValues('zzz', labels)).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { normalize, rankByName, similarity } from './fuzzy.util';

describe('normalize', () => {
  it('strips accents, punctuation and case', () => {
    // This is what `contains … mode: 'insensitive'` in Postgres will not do,
    // and why client search falls back here.
    expect(normalize('José  Pérez-Mata')).toBe('jose perez mata');
  });
});

describe('similarity', () => {
  it('is 1 for the same name written differently', () => {
    expect(similarity('María Sosa', 'maria sosa')).toBe(1);
  });

  it('scores a whole word inside a longer name very high', () => {
    // Bigram overlap alone would understate this badly.
    expect(similarity('Juan', 'Juan Pérez Mata')).toBeGreaterThan(0.9);
  });

  it('still scores a partial word above nothing', () => {
    expect(similarity('marí', 'María Sosa')).toBeGreaterThan(0);
  });

  it('is 0 for unrelated names', () => {
    expect(similarity('Juan', 'Wilmer')).toBe(0);
  });

  it('is 0 when either side is empty', () => {
    expect(similarity('', 'Juan')).toBe(0);
    expect(similarity('Juan', '   ')).toBe(0);
  });
});

describe('rankByName', () => {
  it('puts the best match first', () => {
    const clients = [{ name: 'Wilmer Ruiz' }, { name: 'Juan Pérez Mata' }, { name: 'Ana Gil' }];
    const ranked = rankByName('juan mata', clients, (c) => c.name);
    expect(ranked[0].item.name).toBe('Juan Pérez Mata');
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it('returns every candidate scored — filtering is up to the caller', () => {
    const clients = [{ name: 'Wilmer Ruiz' }, { name: 'Ana Gil' }];
    expect(rankByName('zzz', clients, (c) => c.name)).toHaveLength(2);
  });
});

import { describe, it, expect } from 'vitest';
import { normalize, phoneticSpanish, similarity, rankByName, findBestMatch } from './fuzzy';

describe('normalize', () => {
  it('strips accents, punctuation and case', () => {
    expect(normalize('José  Pérez-Mata')).toBe('jose perez mata');
    expect(normalize('María (Hermana)')).toBe('maria hermana');
    expect(normalize('Tío Cándido')).toBe('tio candido');
  });
});

describe('phoneticSpanish', () => {
  it('converts z and ce/ci to s', () => {
    expect(phoneticSpanish('mercedez')).toBe(phoneticSpanish('Mercedes'));
    expect(phoneticSpanish('Gonzales')).toBe(phoneticSpanish('González'));
    expect(phoneticSpanish('Alicia')).toBe(phoneticSpanish('Alisia'));
  });

  it('converts v to b', () => {
    expect(phoneticSpanish('Wilver')).toBe(phoneticSpanish('Wilber'));
  });

  it('converts qu to k and hard c to k', () => {
    expect(phoneticSpanish('Carlos Pique')).toBe(phoneticSpanish('Carlos Pike'));
  });
});

describe('similarity', () => {
  it('is 1 for exact match after normalization', () => {
    expect(similarity('María Sosa', 'maria sosa')).toBe(1.0);
    expect(similarity('Abuela maria', 'abuela maria')).toBe(1.0);
  });

  it('is > 0.95 for phonetic matches like Mercedez vs Mercedes', () => {
    expect(similarity('mercedez', 'Mercedes')).toBeGreaterThanOrEqual(0.95);
    expect(similarity('Mercedes', 'mercedez')).toBeGreaterThanOrEqual(0.95);
    expect(similarity('gonzales', 'González')).toBeGreaterThanOrEqual(0.95);
  });

  it('scores word containment high (e.g. Abuela in Abuela Maria)', () => {
    expect(similarity('abuela', 'Abuela maria')).toBeGreaterThanOrEqual(0.9);
    expect(similarity('Abuela maria', 'abuela')).toBeGreaterThanOrEqual(0.9);
    expect(similarity('maria hermana', 'María (Hermana)')).toBeGreaterThanOrEqual(0.95);
  });

  it('handles typos with small edit distance (e.g. mercede vs Mercedes)', () => {
    expect(similarity('mercede', 'Mercedes')).toBeGreaterThanOrEqual(0.85);
    expect(similarity('mrcedes', 'Mercedes')).toBeGreaterThanOrEqual(0.85);
  });

  it('returns 0 for completely unrelated names', () => {
    expect(similarity('Juan', 'Wilmer')).toBe(0);
    expect(similarity('', 'Mercedes')).toBe(0);
  });
});

describe('rankByName and findBestMatch', () => {
  const clients = [
    { id: '1', name: 'Mercedes' },
    { id: '2', name: 'Maria' },
    { id: '3', name: 'Abuela maria' },
    { id: '4', name: 'María (Hermana)' },
    { id: '5', name: 'Carlos Pique' },
    { id: '6', name: 'Juan (Papa)' },
  ];

  it('finds Mercedes when searching mercedez', () => {
    const match = findBestMatch('mercedez', clients, (c) => c.name);
    expect(match).not.toBeNull();
    expect(match?.best.name).toBe('Mercedes');
    expect(match?.score).toBeGreaterThanOrEqual(0.95);
  });

  it('finds Abuela maria when searching abuela', () => {
    const match = findBestMatch('abuela', clients, (c) => c.name);
    expect(match).not.toBeNull();
    expect(match?.best.name).toBe('Abuela maria');
  });

  it('finds Carlos Pique when searching carlos pike', () => {
    const match = findBestMatch('carlos pike', clients, (c) => c.name);
    expect(match).not.toBeNull();
    expect(match?.best.name).toBe('Carlos Pique');
  });

  it('ranks María (Hermana) first when searching hermana', () => {
    const ranked = rankByName('hermana', clients, (c) => c.name);
    expect(ranked[0].item.name).toBe('María (Hermana)');
  });
});

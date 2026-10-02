import { describe, expect, it } from 'vitest';
import { daysBetween, isoDate, startOfToday } from './dates';

describe('isoDate', () => {
  it('is yyyy-mm-dd', () => {
    expect(isoDate(new Date(Date.UTC(2026, 4, 22, 15, 30)))).toBe('2026-05-22');
  });
});

describe('startOfToday', () => {
  it('is UTC midnight of the farm day, the instant a DATE column holds', () => {
    // 14:00 in Caracas on the 22nd.
    expect(startOfToday('America/Caracas', new Date('2026-05-22T18:00:00Z')).toISOString()).toBe(
      '2026-05-22T00:00:00.000Z',
    );
  });

  it('is still that day at 9 pm in Caracas, when UTC is already on the next one', () => {
    expect(startOfToday('America/Caracas', new Date('2026-05-23T01:00:00Z')).toISOString()).toBe(
      '2026-05-22T00:00:00.000Z',
    );
  });

  it('makes a sale due today not yet overdue', () => {
    const dueToday = new Date('2026-05-22T00:00:00.000Z');
    const today = startOfToday('America/Caracas', new Date('2026-05-22T23:30:00Z'));
    expect(dueToday < today).toBe(false);
  });
});

describe('daysBetween', () => {
  it('counts whole days', () => {
    const from = new Date(Date.UTC(2026, 4, 1));
    const to = new Date(Date.UTC(2026, 4, 22));
    expect(daysBetween(from, to)).toBe(21);
  });

  it('ignores the time of day', () => {
    const from = new Date(Date.UTC(2026, 4, 1, 23, 59));
    const to = new Date(Date.UTC(2026, 4, 2, 0, 1));
    expect(daysBetween(from, to)).toBe(0);
  });

  it('never goes negative, so a future due date reads as zero days old', () => {
    const from = new Date(Date.UTC(2026, 5, 1));
    const to = new Date(Date.UTC(2026, 4, 1));
    expect(daysBetween(from, to)).toBe(0);
  });
});

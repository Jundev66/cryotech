import { describe, expect, it } from 'vitest';
import { daysBetween, isoDate, startOfToday } from './dates';

describe('isoDate', () => {
  it('is yyyy-mm-dd', () => {
    expect(isoDate(new Date(Date.UTC(2026, 4, 22, 15, 30)))).toBe('2026-05-22');
  });
});

describe('startOfToday', () => {
  it('is local midnight', () => {
    const midnight = startOfToday();
    expect(midnight.getHours()).toBe(0);
    expect(midnight.getMinutes()).toBe(0);
    expect(midnight.getSeconds()).toBe(0);
    expect(midnight.getMilliseconds()).toBe(0);
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

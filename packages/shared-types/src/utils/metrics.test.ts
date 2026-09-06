import { describe, expect, it } from 'vitest';
import {
  calculateCostPerChicken,
  calculateCostPerKg,
  calculateDailyGain,
  calculateFCR,
  calculateMortalityRate,
  formatCurrency,
  formatUsd,
  formatWeight,
  getBatchWeek,
  round2,
} from './metrics';

describe('calculateFCR', () => {
  it('is feed over weight gained, to two decimals', () => {
    expect(calculateFCR(180, 100)).toBe(1.8);
    expect(calculateFCR(1, 3)).toBe(0.33);
  });

  it('returns null instead of dividing by zero', () => {
    // A batch with no weight recorded yet has no FCR. Reporting 0 would read as
    // a perfect conversion, which is the opposite of "we do not know".
    expect(calculateFCR(100, 0)).toBeNull();
    expect(calculateFCR(100, -5)).toBeNull();
  });
});

describe('calculateMortalityRate', () => {
  it('is a percentage of the initial quantity', () => {
    expect(calculateMortalityRate(5, 100)).toBe(5);
    expect(calculateMortalityRate(1, 3)).toBe(33.33);
  });

  it('reports zero for an empty batch rather than NaN', () => {
    expect(calculateMortalityRate(0, 0)).toBe(0);
  });
});

describe('calculateCostPerChicken', () => {
  it('spreads the expenses over the birds still in the corral', () => {
    expect(calculateCostPerChicken(1000, 40, 40)).toBe(25);
  });

  it('falls back to what the batch still counts once the corral is empty', () => {
    // Everything sold: the money was still spent, so it lands on the batch's
    // remaining quantity instead of vanishing.
    expect(calculateCostPerChicken(1000, 0, 50)).toBe(20);
  });

  it('never divides by zero on a closed batch', () => {
    expect(calculateCostPerChicken(1000, 0, 0)).toBe(1000);
  });

  it('is zero when nothing was spent', () => {
    expect(calculateCostPerChicken(0, 0, 0)).toBe(0);
  });
});

describe('calculateCostPerKg', () => {
  it('divides expenses by kilos', () => {
    expect(calculateCostPerKg(500, 125)).toBe(4);
  });

  it('returns null with no weight to divide by', () => {
    expect(calculateCostPerKg(500, 0)).toBeNull();
  });
});

describe('calculateDailyGain', () => {
  it('is the difference between two weights, and may be negative', () => {
    expect(calculateDailyGain(1250, 1180)).toBe(70);
    expect(calculateDailyGain(1180, 1250)).toBe(-70);
  });
});

describe('round2', () => {
  it('keeps two decimals', () => {
    expect(round2(2.344)).toBe(2.34);
    expect(round2(2.345)).toBe(2.35);
    expect(round2(10)).toBe(10);
  });

  it('works on negatives, which is what a loss looks like', () => {
    expect(round2(-2.344)).toBe(-2.34);
  });

  it('inherits binary floating point, as every JS rounding does', () => {
    // 1.005 is stored as 1.00499999…, so it rounds down. Recorded here on
    // purpose: the number that reaches the database is this one, and a report
    // that disagrees by a cent disagrees for this reason and not another.
    expect(round2(1.005)).toBe(1);
  });
});

describe('getBatchWeek', () => {
  it('counts from one, so day zero is still week one', () => {
    const today = new Date();
    expect(getBatchWeek(today.toISOString().slice(0, 10))).toBe(1);
  });
});

describe('formatting', () => {
  it('writes bolivares the Venezuelan way: dots group, comma decides', () => {
    // Reading 2.450,00 as 2.45 is the mistake this format exists to prevent.
    expect(formatCurrency(2450)).toBe('Bs 2.450,00');
  });

  it('writes dollars the other way round', () => {
    expect(formatUsd(2450)).toBe('$2,450.00');
  });

  it('switches from grams to kilos at a thousand', () => {
    expect(formatWeight(950)).toBe('950 g');
    expect(formatWeight(2450)).toBe('2,45 kg');
  });
});

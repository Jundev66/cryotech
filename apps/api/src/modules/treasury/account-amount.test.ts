import { describe, expect, it } from 'vitest';
import { amountForAccount } from './account-amount';

describe('amountForAccount', () => {
  it('books bolivares in a bolivar account', () => {
    expect(amountForAccount({ accountCurrency: 'VES', amountBs: 5000, amountUsd: 20, rate: 250 })).toBe(5000);
  });

  it('books the dollar figure in a dollar account when there is one', () => {
    expect(amountForAccount({ accountCurrency: 'USD', amountBs: 5000, amountUsd: 20, rate: 250 })).toBe(20);
  });

  it('converts bolivares to dollars for a dollar account', () => {
    expect(amountForAccount({ accountCurrency: 'USD', amountBs: 5000, amountUsd: null, rate: 250 })).toBe(20);
    expect(amountForAccount({ accountCurrency: 'USD', amountBs: 1000, amountUsd: null, rate: 3 })).toBe(333.33);
  });

  it('refuses to guess without a rate', () => {
    expect(() => amountForAccount({ accountCurrency: 'USD', amountBs: 5000, amountUsd: null, rate: null })).toThrow();
  });
});

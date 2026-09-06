import { describe, expect, it } from 'vitest';
import {
  normalizeLabel,
  parseAccountRef,
  parseAmount,
  parseCurrency,
  parseDate,
  parseReference,
} from './patterns';

describe('parseAmount', () => {
  it('reads the Venezuelan format: dots group, comma decides', () => {
    expect(parseAmount('2.450,00')).toBe(2450);
    expect(parseAmount('1.234.567,89')).toBe(1234567.89);
  });

  it('reads the US format too', () => {
    expect(parseAmount('2,450.00')).toBe(2450);
  });

  it('decides by whichever separator comes last', () => {
    // The whole point: reading 2.450,00 as 2.45 under-records a payment by
    // three orders of magnitude, and it would be confirmed without a blink.
    expect(parseAmount('2.450,00')).not.toBe(2.45);
    expect(parseAmount('2,450.00')).not.toBe(2.45);
  });

  it('takes the figure out of a line with a currency marker', () => {
    expect(parseAmount('Monto: Bs. 3.200,50')).toBe(3200.5);
  });

  it('handles a bare integer', () => {
    expect(parseAmount('500')).toBe(500);
  });

  it('is null when there is no number at all', () => {
    expect(parseAmount('Transferencia exitosa')).toBeNull();
  });
});

describe('parseCurrency', () => {
  it('recognises bolivares and dollars', () => {
    expect(parseCurrency('Bs 2.450,00')).toBe('VES');
    expect(parseCurrency('Monto en VES')).toBe('VES');
    expect(parseCurrency('USD 40.00')).toBe('USD');
    expect(parseCurrency('$40.00')).toBe('USD');
  });

  it('is null rather than guessing', () => {
    expect(parseCurrency('2.450,00')).toBeNull();
  });
});

describe('parseDate', () => {
  const today = new Date(2026, 4, 22);

  it('reads day-first, as Venezuelan receipts print it', () => {
    expect(parseDate('05/03/2026', today)).toBe('2026-03-05');
  });

  it('reads ISO when that is what is printed', () => {
    expect(parseDate('2026-03-05', today)).toBe('2026-03-05');
  });

  it('expands a two-digit year', () => {
    expect(parseDate('05/03/26', today)).toBe('2026-03-05');
  });

  it('rejects a date in the future — that is a misread digit, not a receipt', () => {
    expect(parseDate('05/03/2027', today)).toBeNull();
  });

  it('rejects one more than a year old for the same reason', () => {
    expect(parseDate('05/03/2020', today)).toBeNull();
  });

  it('rejects a day that does not exist', () => {
    expect(parseDate('31/02/2026', today)).toBeNull();
    expect(parseDate('05/13/2026', today)).toBeNull();
  });
});

describe('parseReference', () => {
  it('keeps only the digits of the operation number', () => {
    expect(parseReference('Operación: 0012 3456 78')).toBe('0012345678');
  });

  it('ignores runs too short to be a reference', () => {
    expect(parseReference('Ref: 123')).toBeNull();
  });
});

describe('parseAccountRef', () => {
  it('splits a masked account into bank code and tail', () => {
    expect(parseAccountRef('0102 **** 5678')).toMatchObject({
      bankCode: '0102',
      last4: '5678',
      phone: null,
    });
    expect(parseAccountRef('0134-XXXX-4321')).toMatchObject({ bankCode: '0134', last4: '4321' });
  });

  it('normalises a pago movil number to its ten digits', () => {
    expect(parseAccountRef('Origen: 0412-345-9065')).toMatchObject({ phone: '04123459065' });
    expect(parseAccountRef('+58 412 345 9065')).toMatchObject({ phone: '04123459065' });
  });

  it('takes the tail of a full account number', () => {
    expect(parseAccountRef('01020123451234567890')).toMatchObject({
      bankCode: '0102',
      last4: '7890',
    });
  });

  it('accepts a tail with no bank code', () => {
    expect(parseAccountRef('****5678')).toMatchObject({ bankCode: null, last4: '5678' });
  });

  it('is null when the line holds no account at all', () => {
    expect(parseAccountRef('Beneficiario: Ana Perez')).toBeNull();
  });
});

describe('normalizeLabel', () => {
  it('strips accents, punctuation and case so a caption matches however it was printed', () => {
    expect(normalizeLabel('  Nro. de Referencia:  ')).toBe('nro de referencia');
    expect(normalizeLabel('OPERACIÓN')).toBe('operacion');
  });
});

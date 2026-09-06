import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { parseEnum } from './parse-enum.util';

const PaymentStatus = { pending: 'pending', partial: 'partial', paid: 'paid' } as const;

describe('parseEnum', () => {
  it('lets a valid member through', () => {
    expect(parseEnum(PaymentStatus, 'paid', 'paymentStatus')).toBe('paid');
  });

  it('treats an absent or empty query param as no filter', () => {
    expect(parseEnum(PaymentStatus, undefined, 'paymentStatus')).toBeUndefined();
    expect(parseEnum(PaymentStatus, '', 'paymentStatus')).toBeUndefined();
  });

  it('rejects a typo with a 400 instead of letting Prisma answer 500', () => {
    // `?paymentStatus=pendinng` used to reach the query engine and come back as
    // a server error, which reads as "the API is broken" rather than "you typed
    // it wrong".
    expect(() => parseEnum(PaymentStatus, 'pendinng', 'paymentStatus')).toThrow(BadRequestException);
  });

  it('names the accepted values in the message', () => {
    expect(() => parseEnum(PaymentStatus, 'x', 'paymentStatus')).toThrow(
      /paymentStatus debe ser uno de: pending, partial, paid/,
    );
  });

  it('does not accept a value from a different enum', () => {
    expect(() => parseEnum(PaymentStatus, 'breeding', 'paymentStatus')).toThrow(BadRequestException);
  });
});

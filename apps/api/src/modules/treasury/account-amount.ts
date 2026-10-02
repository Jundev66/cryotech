import { BadRequestException } from '@nestjs/common';

/**
 * How much of an operation lands in an account, in that account's currency.
 *
 * Every movement is denominated in the account's own currency, but operations
 * are recorded in bolivares with an optional dollar figure. Booking the
 * bolivar amount straight into a dollar account turned a Bs 5.000 expense into
 * $5.000 gone from the cash box.
 */
export function amountForAccount(params: {
  accountCurrency: string;
  amountBs: number;
  /** The dollar figure when the operation was stated in dollars. */
  amountUsd: number | null;
  /** Bolivares per dollar, to convert when no dollar figure was given. */
  rate: number | null;
}): number {
  if (params.accountCurrency !== 'USD') return round2(params.amountBs);

  if (params.amountUsd !== null) return round2(params.amountUsd);
  if (!params.rate || params.rate <= 0) {
    throw new BadRequestException(
      'No hay tasa de cambio para pasar el monto a dólares, y la cuenta es en dólares.',
    );
  }
  return round2(params.amountBs / params.rate);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

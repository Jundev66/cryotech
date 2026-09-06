import type { PayableKind } from '@cryotech/shared-types';

/** The kinds of operation you can owe money on: a purchase or a processing job. */
export type { PayableKind };

/**
 * A purchase and a processing job in one shape, so the bot and the web page can
 * list "what I owe" without caring which table it came from.
 *
 * Every money field is in **bolivares**. Purchases already store their cost that
 * way; processings store theirs in dollars with the bolivar figure alongside, so
 * that is the one that ends up here.
 */
export interface OpenPayable {
  kind: PayableKind;
  id: string;
  code: string | null;
  /** Human label, e.g. "Beneficio de 7 aves · LOT-2600003". */
  description: string;
  supplierName: string | null;
  total: number;
  paid: number;
  balance: number;
  date: Date;
  /**
   * When the row was written, which is not the same as `date`.
   *
   * `date` is the day the operation happened and can be backdated; this is the
   * moment it was registered. The bot uses it to put what you just registered
   * at the top of a receipt's options — a purchase filed two minutes ago is
   * almost certainly what the screenshot you are sending now pays for.
   */
  createdAt: Date;
  batchId: string | null;
  batchCode: string | null;
}

export interface RegisterPayablePaymentInput {
  kind: PayableKind;
  payableId: string;
  /** Bolivares unless `currency` says otherwise. */
  amount: number;
  currency?: 'VES' | 'USD';
  exchangeRate?: number;
  paymentDate?: string | Date;
  accountId?: string;
  reference?: string;
  notes?: string;
}

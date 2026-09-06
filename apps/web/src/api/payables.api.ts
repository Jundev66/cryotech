import type { PayableKind, PayablePaymentInput } from '@cryotech/shared-types';
import api from './client';

/**
 * A purchase or a processing job in one shape: everything the business owes.
 *
 * Every figure is in bolivares. Purchases store their cost that way already;
 * processings store theirs in dollars with the bolivar figure alongside, and the
 * API sends the bolivar one — reading `totalCost` off a processing would be off
 * by the exchange rate.
 */
export interface OpenPayable {
  kind: PayableKind;
  id: string;
  code: string | null;
  description: string;
  supplierName: string | null;
  total: number;
  paid: number;
  balance: number;
  date: string;
  batchId: string | null;
  batchCode: string | null;
}

export interface PayablePayment {
  id: string;
  amount: string;
  amountUsd: string | null;
  exchangeRate: string | null;
  accountId: string | null;
  reference: string | null;
  paymentDate: string;
  notes: string | null;
}

export const payablesApi = {
  listOpen: (kind?: PayableKind) =>
    api.get<OpenPayable[]>('/payables', { params: kind ? { kind } : undefined }).then((r) => r.data),

  findOne: (kind: PayableKind, id: string) =>
    api.get<OpenPayable>(`/payables/${kind}/${id}`).then((r) => r.data),

  getPayments: (kind: PayableKind, id: string) =>
    api.get<PayablePayment[]>(`/payables/${kind}/${id}/payments`).then((r) => r.data),

  /** Moves cash only — the operation already recognised the expense. */
  registerPayment: (kind: PayableKind, id: string, data: PayablePaymentInput) =>
    api.post<PayablePayment>(`/payables/${kind}/${id}/payments`, data).then((r) => r.data),
};

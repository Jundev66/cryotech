import type { Transaction } from '@cryotech/shared-types';
import api from './client';

interface Money {
  bs: number;
  usd: number;
}

export interface CashFlowSummary {
  /** Operating income: sales collected and other income, without owner capital. */
  income: Money;
  /** Operating expenses, without owner withdrawals. */
  expenses: Money;
  capitalIn: Money;
  ownerDraw: Money;
  /** Cash on hand: everything that came in minus everything that left. */
  balance: Money;
  receivables: { usd: number; count: number };
  exchangeRate: number;
}

export const transactionsApi = {
  findAll: (params?: { type?: string; category?: string; startDate?: string; endDate?: string; batchId?: string; sourceType?: string; search?: string }) =>
    api.get<Transaction[]>('/transactions', { params }).then(r => r.data),
  findOne: (id: string) => api.get<Transaction>(`/transactions/${id}`).then(r => r.data),
  getCashFlow: (params?: { startDate?: string; endDate?: string; batchId?: string }) =>
    api.get<CashFlowSummary>('/transactions/cash-flow', { params }).then(r => r.data),
  /** Undoes a hand-recorded income or expense and the money it moved. */
  voidManual: (id: string) =>
    api.post<{ success: boolean; code: string | null }>(`/transactions/${id}/void`).then(r => r.data),
};

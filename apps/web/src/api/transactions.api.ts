import type { Transaction } from '@cryotech/shared-types';
import api from './client';

export interface CashFlowSummary {
  income: { bs: number; usd: number };
  expenses: { bs: number; usd: number };
  balance: { bs: number; usd: number };
  receivables: { usd: number; count: number };
  exchangeRate: number;
}

export const transactionsApi = {
  findAll: (params?: { type?: string; category?: string; startDate?: string; endDate?: string; batchId?: string; sourceType?: string; search?: string }) =>
    api.get<Transaction[]>('/transactions', { params }).then(r => r.data),
  findOne: (id: string) => api.get<Transaction>(`/transactions/${id}`).then(r => r.data),
  getCashFlow: (params?: { startDate?: string; endDate?: string; batchId?: string }) =>
    api.get<CashFlowSummary>('/transactions/cash-flow', { params }).then(r => r.data),
};

import type { FcrSeries, GrowthCurve, MortalityByBatch, RevenueExpenseDataPoint, BatchStats, BatchProfitability } from '@cryotech/shared-types';
import api from './client';

// Both per-batch reports arrive wrapped — `fcr-trend` as one series per batch,
// `growth-curve` as an object — and the charts want the plain array.
export const reportsApi = {
  getFcr: (batchId: string) =>
    api.get<FcrSeries[]>('/reports/fcr-trend', { params: { batchId } })
      .then(r => r.data[0]?.data ?? []),
  getMortality: () => api.get<MortalityByBatch[]>('/reports/mortality-by-batch').then(r => r.data),
  getRevenue: () => api.get<RevenueExpenseDataPoint[]>('/reports/revenue-expense').then(r => r.data),
  getGrowthCurve: (batchId: string) =>
    api.get<GrowthCurve>('/reports/growth-curve', { params: { batchId } })
      .then(r => r.data?.data ?? []),
  getTopBatches: () => api.get<BatchStats[]>('/reports/top-batches').then(r => r.data),
  getBatchProfitability: () => api.get<BatchProfitability[]>('/reports/batch-profitability').then(r => r.data),
};

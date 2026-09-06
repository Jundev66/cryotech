import type { FeedConsumption, FeedFormula, FeedPhaseConfig, FeedPhaseConfigInput } from '@cryotech/shared-types';
import api from './client';

export const feedApi = {
  // Formulas
  getFormulas: () => api.get<FeedFormula[]>('/feed/formulas').then(r => r.data),
  createFormula: (data: { breed: string; weekNumber: number; dailyFeedPerBirdG: number; feedPhase?: string; notes?: string }) =>
    api.post<FeedFormula>('/feed/formulas', data).then(r => r.data),
  updateFormula: (id: string, data: Partial<FeedFormula>) =>
    api.patch<FeedFormula>(`/feed/formulas/${id}`, data).then(r => r.data),
  removeFormula: (id: string) => api.delete(`/feed/formulas/${id}`).then(r => r.data),

  // Consumptions
  getConsumptions: (params?: { batchId?: string; status?: string; search?: string }) =>
    api.get<FeedConsumption[]>('/feed/consumptions', { params }).then(r => r.data),
  createConsumption: (data: { batchId: string; productId: string; consumptionDate: string; quantityKg: number; notes?: string }) =>
    api.post<FeedConsumption>('/feed/consumptions', data).then(r => r.data),
  updateConsumption: (id: string, data: { quantityKg?: number; productId?: string; notes?: string }) =>
    api.patch<FeedConsumption>(`/feed/consumptions/${id}`, data).then(r => r.data),
  approveConsumption: (id: string) =>
    api.patch<FeedConsumption>(`/feed/consumptions/${id}/approve`).then(r => r.data),
  adjustConsumption: (id: string, adjustedQuantityKg: number) =>
    api.patch<FeedConsumption>(`/feed/consumptions/${id}/adjust`, { adjustedQuantityKg }).then(r => r.data),
  rejectConsumption: (id: string) =>
    api.delete(`/feed/consumptions/${id}/reject`).then(r => r.data),
  autoGenerate: () =>
    api.post('/feed/auto-generate').then(r => r.data),
  autoGenerateForBatch: (batchId: string) =>
    api.post<FeedConsumption>(`/feed/auto-generate/${batchId}`).then(r => r.data),

  // Phase configs
  getPhaseConfigs: () =>
    api.get<FeedPhaseConfig[]>('/feed/phase-configs').then(r => r.data),
  createPhaseConfig: (data: FeedPhaseConfigInput) =>
    api.post<FeedPhaseConfig>('/feed/phase-configs', data).then(r => r.data),
  updatePhaseConfig: (id: string, data: FeedPhaseConfigInput) =>
    api.patch<FeedPhaseConfig>(`/feed/phase-configs/${id}`, data).then(r => r.data),
};

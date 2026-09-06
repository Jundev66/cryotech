import type { Batch } from '@cryotech/shared-types';
import api from './client';

export const batchesApi = {
  findAll: (params?: { search?: string }) => api.get<Batch[]>('/batches', { params }).then(r => r.data),
  findOne: (id: string) => api.get<Batch>(`/batches/${id}`).then(r => r.data),
  create: (data: { warehouseId: string; breed: string; startDate: string; initialQuantity: number; currentQuantity: number; purchasePricePerUnit?: number; status?: string; notes?: string; entryLines?: Array<{ productId: string; quantity: number; costPerUnit?: number; deliveryCost?: number; notes?: string }> }) => api.post<Batch>('/batches', data).then(r => r.data),
  update: (id: string, data: Partial<Batch>) => api.patch<Batch>(`/batches/${id}`, data).then(r => r.data),
  updateStatus: (id: string, status: string) => api.patch<Batch>(`/batches/${id}/status`, { status }).then(r => r.data),
  addEntryLine: (id: string, data: { productId: string; quantity: number; costPerUnit?: number; deliveryCost?: number; notes?: string }) => api.post<Batch>(`/batches/${id}/entry-lines`, data).then(r => r.data),
  updateEntryLine: (id: string, lineId: string, data: { quantity?: number; costPerUnit?: number; deliveryCost?: number; notes?: string }) => api.patch<Batch>(`/batches/${id}/entry-lines/${lineId}`, data).then(r => r.data),
  removeEntryLine: (id: string, lineId: string) => api.delete<Batch>(`/batches/${id}/entry-lines/${lineId}`).then(r => r.data),
  remove: (id: string) => api.delete(`/batches/${id}`).then(r => r.data),
};

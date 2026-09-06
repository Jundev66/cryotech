import type { BulkSaleInput, Sale, SaleInput, SalePayment } from '@cryotech/shared-types';
import api from './client';

export const salesApi = {
  findAll: (params?: { batchId?: string; paymentStatus?: string; search?: string }) =>
    api.get<Sale[]>('/sales', { params }).then(r => r.data),
  findOne: (id: string) => api.get<Sale>(`/sales/${id}`).then(r => r.data),
  create: (data: SaleInput) => api.post<Sale>('/sales', data).then(r => r.data),
  createMany: (data: BulkSaleInput) => api.post<Sale[]>('/sales/bulk', data).then(r => r.data),
  update: (id: string, data: Partial<Sale>) => api.patch<Sale>(`/sales/${id}`, data).then(r => r.data),
  remove: (id: string) => api.delete(`/sales/${id}`).then(r => r.data),
  registerPayment: (saleId: string, data: { amount: number; amountBs?: number; exchangeRate?: number; paymentDate?: string; notes?: string }) =>
    api.post<SalePayment>(`/sales/${saleId}/payments`, data).then(r => r.data),
  getPayments: (saleId: string) =>
    api.get<SalePayment[]>(`/sales/${saleId}/payments`).then(r => r.data),
};

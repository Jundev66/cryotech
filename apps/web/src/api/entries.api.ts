import type { ProductEntry, ProductEntryInput } from '@cryotech/shared-types';
import api from './client';

export const entriesApi = {
  findAll: (params?: { productId?: string; batchId?: string; status?: string; search?: string }) =>
    api.get<ProductEntry[]>('/entries', { params }).then(r => r.data),
  create: (data: ProductEntryInput) =>
    api.post<ProductEntry>('/entries', data).then(r => r.data),
  receive: (id: string) =>
    api.patch<ProductEntry>(`/entries/${id}/receive`).then(r => r.data),
  remove: (id: string) =>
    api.delete(`/entries/${id}`).then(r => r.data),
};

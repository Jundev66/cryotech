import type { Client } from '@cryotech/shared-types';
import api from './client';

export const clientsApi = {
  findAll: (params?: { search?: string; limit?: number }) => api.get<Client[]>('/clients', { params }).then(r => r.data),
  create: (data: { name: string; phone?: string; email?: string; address?: string }) => api.post<Client>('/clients', data).then(r => r.data),
  update: (id: string, data: Partial<{ name: string; phone: string; email: string; address: string }>) => api.patch<Client>(`/clients/${id}`, data).then(r => r.data),
  remove: (id: string) => api.delete(`/clients/${id}`).then(r => r.data),
};

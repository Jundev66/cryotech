import type { Company } from '@cryotech/shared-types';
import api from './client';

export interface CompanyWithRole extends Company {
  isOwner?: boolean;
}

export const companiesApi = {
  create: (data: { name: string; phone?: string; address?: string }) => api.post<Company>('/companies', data).then(r => r.data),
  findAll: () => api.get<CompanyWithRole[]>('/companies').then(r => r.data),
  findOne: (id: string) => api.get<Company>(`/companies/${id}`).then(r => r.data),
  update: (id: string, data: Partial<{ name: string; phone: string; address: string }>) => api.patch<Company>(`/companies/${id}`, data).then(r => r.data),
  remove: (id: string) => api.delete(`/companies/${id}`).then(r => r.data),
};

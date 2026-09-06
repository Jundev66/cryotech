import type { CompanyMember } from '@cryotech/shared-types';
import api from './client';

export const membersApi = {
  findAll: (companyId: string) => api.get<CompanyMember[]>(`/companies/${companyId}/members`).then(r => r.data),
  add: (companyId: string, data: { email: string; roleId?: string }) => api.post<CompanyMember>(`/companies/${companyId}/members`, data).then(r => r.data),
  updateRole: (companyId: string, memberId: string, data: { roleId: string }) => api.patch<CompanyMember>(`/companies/${companyId}/members/${memberId}`, data).then(r => r.data),
  setPassword: (companyId: string, memberId: string, data: { password: string }) =>
    api.post(`/companies/${companyId}/members/${memberId}/password`, data).then(r => r.data),
  remove: (companyId: string, memberId: string) => api.delete(`/companies/${companyId}/members/${memberId}`).then(r => r.data),
};

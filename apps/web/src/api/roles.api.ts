import type { Role, RoleInput, RoleUpdateInput } from '@cryotech/shared-types';
import api from './client';

/**
 * Bodies are typed with the Zod schemas, not with the `Permissions` interface.
 *
 * `Permissions` describes what the API *returns*, where every module exists.
 * What is *sent* may omit modules — a role without treasury simply does not
 * have it — and the schema is also what the server validates, so typing
 * against it turns a mismatch into a compile error instead of a runtime 400.
 */
export const rolesApi = {
  findAll: (companyId: string) => api.get<Role[]>(`/companies/${companyId}/roles`).then(r => r.data),
  create: (companyId: string, data: RoleInput) => api.post<Role>(`/companies/${companyId}/roles`, data).then(r => r.data),
  update: (companyId: string, roleId: string, data: RoleUpdateInput) => api.patch<Role>(`/companies/${companyId}/roles/${roleId}`, data).then(r => r.data),
  remove: (companyId: string, roleId: string) => api.delete(`/companies/${companyId}/roles/${roleId}`).then(r => r.data),
};

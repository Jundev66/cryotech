import type { Warehouse } from '@cryotech/shared-types';
import api from './client';

export interface WarehouseWithStats extends Warehouse {
  activeBatchCount?: number;
}

export const warehousesApi = {
  findAll: (params?: { search?: string }) => api.get<WarehouseWithStats[]>('/warehouses', { params }).then(r => r.data),
  create: (data: { name: string; capacity?: number; location?: string; isMain?: boolean }) => api.post<Warehouse>('/warehouses', data).then(r => r.data),
  update: (id: string, data: Partial<{ name: string; capacity: number; location: string; isMain: boolean }>) => api.patch<Warehouse>(`/warehouses/${id}`, data).then(r => r.data),
  remove: (id: string) => api.delete(`/warehouses/${id}`).then(r => r.data),
};

import type { ProductConsumption, ProductConsumptionInput } from '@cryotech/shared-types';
import api from './client';

export const productConsumptionsApi = {
  findAll: (params?: { batchId?: string; productId?: string }) =>
    api.get<ProductConsumption[]>('/product-consumptions', { params }).then(r => r.data),
  create: (data: ProductConsumptionInput) =>
    api.post<ProductConsumption>('/product-consumptions', data).then(r => r.data),
  remove: (id: string) =>
    api.delete(`/product-consumptions/${id}`).then(r => r.data),
};

import type { Product, MeasurementUnit, ProductCategoryConfig } from '@cryotech/shared-types';
import api from './client';

export const productsApi = {
  findAll: (params?: { search?: string }) => api.get<Product[]>('/products', { params }).then(r => r.data),
  create: (data: { name: string; categoryId: string; unitId: string; currentStock?: number; minStock?: number; productType?: string }) =>
    api.post<Product>('/products', data).then(r => r.data),
  update: (id: string, data: Partial<Product>) => api.patch<Product>(`/products/${id}`, data).then(r => r.data),
  remove: (id: string) => api.delete(`/products/${id}`).then(r => r.data),
};

export const measurementUnitsApi = {
  findAll: () => api.get<MeasurementUnit[]>('/measurement-units').then(r => r.data),
  create: (data: { name: string; abbreviation: string }) =>
    api.post<MeasurementUnit>('/measurement-units', data).then(r => r.data),
  update: (id: string, data: Partial<MeasurementUnit>) =>
    api.patch<MeasurementUnit>(`/measurement-units/${id}`, data).then(r => r.data),
  remove: (id: string) => api.delete(`/measurement-units/${id}`).then(r => r.data),
};

export const productCategoriesApi = {
  findAll: () => api.get<ProductCategoryConfig[]>('/product-categories').then(r => r.data),
  create: (data: { name: string; slug: string }) =>
    api.post<ProductCategoryConfig>('/product-categories', data).then(r => r.data),
  update: (id: string, data: Partial<ProductCategoryConfig>) =>
    api.patch<ProductCategoryConfig>(`/product-categories/${id}`, data).then(r => r.data),
  remove: (id: string) => api.delete(`/product-categories/${id}`).then(r => r.data),
};

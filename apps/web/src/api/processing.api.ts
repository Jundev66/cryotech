import type { Processing, ProcessingPayload } from '@cryotech/shared-types';
import api from './client';

export const processingApi = {
  findAll: (params?: { batchId?: string; search?: string }) =>
    api.get<Processing[]>('/processing', { params }).then(r => r.data),
  create: (data: ProcessingPayload) =>
    api.post<Processing>('/processing', data).then(r => r.data),
};

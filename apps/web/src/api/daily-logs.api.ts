import type { DailyLog, DailyLogInput } from '@cryotech/shared-types';
import api from './client';

export const dailyLogsApi = {
  findAll: (params?: { batchId?: string }) =>
    api.get<DailyLog[]>('/daily-logs', { params }).then(r => r.data),
  create: (data: DailyLogInput) => api.post<DailyLog>('/daily-logs', data).then(r => r.data),
  update: (id: string, data: Partial<DailyLogInput>) => api.patch<DailyLog>(`/daily-logs/${id}`, data).then(r => r.data),
  remove: (id: string) => api.delete(`/daily-logs/${id}`).then(r => r.data),
};

import type { DashboardStats, BatchStatusDistribution } from '@cryotech/shared-types';
import api from './client';

export interface RecentActivityItem {
  id: string;
  type: string;
  description: string;
  date: string;
}

export const dashboardApi = {
  getStats: () => api.get<DashboardStats>('/dashboard/stats').then(r => r.data),
  getRecentActivity: () => api.get<RecentActivityItem[]>('/dashboard/recent-activity').then(r => r.data),
  getStatusDistribution: () => api.get<BatchStatusDistribution[]>('/dashboard/batch-status-distribution').then(r => r.data),
};

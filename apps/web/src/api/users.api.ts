import type { User } from '@cryotech/shared-types';
import api from './client';

export const usersApi = {
  getProfile: () => api.get<User>('/users/me').then(r => r.data),
  updateProfile: (data: { fullName?: string; phone?: string }) => api.patch<User>('/users/me', data).then(r => r.data),
};

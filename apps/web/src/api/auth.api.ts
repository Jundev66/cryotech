import type { AuthResponse, LoginInput, RegisterInput } from '@cryotech/shared-types';
import api from './client';

export const authApi = {
  login: (data: LoginInput) => api.post<AuthResponse>('/auth/login', data).then(r => r.data),
  register: (data: RegisterInput) => api.post<AuthResponse>('/auth/register', data).then(r => r.data),
  logout: () => api.post('/auth/logout').then(r => r.data),
  refresh: () => api.post<AuthResponse>('/auth/refresh').then(r => r.data),
};

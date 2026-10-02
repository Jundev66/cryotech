import type { AuthResponse, LoginInput, RegisterInput } from '@cryotech/shared-types';
import api from './client';

export const authApi = {
  login: (data: LoginInput) => api.post<AuthResponse>('/auth/login', data).then(r => r.data),
  register: (data: RegisterInput) => api.post<AuthResponse>('/auth/register', data).then(r => r.data),
  logout: () => {
    const refreshToken = localStorage.getItem('cryotech_refresh_token');
    return api.post('/auth/logout', { refreshToken }).then(r => r.data);
  },
  refresh: () => {
    const refreshToken = localStorage.getItem('cryotech_refresh_token');
    return api.post<AuthResponse>('/auth/refresh', { refreshToken }).then(r => r.data);
  },
  createDemoSession: () => api.post<AuthResponse & { company: { id: string; name: string; isDemo: boolean } }>('/auth/demo').then(r => r.data),
};

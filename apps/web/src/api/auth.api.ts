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
  createDemoSession: async (lead?: { email?: string; fullName?: string }) => {
    type DemoResponse = AuthResponse & { company: { id: string; name: string; isDemo: boolean } };
    try {
      const res = await api.post<DemoResponse>('/auth/demo', lead);
      return res.data;
    } catch (err: unknown) {
      // Si el backend en Render estaba durmiendo (cold start) y devolvió 502/503/504 o timeout,
      // reintentar una vez con una pausa breve mientras termina de despertar el contenedor.
      const errorObj = err as { response?: { status?: number }; code?: string };
      const status = errorObj?.response?.status;
      const isColdStartFailure = !status || [502, 503, 504].includes(status) || errorObj?.code === 'ECONNABORTED';

      if (isColdStartFailure) {
        await new Promise((resolve) => setTimeout(resolve, 3500));
        const retryRes = await api.post<DemoResponse>('/auth/demo', lead);
        return retryRes.data;
      }
      throw err;
    }
  },
};

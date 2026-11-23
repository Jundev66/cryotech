import type { AuthResponse, LoginInput, RegisterInput, CreateDemoLeadInput } from '@cryotech/shared-types';
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
  createDemoSession: async (lead?: Partial<CreateDemoLeadInput> & { email?: string; fullName?: string }) => {
    type DemoResponse = AuthResponse & { company: { id: string; name: string; isDemo: boolean }; leadId?: string };
    const endpoint = lead?.phone ? '/demo/leads' : '/auth/demo';
    try {
      const res = await api.post<DemoResponse>(endpoint, lead);
      return res.data;
    } catch (err: unknown) {
      const errorObj = err as { response?: { status?: number }; code?: string };
      const status = errorObj?.response?.status;

      // Si /demo/leads devolvio 404 (ej. despliegue en progreso en backend), reintentar contra /auth/demo
      if (status === 404 && endpoint === '/demo/leads') {
        try {
          const fallbackRes = await api.post<DemoResponse>('/auth/demo', lead);
          return fallbackRes.data;
        } catch {
          // Si tambien falla, continuar con manejo de error normal
        }
      }

      // Si el backend en Render estaba durmiendo (cold start) y devolvio 502/503/504 o timeout,
      // reintentar una vez con una pausa breve mientras termina de despertar el contenedor.
      const isColdStartFailure = !status || [502, 503, 504].includes(status) || errorObj?.code === 'ECONNABORTED';

      if (isColdStartFailure) {
        await new Promise((resolve) => setTimeout(resolve, 3500));
        const retryRes = await api.post<DemoResponse>(endpoint, lead);
        return retryRes.data;
      }
      throw err;
    }
  },
};

export const demoLeadsApi = {
  list: (params?: { page?: number; limit?: number; status?: string; source?: string }) =>
    api.get('/demo/leads', { params }).then(r => r.data),
  updateStatus: (id: string, status: string, notes?: string) =>
    api.patch(`/demo/leads/${id}/status`, { status, notes }).then(r => r.data),
};

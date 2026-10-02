import axios from 'axios';
import { storage } from '@/lib/native';

// In Capacitor native, use full URL if provided; otherwise relative /api for web/proxy
const BASE_URL = (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL || '/api';

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  const token = localStorage.getItem('cryotech_access_token') || (await storage.get('cryotech_access_token'));
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const companyId = localStorage.getItem('cryotech_company_id') || (await storage.get('cryotech_company_id'));
  if (companyId) {
    config.headers['X-Company-Id'] = companyId;
  }
  return config;
});

const CREDENTIAL_ENDPOINTS = ['/auth/login', '/auth/register', '/auth/refresh'];

function isCredentialCheck(url: string | undefined): boolean {
  return CREDENTIAL_ENDPOINTS.some((endpoint) => (url ?? '').includes(endpoint));
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (isCredentialCheck(originalRequest?.url)) {
      return Promise.reject(error);
    }
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = await storage.get('cryotech_refresh_token');
        if (!refreshToken) throw new Error('No refresh token');

        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
        await storage.set('cryotech_access_token', data.accessToken);
        await storage.set('cryotech_refresh_token', data.refreshToken);
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalRequest);
      } catch {
        await storage.remove('cryotech_access_token');
        await storage.remove('cryotech_refresh_token');
        await storage.remove('cryotech_company_id');
        window.location.hash = '#/login';
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  },
);

export default api;

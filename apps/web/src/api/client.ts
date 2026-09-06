import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('cryotech_access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const companyId = localStorage.getItem('cryotech_company_id');
  if (companyId) {
    config.headers['X-Company-Id'] = companyId;
  }
  return config;
});

/**
 * Endpoints where a 401 means "esas credenciales no sirven", not "tu sesión
 * venció".
 *
 * Without this, signing in with a wrong password went down the refresh path,
 * failed for lack of a refresh token, and reloaded the page — wiping the React
 * state that held "Credenciales inválidas". The user typed a wrong password
 * and the screen just blinked, with nothing to read.
 */
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
        const refreshToken = localStorage.getItem('cryotech_refresh_token');
        if (!refreshToken) throw new Error('No refresh token');
        // The API reads the refresh token from the body (`@Body('refreshToken')`),
        // same as logout. Sending it as a bearer header left the parameter
        // undefined, so every refresh failed and the catch below logged the
        // user out — every 15 minutes, once the access token expired.
        const { data } = await axios.post('/api/auth/refresh', { refreshToken });
        localStorage.setItem('cryotech_access_token', data.accessToken);
        localStorage.setItem('cryotech_refresh_token', data.refreshToken);
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalRequest);
      } catch {
        localStorage.removeItem('cryotech_access_token');
        localStorage.removeItem('cryotech_refresh_token');
        localStorage.removeItem('cryotech_company_id');
        window.location.href = '/login';
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  },
);

export default api;

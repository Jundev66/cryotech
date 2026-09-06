import type { CurrentExchangeRate, ExchangeRate, ExchangeRateConfig, ExchangeRateConfigInput } from '@cryotech/shared-types';
import api from './client';

export const exchangeRatesApi = {
  getCurrent: () => api.get<CurrentExchangeRate>('/exchange-rates/current').then(r => r.data),
  getConfig: () => api.get<ExchangeRateConfig>('/exchange-rates/config').then(r => r.data),
  updateConfig: (data: ExchangeRateConfigInput) => api.put<ExchangeRateConfig>('/exchange-rates/config', data).then(r => r.data),
  getHistory: () => api.get<ExchangeRate[]>('/exchange-rates/history').then(r => r.data),
};

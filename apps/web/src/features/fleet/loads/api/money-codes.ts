import { apiClient } from '@/shared/lib/api';
import type { MoneyCode } from '@sally/shared-types';

const BASE = '/loads';

export const moneyCodesApi = {
  list: (loadId: string) => apiClient<MoneyCode[]>(`${BASE}/${loadId}/money-codes`),

  create: (loadId: string, data: { requestedCents: number; method: string; stopId?: number; driverNote?: string }) =>
    apiClient<MoneyCode>(`${BASE}/${loadId}/money-codes`, { method: 'POST', body: JSON.stringify(data) }),

  approve: (
    loadId: string,
    moneyCodeId: string,
    data: { code: string; amountCents: number; dispatcherNote?: string; expiresInHours?: number },
  ) =>
    apiClient<MoneyCode>(`${BASE}/${loadId}/money-codes/${moneyCodeId}/approve`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deny: (loadId: string, moneyCodeId: string, data: { dispatcherNote?: string }) =>
    apiClient<MoneyCode>(`${BASE}/${loadId}/money-codes/${moneyCodeId}/deny`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  markUsed: (loadId: string, moneyCodeId: string, data: { actualAmountCents: number; receiptDocumentId?: number }) =>
    apiClient<MoneyCode>(`${BASE}/${loadId}/money-codes/${moneyCodeId}/use`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  cancel: (loadId: string, moneyCodeId: string) =>
    apiClient<MoneyCode>(`${BASE}/${loadId}/money-codes/${moneyCodeId}/cancel`, { method: 'PATCH' }),

  insights: (loadId: string) =>
    apiClient<{
      facilityAvg: { avg: number; count: number } | null;
      driverHistory: { count: number; allMatched: boolean } | null;
      facilityName: string | null;
    }>(`${BASE}/${loadId}/money-codes/insights`),
};

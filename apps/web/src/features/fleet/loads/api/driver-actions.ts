import { apiClient } from '@/shared/lib/api';
import type { DriverActionRequest } from '@sally/shared-types';

const BASE = '/loads';

export const driverActionsApi = {
  list: (loadId: string) => apiClient<DriverActionRequest[]>(`${BASE}/${loadId}/driver-actions`),

  create: (
    loadId: string,
    data: { actionType: string; stopId?: number; note?: string; metadata?: Record<string, unknown> },
  ) =>
    apiClient<DriverActionRequest>(`${BASE}/${loadId}/driver-actions`, { method: 'POST', body: JSON.stringify(data) }),

  acknowledge: (loadId: string, actionRequestId: string) =>
    apiClient<DriverActionRequest>(`${BASE}/${loadId}/driver-actions/${actionRequestId}/acknowledge`, {
      method: 'PATCH',
    }),

  resolve: (loadId: string, actionRequestId: string, data: { documentId?: number; loadChargeId?: number }) =>
    apiClient<DriverActionRequest>(`${BASE}/${loadId}/driver-actions/${actionRequestId}/resolve`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
};

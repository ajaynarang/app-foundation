import { apiClient } from '@/shared/lib/api';

// Re-export domain types from @sally/shared-types
export type { VolumeData, ResponseTimeEntry, ResolutionData, TopAlertType, HistoryResult } from '@sally/shared-types';

import type { VolumeData, ResponseTimeEntry, ResolutionData, TopAlertType, HistoryResult } from '@sally/shared-types';

export const alertAnalyticsApi = {
  getVolume: async (days = 7) => apiClient<VolumeData>(`/alerts/analytics/volume?days=${days}`),

  getResponseTime: async (days = 7) => apiClient<ResponseTimeEntry[]>(`/alerts/analytics/response-time?days=${days}`),

  getResolution: async (days = 7) => apiClient<ResolutionData>(`/alerts/analytics/resolution?days=${days}`),

  getTopTypes: async (days = 7) => apiClient<TopAlertType[]>(`/alerts/analytics/top-types?days=${days}`),

  getHistory: async (params: Record<string, string>) => {
    const query = new URLSearchParams(params).toString();
    return apiClient<HistoryResult>(`/alerts/history?${query}`);
  },
};

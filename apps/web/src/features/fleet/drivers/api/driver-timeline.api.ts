import { apiClient } from '@/shared/lib/api';
import type { TimelineResponse } from '@sally/shared-types';

export const driverTimelineApi = {
  getTimeline: async (loadId?: string, cursor?: string, limit?: number): Promise<TimelineResponse> => {
    const params = new URLSearchParams();
    if (loadId) params.set('load_id', loadId);
    if (cursor) params.set('cursor', cursor);
    if (limit) params.set('limit', String(limit));
    const qs = params.toString();
    return apiClient<TimelineResponse>(`/driver/sally/timeline${qs ? `?${qs}` : ''}`);
  },

  markDelivered: async (loadId: string, messageId: string): Promise<void> => {
    await apiClient(`/loads/${loadId}/messages/${messageId}/delivered`, {
      method: 'POST',
    });
  },
};

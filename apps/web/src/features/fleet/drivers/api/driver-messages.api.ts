import { apiClient } from '@/shared/lib/api';

// Re-export domain types from @sally/shared-types
export type { LoadMessage, UnreadCountResponse } from '@sally/shared-types';

import type { LoadMessage, UnreadCountResponse } from '@sally/shared-types';

export const driverMessagesApi = {
  getLoadMessages: async (loadId: string): Promise<LoadMessage[]> => {
    return apiClient<LoadMessage[]>(`/loads/${loadId}/messages`);
  },

  sendLoadMessage: async (loadId: string, content: string): Promise<LoadMessage> => {
    return apiClient<LoadMessage>(`/loads/${loadId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  },

  getUnreadCount: async (loadId: string): Promise<UnreadCountResponse> => {
    return apiClient<UnreadCountResponse>(`/loads/${loadId}/messages/unread-count`);
  },

  markAsRead: async (loadId: string): Promise<void> => {
    await apiClient(`/loads/${loadId}/messages/read`, { method: 'PATCH' });
  },
};

import { apiClient } from '@/shared/lib/api';
import type { Notification, NotificationCount, ListNotificationsParams } from './types';

export const notificationsApi = {
  list(params?: ListNotificationsParams) {
    const searchParams = new URLSearchParams();
    const status = params?.status ?? 'unread';
    const category = params?.category;
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 20;

    searchParams.set('status', status);
    if (category) searchParams.set('category', category);
    searchParams.set('page', String(page));
    searchParams.set('limit', String(limit));

    return apiClient<{ data: Notification[]; total: number }>(`/notifications?${searchParams.toString()}`);
  },

  getUnreadCount() {
    return apiClient<NotificationCount>('/notifications/count');
  },

  markAsRead(notificationId: string) {
    return apiClient(`/notifications/${notificationId}/read`, { method: 'POST' });
  },

  markAsUnread(notificationId: string) {
    return apiClient(`/notifications/${notificationId}/unread`, { method: 'POST' });
  },

  dismiss(notificationId: string) {
    return apiClient(`/notifications/${notificationId}/dismiss`, { method: 'POST' });
  },

  markAllRead(category?: string) {
    return apiClient('/notifications/mark-all-read', {
      method: 'POST',
      body: JSON.stringify({ category }),
    });
  },

  dismissAllRead() {
    return apiClient('/notifications/dismiss-all-read', { method: 'POST' });
  },
};

'use client';

/**
 * Self-contained notifications hooks for the header bell + sheet.
 *
 * The original trucking app had a full `features/operations/notifications`
 * slice; in the generic starter the in-app notification inbox is part of the
 * shared platform shell, so the minimal hooks needed by the header live here
 * against the generic `/notifications` API and `queryKeys.notifications`.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@appshore/web-core/shared/lib/api';
import { queryKeys } from '@appshore/web-core/shared/constants/query-keys';

export interface Notification {
  notificationId: string;
  type: string;
  category: string | null;
  title: string;
  message: string;
  actionUrl?: string | null;
  actionLabel?: string | null;
  readAt?: string | null;
  createdAt: string;
  groupCount?: number;
  metadata?: Record<string, unknown> | null;
}

export interface NotificationListResponse {
  data: Notification[];
  total: number;
}

export interface NotificationCount {
  total: number;
  system: number;
  team: number;
  billing: number;
}

interface UseNotificationsParams {
  category?: string;
  limit?: number;
}

export function useNotifications(params: UseNotificationsParams = {}) {
  const { category, limit = 20 } = params;
  return useQuery<NotificationListResponse>({
    queryKey: [...queryKeys.notifications.root, 'list', category ?? 'ALL', limit],
    queryFn: () => {
      const search = new URLSearchParams();
      if (category) search.set('category', category);
      search.set('limit', String(limit));
      return api.get<NotificationListResponse>(`/notifications?${search.toString()}`);
    },
  });
}

export function useNotificationCount() {
  return useQuery<NotificationCount>({
    queryKey: [...queryKeys.notifications.root, 'count'],
    queryFn: () => api.get<NotificationCount>('/notifications/count'),
  });
}

export function useMarkAsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) => api.post(`/notifications/${notificationId}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.root }),
  });
}

export function useMarkAsUnread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) => api.post(`/notifications/${notificationId}/unread`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.root }),
  });
}

export function useDismissNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) => api.delete(`/notifications/${notificationId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.root }),
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (category?: string) => api.post('/notifications/read-all', category ? { category } : undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.root }),
  });
}

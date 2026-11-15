'use client';

/**
 * Self-contained notifications hooks for the header bell + sheet.
 *
 * The in-app notification inbox is part of the shared platform shell, so the
 * minimal hooks needed by the header live here against the `/notifications`
 * API and `queryKeys.notifications`.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@appshore/web-core/shared/lib/api';
import { queryKeys } from '@appshore/web-core/shared/constants/query-keys';
import { useCursorList } from '@appshore/web-core/shared/list';
import type { CursorList } from '@app/shared-types';

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

/** `GET /notifications`: a cursor list, newest first. */
export type NotificationListResponse = CursorList<Notification>;

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

/** The inbox, newest first: a cursor list ("Load more" appends). A changed category is a new list. */
export function useNotifications(params: UseNotificationsParams = {}) {
  const { category, limit = 20 } = params;
  return useCursorList<Notification>({
    queryKey: [...queryKeys.notifications.root, 'list', category ?? 'ALL', limit],
    queryFn: (cursor) => {
      const search = new URLSearchParams();
      if (category) search.set('category', category);
      search.set('limit', String(limit));
      if (cursor) search.set('cursor', cursor);
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
    mutationFn: (notificationId: string) => api.post(`/notifications/${notificationId}/dismiss`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.root }),
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (category?: string) => api.post('/notifications/mark-all-read', category ? { category } : {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.root }),
  });
}

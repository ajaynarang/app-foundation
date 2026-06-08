import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '../api';
import type { ListNotificationsParams } from '../types';
import { showSuccess, showError } from '@sally/ui';
import { queryKeys } from '@/shared/constants';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useNotifications(params?: ListNotificationsParams) {
  return useQuery({
    queryKey: [...queryKeys.notifications.root, params],
    queryFn: () => notificationsApi.list(params),
    staleTime: 0,
  });
}

export function useNotificationCount() {
  return useQuery({
    queryKey: [...queryKeys.notifications.root, 'count'],
    queryFn: () => notificationsApi.getUnreadCount(),
    refetchInterval: 30_000,
  });
}

export function useMarkAsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) => notificationsApi.markAsRead(notificationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.root }),
    onError: (error: Error) => {
      showError('Failed to mark as read', extractErrorMessage(error));
    },
  });
}

export function useDismissNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) => notificationsApi.dismiss(notificationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.root }),
    onError: (error: Error) => {
      showError('Failed to dismiss notification', extractErrorMessage(error));
    },
  });
}

export function useMarkAsUnread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) => notificationsApi.markAsUnread(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.root });
    },
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (category?: string) => notificationsApi.markAllRead(category),
    onSuccess: () => {
      showSuccess('All notifications marked as read');
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.root });
    },
    onError: (error: Error) => {
      showError('Failed to mark all as read', extractErrorMessage(error));
    },
  });
}

'use client';

import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { driverMessagesApi } from '../api/driver-messages.api';
import { queryKeys } from '@/shared/constants';

export function useUnreadMessageCount(loadId: string | undefined) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: [...queryKeys.loadMessages.unreadCount, loadId],
    queryFn: () => driverMessagesApi.getUnreadCount(loadId!),
    enabled: !!loadId,
  });

  const markReadMutation = useMutation({
    mutationFn: () => driverMessagesApi.markAsRead(loadId!),
    onSuccess: () => {
      // Set unread to 0 immediately
      queryClient.setQueryData([...queryKeys.loadMessages.unreadCount, loadId], { count: 0 });
      // Also invalidate message-summary so command center updates
      queryClient.invalidateQueries({ queryKey: queryKeys.commandCenter.messageSummary });
    },
  });

  const markAsRead = useCallback(() => {
    if (!loadId) return;
    if ((data?.count ?? 0) === 0) return; // No-op if already read
    markReadMutation.mutate();
  }, [loadId, data?.count, markReadMutation]);

  return {
    unreadCount: data?.count ?? 0,
    isLoading,
    markAsRead,
  };
}

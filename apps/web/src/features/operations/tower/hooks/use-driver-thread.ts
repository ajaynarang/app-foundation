import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { showError } from '@sally/ui';
import { driverMessagesApi } from '../api';
import { queryKeys } from '@/shared/constants';
import { extractErrorMessage } from '@/shared/lib/error-utils';

/** The message thread for one driver. */
export function useDriverThread(driverId: string | null) {
  return useQuery({
    queryKey: queryKeys.tower.driverThread(driverId ?? ''),
    queryFn: () => driverMessagesApi.getThread(driverId as string),
    enabled: !!driverId,
  });
}

/**
 * Send a message into a driver thread. `loadNumber` is the per-message load
 * tag: omit it to default to the driver's active load server-side, or pass
 * `null` for a general (no-load) message.
 */
export function useSendDriverMessage(driverId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ content, loadNumber }: { content: string; loadNumber?: string | null }) =>
      driverMessagesApi.send(driverId, content, loadNumber),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tower.driverThread(driverId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tower.driverConversations });
    },
    onError: (error: Error) => {
      showError('Failed to send message', extractErrorMessage(error));
    },
  });
}

/** Mark a driver thread read by the dispatcher. */
export function useMarkDriverThreadRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (driverId: string) => driverMessagesApi.markRead(driverId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tower.driverConversations });
    },
  });
}

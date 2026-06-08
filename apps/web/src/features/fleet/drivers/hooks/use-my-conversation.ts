import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { showError } from '@sally/ui';
import { driverMessagesApi } from '@/features/operations/tower/api';
import { useAuthStore } from '@/features/auth';
import { queryKeys } from '@/shared/constants';
import { extractErrorMessage } from '@/shared/lib/error-utils';

/**
 * The signed-in driver's own conversation thread — the full driver↔dispatcher
 * thread, every message regardless of which load it's tagged with. Backs the
 * driver app's Dispatch tab.
 *
 * Driver-keyed: reads `/messages/conversations/{ownDriverId}`, the same
 * endpoint the Tower Messages tab uses, scoped to the driver's own id.
 */
export function useMyConversation() {
  const driverId = useAuthStore((s) => s.user?.driverId) ?? '';

  return useQuery({
    queryKey: queryKeys.tower.driverThread(driverId),
    queryFn: () => driverMessagesApi.getThread(driverId),
    enabled: !!driverId,
  });
}

/** Send a message into the driver's own thread, optionally tagged to a load. */
export function useSendMyMessage() {
  const queryClient = useQueryClient();
  const driverId = useAuthStore((s) => s.user?.driverId) ?? '';

  return useMutation({
    mutationFn: ({ content, loadNumber }: { content: string; loadNumber: string | null }) =>
      driverMessagesApi.send(driverId, content, loadNumber),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tower.driverThread(driverId) });
    },
    onError: (error: Error) => {
      showError('Failed to send message', extractErrorMessage(error));
    },
  });
}

/** Mark the driver's own thread read (stamps `driverReadAt`). */
export function useMarkMyConversationRead() {
  const driverId = useAuthStore((s) => s.user?.driverId) ?? '';
  return useMutation({
    mutationFn: () => driverMessagesApi.markRead(driverId),
  });
}

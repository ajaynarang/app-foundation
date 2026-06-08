import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { driverMessagesApi, type LoadMessage } from '../api/driver-messages.api';
import { showSuccess, showError } from '@sally/ui';
import { queryKeys } from '@/shared/constants';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useLoadMessages(loadId: string) {
  return useQuery({
    queryKey: [...queryKeys.loadMessages.root, loadId],
    queryFn: () => driverMessagesApi.getLoadMessages(loadId),
    enabled: !!loadId,
  });
}

/**
 * Send a load message. `senderRole` is who is composing — it stamps the
 * optimistic bubble so it renders on the correct side (a dispatcher sending
 * from Tower must not see their own message as an incoming driver message).
 * Defaults to `'driver'` for the driver app.
 */
export function useSendMessage(senderRole: 'driver' | 'dispatcher' = 'driver') {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ loadId, content }: { loadId: string; content: string }) =>
      driverMessagesApi.sendLoadMessage(loadId, content),
    onMutate: async ({ loadId, content }) => {
      await queryClient.cancelQueries({ queryKey: [...queryKeys.loadMessages.root, loadId] });

      const previous = queryClient.getQueryData<LoadMessage[]>([...queryKeys.loadMessages.root, loadId]);

      // Optimistic append — stamped with the real sender so the bubble lands
      // on the correct side until the server echo replaces it.
      const optimistic: LoadMessage = {
        id: `temp-${Date.now()}`,
        role: senderRole,
        content,
        createdAt: new Date().toISOString(),
      };

      queryClient.setQueryData<LoadMessage[]>([...queryKeys.loadMessages.root, loadId], (old) => [
        ...(old ?? []),
        optimistic,
      ]);

      return { previous };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.loadMessages.root, variables.loadId] });
      showSuccess('Message sent');
    },
    onError: (error: Error, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData([...queryKeys.loadMessages.root, variables.loadId], context.previous);
      }
      showError('Failed to send message', extractErrorMessage(error));
    },
  });
}

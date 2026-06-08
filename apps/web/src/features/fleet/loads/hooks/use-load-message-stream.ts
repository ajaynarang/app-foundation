'use client';

import { useQueryClient } from '@tanstack/react-query';
import { SSE_EVENTS } from '@sally/shared-types';
import { useSseEvent } from '@/shared/realtime';
import { queryKeys } from '@/shared/constants/query-keys';

/**
 * Side effects for message:new — invalidate the per-load message list,
 * unread-count for that load, and the command center summary.
 *
 * Note: ['load-messages', loadId] is parameterized per-load and not in
 * `queryKeys` today. Adding a factory for one consumer would be premature.
 */
export function useLoadMessageStream(): void {
  const queryClient = useQueryClient();

  useSseEvent(SSE_EVENTS.MESSAGE_NEW, (m) => {
    queryClient.invalidateQueries({ queryKey: ['load-messages', m.loadId] });
    queryClient.invalidateQueries({ queryKey: ['load-messages', 'unread-count', m.loadId] });
    queryClient.invalidateQueries({ queryKey: queryKeys.commandCenter.root });
  });
}

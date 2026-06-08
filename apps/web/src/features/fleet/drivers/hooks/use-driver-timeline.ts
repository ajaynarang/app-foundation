import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { driverTimelineApi } from '../api/driver-timeline.api';
import { QUERY_TIERS } from '@/shared/config/query-tiers';
import { queryKeys } from '@/shared/constants';

export function useDriverTimeline(loadId?: string) {
  const queryClient = useQueryClient();
  const deliveredRef = useRef<Set<string>>(new Set());

  const query = useQuery({
    queryKey: [...queryKeys.driverTimeline.root, loadId],
    queryFn: () => driverTimelineApi.getTimeline(loadId),
    ...QUERY_TIERS.ACTIVE_POLL,
  });

  // Mark operations messages as delivered when they appear
  useEffect(() => {
    if (!query.data?.entries || !query.data.loadContext) return;
    const lId = query.data.loadContext.loadId;

    for (const entry of query.data.entries) {
      if (
        entry.type === 'operations' &&
        entry.metadata?.messageId &&
        !entry.metadata.deliveredAt &&
        !deliveredRef.current.has(entry.metadata.messageId)
      ) {
        deliveredRef.current.add(entry.metadata.messageId);
        driverTimelineApi.markDelivered(lId, entry.metadata.messageId).catch(() => {
          deliveredRef.current.delete(entry.metadata!.messageId!);
        });
      }
    }
  }, [query.data]);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.driverTimeline.root });
  }, [queryClient]);

  return {
    ...query,
    entries: query.data?.entries ?? [],
    loadContext: query.data?.loadContext ?? null,
    invalidate,
  };
}

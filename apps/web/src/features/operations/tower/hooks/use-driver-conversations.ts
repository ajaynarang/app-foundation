import { useQuery } from '@tanstack/react-query';
import { driverMessagesApi } from '../api';
import { queryKeys } from '@/shared/constants';
import { QUERY_TIERS } from '@/shared/config/query-tiers';

/**
 * Driver conversation triage list for the Tower Messages tab. The list is
 * refreshed by TOWER_MESSAGES_CHANGED SSE invalidation; the ACTIVE_POLL tier
 * is the fallback cadence while the stream is reconnecting.
 */
export function useDriverConversations() {
  return useQuery({
    queryKey: queryKeys.tower.driverConversations,
    queryFn: () => driverMessagesApi.listConversations(),
    ...QUERY_TIERS.ACTIVE_POLL,
  });
}

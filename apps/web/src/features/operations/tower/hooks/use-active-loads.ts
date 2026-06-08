import { useQuery } from '@tanstack/react-query';
import type { LookaheadHours } from '@sally/shared-types';
import { towerApi } from '../api';
import { QUERY_TIERS } from '@/shared/config/query-tiers';
import { queryKeys } from '@/shared/constants';
import { useSseConnection } from '@/shared/realtime';

/**
 * Tower v3 driver-centric active-loads feed.
 *
 * SSE-driven when connected — TOWER_LOAD_CHANGED (handled by useTowerEvents)
 * invalidates this query, so polling is switched off. While SSE is connecting
 * or reconnecting it falls back to the 30s ACTIVE_POLL cadence.
 */
export function useActiveLoads(lookahead: LookaheadHours) {
  const { status } = useSseConnection();
  return useQuery({
    queryKey: queryKeys.tower.activeLoads(lookahead),
    queryFn: () => towerApi.getActiveLoads(lookahead),
    staleTime: 15_000,
    refetchInterval: status === 'open' ? false : QUERY_TIERS.ACTIVE_POLL.refetchInterval,
  });
}

import { useQuery } from '@tanstack/react-query';
import type { LookaheadHours } from '@sally/shared-types';
import { towerApi } from '../api';
import { QUERY_TIERS } from '@/shared/config/query-tiers';
import { queryKeys } from '@/shared/constants';
import { useSseConnection } from '@/shared/realtime';

/**
 * Tower v3 per-load risk scores. Keyed by lookahead so each window has its
 * own cache.
 *
 * SSE-driven when connected — TOWER_RISK_TRANSITION (handled by useTowerEvents)
 * patches the changed load in place, so polling is switched off. While SSE is
 * connecting or reconnecting it falls back to the 30s ACTIVE_POLL cadence.
 */
export function useRiskScores(lookahead: LookaheadHours) {
  const { status } = useSseConnection();
  return useQuery({
    queryKey: [...queryKeys.tower.riskScores, lookahead],
    queryFn: () => towerApi.getRiskScores(lookahead),
    staleTime: 15_000,
    refetchInterval: status === 'open' ? false : QUERY_TIERS.ACTIVE_POLL.refetchInterval,
  });
}

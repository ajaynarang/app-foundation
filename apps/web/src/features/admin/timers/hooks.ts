/**
 * Timers TanStack Query hooks (read-only, super-admin). Deadlines move as the sweeper ticks, with no
 * event behind them, so the list and the health strip read on the OPERATIONAL tier (refetch on focus).
 */
import { useQuery } from '@tanstack/react-query';
import type { DeadlineListItem, DeadlineState } from '@app/shared-types';
import { queryKeys } from '@appshore/web-core/shared/constants/query-keys';
import { QUERY_TIERS } from '@appshore/web-core/shared/config/query-tiers';
import { useCursorList } from '@appshore/web-core/shared/list';
import { timersApi, type DeadlineListParams } from './api';

/** Deadlines across tenants — cursor-paged, with per-state counts for the pivot. */
export function useDeadlineList(params: Omit<DeadlineListParams, 'cursor'>, { enabled = true } = {}) {
  return useCursorList<DeadlineListItem, DeadlineState>({
    queryKey: queryKeys.deadlines.list(params as Record<string, unknown>),
    queryFn: (cursor) => timersApi.list({ ...params, cursor }),
    enabled,
    tier: QUERY_TIERS.OPERATIONAL,
  });
}

export function useDeadlineKinds() {
  return useQuery({ queryKey: queryKeys.deadlines.kinds, queryFn: () => timersApi.kinds(), ...QUERY_TIERS.STATIC });
}

export function useDurabilityHealth() {
  return useQuery({
    queryKey: queryKeys.deadlines.health,
    queryFn: () => timersApi.health(),
    ...QUERY_TIERS.OPERATIONAL,
  });
}

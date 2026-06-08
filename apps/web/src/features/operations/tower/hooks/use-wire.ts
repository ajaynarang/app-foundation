import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { WireKind } from '@sally/shared-types';
import { towerApi } from '../api';
import { QUERY_TIERS } from '@/shared/config/query-tiers';
import { queryKeys } from '@/shared/constants';
import { useSseConnection } from '@/shared/realtime';

export type WireTab = 'all' | 'alert' | 'message' | 'desk' | 'ops';

const BACKFILL_WINDOW_MS = 30 * 60_000; // 30 minutes
const BUCKET_MS = 30_000; // 30s — stable cache key window

const TAB_KIND_MAP: Record<Exclude<WireTab, 'all'>, WireKind[]> = {
  alert: ['alert'],
  message: ['message'],
  desk: ['desk'],
  ops: ['ops'],
};

/**
 * Tower v3 unified wire feed. Backfills the last 30 minutes; tab filters
 * narrow the `kinds` query param. The `since` window is truncated to 30s
 * buckets so identical-tab fetches share a cache entry.
 *
 * SSE-driven when connected — TOWER_WIRE_ITEM_ADDED (handled by useTowerEvents)
 * prepends new items, so polling is switched off. While SSE is connecting or
 * reconnecting it falls back to the 30s ACTIVE_POLL cadence.
 */
export function useWire(tab: WireTab) {
  const { status } = useSseConnection();
  const { since, sinceBucket } = useMemo(() => {
    const now = Date.now();
    const bucket = Math.floor(now / BUCKET_MS) * BUCKET_MS;
    return {
      since: new Date(bucket - BACKFILL_WINDOW_MS).toISOString(),
      sinceBucket: String(bucket),
    };
  }, []);

  const kinds = tab === 'all' ? undefined : TAB_KIND_MAP[tab];

  return useQuery({
    queryKey: queryKeys.tower.wire(tab, sinceBucket),
    queryFn: () => towerApi.getWire({ since, kinds }),
    staleTime: 15_000,
    refetchInterval: status === 'open' ? false : QUERY_TIERS.ACTIVE_POLL.refetchInterval,
  });
}

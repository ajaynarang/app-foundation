import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  SSE_EVENTS,
  type RiskScore,
  type TowerRiskTransitionPayload,
  type TowerWireItemAddedPayload,
  type WireItem,
} from '@sally/shared-types';
import { useSseEvent } from '@/shared/realtime';
import { queryKeys } from '@/shared/constants';

/**
 * Tower v3 — wires the three patch-style TOWER_* SSE events into the
 * TanStack cache. Mounted once at the page level.
 *
 *  - TOWER_LOAD_CHANGED   → invalidate the active-loads window (refetch).
 *  - TOWER_RISK_TRANSITION → patch the one changed load's score in place.
 *  - TOWER_WIRE_ITEM_ADDED → prepend the item to every live wire cache.
 *
 * TOWER_ALERTS_CHANGED / TOWER_MESSAGES_CHANGED are already handled by
 * SSE_INVALIDATION_MAP — deliberately not re-handled here.
 *
 * No-op-safe outside <SseProvider>: useSseEvent never fires there.
 *
 * The active-loads invalidation targets the whole `['tower','active-loads']`
 * prefix, so every cached window refreshes regardless of which is mounted —
 * the hook needs no lookahead argument.
 */
export function useTowerEvents(): void {
  const queryClient = useQueryClient();

  const onLoadChanged = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.tower.activeLoadsRoot });
  }, [queryClient]);

  const onRiskTransition = useCallback(
    (payload: TowerRiskTransitionPayload) => {
      // Risk-scores caches are keyed `['tower','risk-scores', lookahead]`.
      // Patch every live window — the changed load may appear in any of them.
      queryClient.setQueriesData<RiskScore[]>({ queryKey: queryKeys.tower.riskScores }, (prev) => {
        if (!prev) return prev;
        const next: RiskScore = {
          loadId: payload.loadId,
          driverId: payload.driverId,
          score: payload.score,
          band: payload.toBand,
        };
        const idx = prev.findIndex((r) => r.loadId === payload.loadId);
        if (idx === -1) return [...prev, next];
        const copy = prev.slice();
        copy[idx] = next;
        return copy;
      });
    },
    [queryClient],
  );

  const onWireItemAdded = useCallback(
    (payload: TowerWireItemAddedPayload) => {
      const item = payload as WireItem;
      // Wire caches are keyed `['tower','wire', tab, sinceBucket]`. Patch only
      // the caches whose tab matches the item's kind (or the 'all' tab); the
      // tab segment is read off the query key via the filter predicate.
      queryClient.setQueriesData<WireItem[]>(
        {
          queryKey: queryKeys.tower.wireRoot,
          predicate: (query) => {
            const tab = query.queryKey[2];
            return tab === 'all' || tab === item.kind;
          },
        },
        (prev) => {
          if (!prev) return prev;
          if (prev.some((existing) => existing.id === item.id)) return prev;
          return [item, ...prev];
        },
      );
    },
    [queryClient],
  );

  useSseEvent(SSE_EVENTS.TOWER_LOAD_CHANGED, onLoadChanged);
  useSseEvent(SSE_EVENTS.TOWER_RISK_TRANSITION, onRiskTransition);
  useSseEvent(SSE_EVENTS.TOWER_WIRE_ITEM_ADDED, onWireItemAdded);
}

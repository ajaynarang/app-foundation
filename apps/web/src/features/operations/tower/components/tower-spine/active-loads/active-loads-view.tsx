'use client';

import { useMemo } from 'react';
import type { LookaheadHours } from '@sally/shared-types';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { useAlerts } from '@/features/operations/alerts/hooks/use-alerts';
import type { RiskFilter } from '../../../constants';
import { useActiveLoads } from '../../../hooks/use-active-loads';
import { useRiskScores } from '../../../hooks/use-risk-scores';
import { useMessageSummary } from '../../../hooks/use-message-summary';
import { ActiveLoadRow } from './active-load-row';
import { filterLoads, type ActiveLoadEntry } from './active-loads.filters';

interface ActiveLoadsViewProps {
  lookaheadHours: LookaheadHours;
  /** Canvas-wide risk filter + search — owned by the control row. */
  riskFilter: RiskFilter;
  search: string;
}

/**
 * The Active-loads body of the Tower spine. A scrollable list of every active
 * load — load #, lane, driver, ETA, slack/status, progress. The risk filter
 * and search that drive it live in the canvas control row; this view consumes
 * the chosen `riskFilter`/`search`.
 *
 * Reads `useActiveLoads` (the SAME query the Drivers tab uses, so it's a
 * cache hit, never a second fetch); risk bands, unread counts, and
 * active-alert flags are joined in client-side.
 */
export function ActiveLoadsView({ lookaheadHours, riskFilter, search }: ActiveLoadsViewProps) {
  const { data: loads, isLoading } = useActiveLoads(lookaheadHours);
  const { data: riskScores } = useRiskScores(lookaheadHours);
  const { data: messageSummary } = useMessageSummary();
  const { data: alerts } = useAlerts();

  const rows = useMemo<ActiveLoadEntry[]>(() => {
    const riskByLoad = new Map((riskScores ?? []).map((r) => [r.loadId, r.band]));
    const unreadByLoad = new Map((messageSummary?.items ?? []).map((m) => [m.loadId, m.unreadCount]));
    const alertLoadIds = new Set((alerts ?? []).map((a) => a.loadId).filter((id): id is string => !!id));
    return (loads ?? []).map((load) => ({
      load,
      riskBand: riskByLoad.get(load.loadId) ?? 'on-track',
      unreadCount: unreadByLoad.get(load.loadId) ?? 0,
      hasActiveAlert: alertLoadIds.has(load.loadId),
    }));
  }, [loads, riskScores, messageSummary, alerts]);

  const visibleRows = useMemo(() => filterLoads(rows, riskFilter, search), [rows, riskFilter, search]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 space-y-1.5 overflow-y-auto p-3">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[68px] w-full rounded-md" />)
        ) : visibleRows.length === 0 ? (
          <EmptyState hasSearch={search.trim().length > 0} />
        ) : (
          visibleRows.map((row) => (
            <ActiveLoadRow
              key={row.load.loadId}
              load={row.load}
              riskBand={row.riskBand}
              unreadCount={row.unreadCount}
              hasActiveAlert={row.hasActiveAlert}
            />
          ))
        )}
      </div>
    </div>
  );
}

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center py-12">
      <p className="text-sm font-medium text-foreground">{hasSearch ? 'No loads match' : 'No active loads'}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {hasSearch ? 'Try a different load, customer, or driver.' : 'Loads appear here once the fleet is rolling.'}
      </p>
    </div>
  );
}

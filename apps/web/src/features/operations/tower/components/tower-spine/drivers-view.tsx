'use client';

import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ActiveLoadView, LookaheadHours, RiskBand, RiskScore } from '@sally/shared-types';
import { Button } from '@sally/ui/components/ui/button';
import { cn } from '@sally/ui';
import { queryKeys } from '@/shared/constants';
import { matchesRiskFilter, type RiskFilter } from '../../constants';
import { useActiveLoads } from '../../hooks/use-active-loads';
import { useRiskScores } from '../../hooks/use-risk-scores';
import { DriverLane } from './driver-lane';
import { DriverLaneSkeleton } from './driver-lane-skeleton';
import { RiskScoreInfo } from './risk-score-info';

interface DriversViewProps {
  lookaheadHours: LookaheadHours;
  /** Canvas-wide risk filter — owned by the control row; narrows lanes by their band. */
  riskFilter: RiskFilter;
  /** Search term — owned by the canvas control row; filters by driver / truck / load #. */
  search: string;
}

/** One lane = one driver, headlined by their most urgent load. */
interface DriverLaneVM {
  headline: ActiveLoadView;
  band: RiskBand;
  score: number;
  /** The driver's remaining loads (urgency-sorted) — power the +N popover. */
  otherLoads: ActiveLoadView[];
}

const BAND_PRIORITY: Record<RiskBand, number> = {
  critical: 0,
  'at-risk': 1,
  'on-track': 2,
};

/**
 * True when a lane matches the search term — checked against the driver name
 * and, across every load the driver runs, the truck identifier, load number,
 * and reference/PO number. Plain case-insensitive substring match.
 */
function laneMatchesSearch(lane: DriverLaneVM, term: string): boolean {
  if (!term) return true;
  if (lane.headline.driver.name.toLowerCase().includes(term)) return true;
  const loads = [lane.headline, ...lane.otherLoads];
  return loads.some(
    (load) =>
      (load.vehicleIdentifier ?? '').toLowerCase().includes(term) ||
      load.loadNumber.toLowerCase().includes(term) ||
      (load.referenceNumber ?? '').toLowerCase().includes(term),
  );
}

/**
 * Drivers swimlane view of the Tower spine. Groups lanes into:
 *  - Needs you (band !== on-track, critical-first)
 *  - Rolling   (on-track, sorted by next stop appointment)
 */
export function DriversView({ lookaheadHours, riskFilter, search }: DriversViewProps) {
  const queryClient = useQueryClient();

  const activeLoadsQuery = useActiveLoads(lookaheadHours);
  const riskScoresQuery = useRiskScores(lookaheadHours);

  const bandByLoadId = useMemo(() => {
    const map = new Map<string, RiskBand>();
    for (const score of riskScoresQuery.data ?? []) {
      map.set(score.loadId, score.band);
    }
    return map;
  }, [riskScoresQuery.data]);

  const scoreByLoadId = useMemo(() => {
    const map = new Map<string, RiskScore>();
    for (const score of riskScoresQuery.data ?? []) {
      map.set(score.loadId, score);
    }
    return map;
  }, [riskScoresQuery.data]);

  // The spine is driver-centric: one lane per driver, never per load. The
  // active-loads feed returns one row per load, so a driver running several
  // loads arrives as several rows — collapse them by driverId and headline
  // each lane with the driver's most urgent load (worst band → highest score
  // → nearest appointment).
  const groups = useMemo(() => {
    const loads = activeLoadsQuery.data ?? [];

    const byDriver = new Map<string, ActiveLoadView[]>();
    for (const load of loads) {
      const list = byDriver.get(load.driver.driverId);
      if (list) list.push(load);
      else byDriver.set(load.driver.driverId, [load]);
    }

    const apptTime = (l: ActiveLoadView) =>
      l.nextStop?.appointmentAt ? new Date(l.nextStop.appointmentAt).getTime() : Number.POSITIVE_INFINITY;
    const urgency = (l: ActiveLoadView) => ({
      band: BAND_PRIORITY[bandByLoadId.get(l.loadId) ?? 'on-track'],
      score: scoreByLoadId.get(l.loadId)?.score ?? 0,
      appt: apptTime(l),
    });

    const lanes: DriverLaneVM[] = [];
    for (const driverLoads of byDriver.values()) {
      const sorted = [...driverLoads].sort((a, b) => {
        const ua = urgency(a);
        const ub = urgency(b);
        if (ua.band !== ub.band) return ua.band - ub.band;
        if (ua.score !== ub.score) return ub.score - ua.score;
        return ua.appt - ub.appt;
      });
      const headline = sorted[0];
      lanes.push({
        headline,
        band: bandByLoadId.get(headline.loadId) ?? 'on-track',
        score: scoreByLoadId.get(headline.loadId)?.score ?? 0,
        otherLoads: sorted.slice(1),
      });
    }

    const needs = lanes.filter((l) => l.band !== 'on-track');
    const rolling = lanes.filter((l) => l.band === 'on-track');
    needs.sort((a, b) => {
      if (BAND_PRIORITY[a.band] !== BAND_PRIORITY[b.band]) return BAND_PRIORITY[a.band] - BAND_PRIORITY[b.band];
      return b.score - a.score;
    });
    rolling.sort((a, b) => apptTime(a.headline) - apptTime(b.headline));
    return { needs, rolling };
  }, [activeLoadsQuery.data, bandByLoadId, scoreByLoadId]);

  // Narrow both groups by the canvas risk filter, then the free-text search.
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const passes = (lane: DriverLaneVM) =>
      matchesRiskFilter(lane.band, riskFilter) && (!term || laneMatchesSearch(lane, term));
    return {
      needs: groups.needs.filter(passes),
      rolling: groups.rolling.filter(passes),
    };
  }, [groups, riskFilter, search]);

  const hasSearch = search.trim().length > 0;
  const noMatches = visible.needs.length === 0 && visible.rolling.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {activeLoadsQuery.isLoading ? (
          <SkeletonStack />
        ) : activeLoadsQuery.isError ? (
          <ErrorState
            onRetry={() => {
              queryClient.invalidateQueries({ queryKey: queryKeys.tower.activeLoads(lookaheadHours) });
              queryClient.invalidateQueries({ queryKey: queryKeys.tower.riskScores });
            }}
          />
        ) : noMatches ? (
          hasSearch ? (
            <NoMatchesState />
          ) : (
            <EmptyState />
          )
        ) : (
          <div className="space-y-5">
            <Group title="Needs you" count={visible.needs.length} variant="needs">
              {visible.needs.map((lane) => (
                <DriverLane
                  key={lane.headline.driver.driverId}
                  load={lane.headline}
                  band={lane.band}
                  otherLoads={lane.otherLoads}
                  bandByLoadId={bandByLoadId}
                />
              ))}
            </Group>
            <Group title="Rolling" count={visible.rolling.length}>
              {visible.rolling.map((lane) => (
                <DriverLane
                  key={lane.headline.driver.driverId}
                  load={lane.headline}
                  band={lane.band}
                  otherLoads={lane.otherLoads}
                  bandByLoadId={bandByLoadId}
                />
              ))}
            </Group>
          </div>
        )}
      </div>
    </div>
  );
}

function Group({
  title,
  count,
  variant,
  children,
}: {
  title: string;
  count: number;
  variant?: 'needs' | 'default';
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h4
          className={cn(
            'text-xs font-semibold uppercase tracking-wide',
            variant === 'needs' ? 'text-yellow-600 dark:text-yellow-400' : 'text-muted-foreground',
          )}
        >
          {title}
        </h4>
        <span className="text-2xs text-muted-foreground tabular-nums">{count}</span>
        {variant === 'needs' && <RiskScoreInfo />}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function SkeletonStack() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <DriverLaneSkeleton key={i} />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center py-12">
      <p className="text-sm font-medium text-foreground">Fleet is off-shift</p>
      <p className="text-xs text-muted-foreground mt-1">Next shift starts at 06:00.</p>
    </div>
  );
}

function NoMatchesState() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center py-12">
      <p className="text-sm font-medium text-foreground">No drivers match</p>
      <p className="text-xs text-muted-foreground mt-1">Try a different name, truck, or load number.</p>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center py-12">
      <p className="text-sm font-medium text-foreground">Couldn&apos;t load drivers.</p>
      <Button size="sm" variant="outline" onClick={onRetry} className="mt-2">
        Retry
      </Button>
    </div>
  );
}

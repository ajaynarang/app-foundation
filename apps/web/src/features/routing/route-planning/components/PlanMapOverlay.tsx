'use client';

import { MapPin, ArrowRight } from 'lucide-react';
import type { RoutePlanResult } from '@/features/routing/route-planning';
import { formatHours } from './plan-utils';

interface PlanMapOverlayProps {
  plan: RoutePlanResult;
}

/**
 * Summary overlay positioned top-left of the map.
 * Shows origin → destination, miles, trip time. Costs and "X days" live on
 * the plan header (single source of truth); the map summary stays terse.
 */
export function PlanMapOverlay({ plan }: PlanMapOverlayProps) {
  // Find first and last non-drive segments for origin/destination labels
  const stops = plan.segments.filter((s) => s.segmentType !== 'drive');
  const origin = stops[0];
  const destination = stops[stops.length - 1];

  const originLabel = origin?.fromLocation?.split(',')[0] || origin?.toLocation?.split(',')[0] || 'Origin';
  const destinationLabel = destination?.toLocation?.split(',')[0] || 'Destination';

  // Show calendar-day count only when the trip exceeds ~24h.
  // Shorter trips that happen to cross midnight should read "overnight",
  // not "1 day" — which suggests a full 24-hour shift.
  const tripHours = plan.totalTripTimeHours ?? 0;
  const durationLabel =
    tripHours >= 24
      ? `${plan.totalDrivingDays} ${plan.totalDrivingDays === 1 ? 'day' : 'days'}`
      : crossesMidnight(plan)
        ? 'overnight'
        : null;

  return (
    <div className="absolute top-4 left-4 z-10 rounded-lg bg-background/80 backdrop-blur-sm border border-border p-3 max-w-[280px] shadow-lg">
      {/* Origin to Destination */}
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <span className="truncate">{originLabel}</span>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <span className="truncate">{destinationLabel}</span>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">
          {plan.totalDistanceMiles.toLocaleString(undefined, { maximumFractionDigits: 0 })} mi
        </span>
        <span className="text-border">|</span>
        <span className="font-semibold text-foreground">{formatHours(tripHours)}</span>
        {durationLabel && (
          <>
            <span className="text-border">|</span>
            <span>{durationLabel}</span>
          </>
        )}
      </div>
    </div>
  );
}

function crossesMidnight(plan: RoutePlanResult): boolean {
  const first = plan.segments[0]?.estimatedDeparture;
  const last = plan.segments[plan.segments.length - 1]?.estimatedArrival;
  if (!first || !last) return false;
  const start = new Date(first);
  const end = new Date(last);
  return start.toDateString() !== end.toDateString();
}

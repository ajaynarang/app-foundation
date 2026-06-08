'use client';

import { XCircle, UserRound, Clock, ChevronRight } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { cn } from '@sally/ui';
import type { RoutePlanResult } from '@/features/routing/route-planning/types';
import type { DriverRecommendation } from '@/features/routing/smart-assign';
import { formatHOSHours } from '@/shared/lib/format-time';

interface Props {
  plan: RoutePlanResult;
  selectedDriverName: string;
  driverHOSHours: number;
  recommendations: DriverRecommendation[];
  deliveryWindowEnd: string;
  onSwitchDriver: (driverId: string) => void;
  onAdjustDeparture: (newDeparture: string) => void;
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Compute earliest possible departure after a 10-hour rest reset.
 * Uses the current time as baseline.
 */
function computeEarliestDepartureAfterReset(): string {
  const now = new Date();
  now.setHours(now.getHours() + 10);
  return now.toISOString();
}

/**
 * Pick up to 2 alternative drivers with better HOS than selected driver.
 */
function getAlternatives(
  recommendations: DriverRecommendation[],
  selectedDriverName: string,
  hosHours: number,
): DriverRecommendation[] {
  return recommendations
    .filter((r) => r.name !== selectedDriverName && r.hos.driveHoursRemaining > hosHours)
    .slice(0, 2);
}

export function InfeasibleState({
  plan,
  selectedDriverName,
  driverHOSHours,
  recommendations,
  deliveryWindowEnd,
  onSwitchDriver,
  onAdjustDeparture,
}: Props) {
  const earliestEtaStr = formatDate(plan.estimatedArrival);
  const windowEndStr = formatDate(deliveryWindowEnd);
  const earliestDeparture = computeEarliestDepartureAfterReset();
  const earliestDepartureStr = formatDate(earliestDeparture);
  const alternatives = getAlternatives(recommendations, selectedDriverName, driverHOSHours);

  const hosDriveStr = formatHOSHours(driverHOSHours);

  return (
    <div className="space-y-3">
      {/* Red ETA verdict banner */}
      <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2.5 space-y-1">
        <div className="flex items-center gap-2">
          <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
          <p className="text-sm font-medium text-foreground">Cannot meet delivery window</p>
        </div>
        <p className="text-xs text-muted-foreground pl-6">
          Earliest possible ETA: {earliestEtaStr} · Window closes {windowEndStr}
        </p>
      </div>

      {/* Explanation */}
      <div className="rounded-md border border-border bg-card px-3 py-2.5 text-xs text-muted-foreground space-y-1">
        <p>
          <span className="font-medium text-foreground">{selectedDriverName}</span> has {hosDriveStr} of drive time
          remaining. A 10-hour rest reset is required before continuing. After reset, the earliest departure would be{' '}
          <span className="font-medium text-foreground">{earliestDepartureStr}</span> — too late to meet the delivery
          window.
        </p>
        {plan.feasibilityIssues?.length > 0 && (
          <ul className="space-y-0.5 mt-1">
            {plan.feasibilityIssues.map((issue, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-red-500 mt-0.5">·</span>
                <span>{issue}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Suggestion cards */}
      <div className="space-y-2">
        <p className="text-2xs uppercase tracking-wider font-medium text-muted-foreground">Suggested Actions</p>

        {/* Switch driver suggestions */}
        {alternatives.map((alt) => (
          <Button
            key={alt.driverId}
            variant="outline"
            onClick={() => onSwitchDriver(alt.driverId)}
            className={cn(
              'w-full h-auto justify-start rounded-lg px-3 py-2.5',
              'hover:bg-gray-100 dark:hover:bg-gray-800',
              'flex items-center gap-3',
            )}
          >
            {/* Driver avatar */}
            <div className="flex-shrink-0 h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-semibold text-foreground">
              {alt.initials}
            </div>

            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-2">
                <UserRound className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                <p className="text-sm font-medium text-foreground">Switch to {alt.name}</p>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatHOSHours(alt.hos.driveHoursRemaining)} HOS available
                {' · '}
                {alt.proximity.distanceMilesFromPickup.toLocaleString(undefined, { maximumFractionDigits: 0 })} mi away
                {alt.isBestMatch && ' · Best match'}
              </p>
            </div>

            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          </Button>
        ))}

        {/* Keep driver, push departure */}
        <Button
          variant="outline"
          onClick={() => onAdjustDeparture(earliestDeparture)}
          className={cn(
            'w-full h-auto justify-start rounded-lg px-3 py-2.5',
            'hover:bg-gray-100 dark:hover:bg-gray-800',
            'flex items-center gap-3',
          )}
        >
          <div className="flex-shrink-0 h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
            <Clock className="h-4 w-4 text-muted-foreground" />
          </div>

          <div className="flex-1 min-w-0 text-left">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">Keep {selectedDriverName}, push departure</p>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Depart {earliestDepartureStr} after rest reset</p>
          </div>

          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        </Button>
      </div>
    </div>
  );
}

'use client';

import { Loader2 } from 'lucide-react';

interface Props {
  driverHOSHours: number;
  loadMiles: number;
}

function formatHOS(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Honest "generating" state shown while the real planning engine runs.
 *
 * The previous version animated four fake pipeline steps on fixed timers and
 * showed client-side estimatedDays / restStops that could (and did) differ from
 * the plan the engine returned seconds later. We don't fake progress: a single
 * indeterminate indicator, the facts we actually know (miles, HOS remaining), and
 * the real numbers appear only when the response lands.
 */
export function ProgressiveRouteLoading({ driverHOSHours, loadMiles }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
      <Loader2 className="h-6 w-6 animate-spin text-foreground" aria-hidden="true" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">Generating route…</p>
        <p className="text-xs text-muted-foreground">
          Optimizing stops, HOS breaks, and fuel for {loadMiles.toLocaleString()} mi
          {driverHOSHours > 0 ? ` · ${formatHOS(driverHOSHours)} HOS remaining` : ''}
        </p>
      </div>
      <p className="text-2xs text-muted-foreground">This usually takes a few seconds.</p>
    </div>
  );
}

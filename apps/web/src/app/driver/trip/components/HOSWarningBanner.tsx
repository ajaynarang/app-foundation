'use client';

import { AlertTriangle } from 'lucide-react';

// Local interface matching only the fields this component reads from the HOS raw
// data (hoursDriven, onDutyTime, hoursSinceBreak, cycleHoursUsed). The caller
// (trip/page.tsx) passes the raw DriverHOS fields directly — using the full
// HOSState from route-planning would require the caller to pre-compute remainders,
// which it only does for SmartHOSStrip. Keep these as raw values here.
interface HOSWarningState {
  hoursDriven: number;
  onDutyTime: number;
  hoursSinceBreak: number;
  cycleHoursUsed: number;
}

function formatHours(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

interface Props {
  hosState: HOSWarningState;
  hasRoutePlan: boolean;
  nextRestMiles?: number;
}

export function HOSWarningBanner({ hosState, hasRoutePlan, nextRestMiles }: Props) {
  const driveRemaining = Math.max(0, 11 - hosState.hoursDriven);
  if (driveRemaining >= 1) return null;

  const restMilesText =
    hasRoutePlan && nextRestMiles != null ? ` Your planned rest is ${Math.round(nextRestMiles)} miles ahead.` : '';

  return (
    <div
      className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-critical/30 bg-critical/10 text-critical"
      role="alert"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
      <p className="text-sm font-medium flex-1">
        Drive time critical: {formatHours(driveRemaining)} remaining. Plan your next rest stop.
        {restMilesText}
      </p>
    </div>
  );
}

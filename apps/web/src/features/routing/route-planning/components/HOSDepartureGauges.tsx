'use client';

import { Card, CardContent } from '@sally/ui/components/ui/card';
import type { RoutePlanResult } from '../types';
import { getHOSColor, SEMANTIC_COLORS } from '@/shared/lib/colors';
import { useFormatters } from '@/shared/providers/PreferencesProvider';

interface HOSDepartureGaugesProps {
  plan: RoutePlanResult;
}

const DRIVE_LIMIT = 11;
const DUTY_LIMIT = 14;
const BREAK_LIMIT = 8;
const CYCLE_LIMIT = 70;

/**
 * HOS gauge bar — shows USED hours out of limit.
 * Matches the segment inline gauges: small bar = fresh, full bar = needs rest.
 * Color shifts from ok → caution → critical as usage increases.
 */
function GaugeRow({ label, used, limit }: { label: string; used: number; limit: number }) {
  const ratio = Math.min(used / limit, 1);
  const barPct = ratio * 100;
  const color = getHOSColor(ratio);
  const barColor =
    color === 'critical'
      ? 'bg-critical'
      : color === 'caution'
        ? 'bg-caution'
        : ratio >= 0.25
          ? 'bg-muted-foreground'
          : 'bg-muted-foreground/60';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-mono ${SEMANTIC_COLORS[color].text}`}>
          {used.toFixed(1)}/{limit}h
        </span>
      </div>
      <div className="w-full h-2 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${barPct > 0 ? Math.max(barPct, 2) : 0}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Fuel gauge — INVERTED from HOS: full bar = good (lots of fuel), empty = bad.
 * Color: green when >25%, caution when 15-25%, critical when <15%.
 */
function FuelGaugeRow({ fuelPercent }: { fuelPercent: number }) {
  const color = fuelPercent < 15 ? 'bg-critical' : fuelPercent < 25 ? 'bg-caution' : 'bg-muted-foreground';
  const textColor = fuelPercent < 15 ? 'text-critical' : fuelPercent < 25 ? 'text-caution' : 'text-foreground';

  return (
    <div className="space-y-1 pt-1.5 mt-1.5 border-t border-border">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Fuel</span>
        <span className={`font-mono ${textColor}`}>{fuelPercent}%</span>
      </div>
      <div className="w-full h-2 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${fuelPercent}%` }} />
      </div>
    </div>
  );
}

export function HOSDepartureGauges({ plan }: HOSDepartureGaugesProps) {
  const { formatTimestamp } = useFormatters();

  // Get initial HOS state BEFORE the first segment (departure state).
  const firstSeg = plan.segments[0];
  const hosAfterFirst = firstSeg?.hosStateAfter;

  if (!hosAfterFirst) return null;

  // If first segment is a dock (pickup), subtract its duration to get pre-departure state.
  // Note: drivingHoursSinceBreak is FMCSA §395.3's accumulator (driving only, no dock),
  // so for plans that expose it directly we do NOT subtract firstDockHours.
  // Legacy plans (no drivingHoursSinceBreak) fall back to hoursSinceBreak which DOES include
  // dock — subtract firstDockHours from the fallback only to avoid overstating Break on old plans.
  const firstDockHours = firstSeg.segmentType === 'dock' ? (firstSeg.dockDurationHours ?? 0) : 0;
  const hasDrivingField = hosAfterFirst.drivingHoursSinceBreak != null;
  const drivingSinceBreakRaw = hasDrivingField
    ? hosAfterFirst.drivingHoursSinceBreak!
    : hosAfterFirst.hoursSinceBreak - firstDockHours;
  const departureHOS = {
    hoursDriven: Math.max(0, hosAfterFirst.hoursDriven),
    onDutyTime: Math.max(0, hosAfterFirst.onDutyTime - firstDockHours),
    drivingHoursSinceBreak: Math.max(0, drivingSinceBreakRaw),
    cycleHoursUsed: Math.max(0, hosAfterFirst.cycleHoursUsed - firstDockHours),
  };

  return (
    <Card>
      <CardContent className="py-3 px-4">
        <div className="flex items-center justify-between mb-3">
          <span className="flex items-center gap-1.5">
            <span className="text-2xs uppercase tracking-wider text-muted-foreground font-medium">
              HOS at Departure
            </span>
            {/* Provenance: was this built on live ELD clocks or the driver's last-known DB values? */}
            {plan.hosSource === 'LIVE' ? (
              <span className="text-[9px] uppercase tracking-wide text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1 py-0.5 rounded">
                Live ELD
              </span>
            ) : plan.hosSource === 'ESTIMATED' ? (
              <span className="text-[9px] uppercase tracking-wide text-muted-foreground bg-muted px-1 py-0.5 rounded">
                Estimated
              </span>
            ) : null}
          </span>
          <span className="text-[11px] text-muted-foreground font-mono">
            {formatTimestamp(plan.departureTime, 'h:mm a')}
          </span>
        </div>
        <div className="space-y-2.5">
          <GaugeRow label="Drive" used={departureHOS.hoursDriven} limit={DRIVE_LIMIT} />
          <GaugeRow label="Duty" used={departureHOS.onDutyTime} limit={DUTY_LIMIT} />
          <GaugeRow label="Break" used={departureHOS.drivingHoursSinceBreak} limit={BREAK_LIMIT} />
          <GaugeRow label="Cycle" used={departureHOS.cycleHoursUsed} limit={CYCLE_LIMIT} />
          {plan.initialFuelPercent != null && <FuelGaugeRow fuelPercent={plan.initialFuelPercent} />}
        </div>
      </CardContent>
    </Card>
  );
}

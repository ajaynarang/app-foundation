'use client';

import type { HOSState } from '@/features/routing/route-planning';
import { getHOSColor } from '@/shared/lib/colors';
import { formatHours } from './plan-utils';

interface HOSProgressBarsProps {
  hosState: HOSState;
  segmentType: string;
  isReset?: boolean;
  showCycle?: boolean;
}

/** Compact one-liner for low-usage HOS state */
interface HOSSummaryProps {
  hosState: HOSState;
}

const DRIVE_LIMIT = 11;
const DUTY_LIMIT = 14;
const BREAK_LIMIT = 8;
const CYCLE_LIMIT = 70;

/** Returns true if any HOS clock is above 50% — worth showing bars */
export function isHOSMeaningful(hosState: HOSState): boolean {
  // Break gauge is the FMCSA §395.3 driving-only clock; fall back to legacy field on old plans.
  const drivingSinceBreak = hosState.drivingHoursSinceBreak ?? hosState.hoursSinceBreak;
  return (
    hosState.hoursDriven / DRIVE_LIMIT >= 0.5 ||
    hosState.onDutyTime / DUTY_LIMIT >= 0.5 ||
    drivingSinceBreak / BREAK_LIMIT >= 0.5
  );
}

function getBarColor(ratio: number): string {
  const color = getHOSColor(ratio);
  if (color === 'critical') return 'bg-critical';
  if (color === 'caution') return 'bg-caution';
  return 'bg-muted-foreground';
}

function getTextColor(ratio: number, isReset: boolean): string {
  if (isReset) return 'text-emerald-500 dark:text-emerald-400';
  const color = getHOSColor(ratio);
  if (color === 'critical') return 'text-critical';
  if (color === 'caution') return 'text-caution';
  return 'text-muted-foreground';
}

/**
 * Single inline HOS metric: LABEL  [bar]  value
 * Compact — fits 3-4 metrics in one row.
 */
function InlineMetric({
  label,
  used,
  limit,
  isReset,
}: {
  label: string;
  used: number;
  limit: number;
  isReset: boolean;
}) {
  const ratio = Math.min(used / limit, 1);
  const percentage = ratio * 100;
  // HOS values are compliance evidence \u2014 never round to a higher hour.
  // 8.58h must display as "8.6/8H", never "9/8H".
  const valueText = isReset ? `0/${limit}H \u2713` : `${used.toFixed(1)}/${limit}H`;

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</span>
        <span className={`text-[9px] font-medium font-mono tabular-nums ${getTextColor(ratio, isReset)}`}>
          {valueText}
        </span>
      </div>
      <div className="h-1 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isReset ? 'bg-muted-foreground' : getBarColor(ratio)
          }`}
          style={{ width: `${isReset ? 0 : percentage}%` }}
        />
      </div>
    </div>
  );
}

/** Compact one-liner shown when HOS clocks are all below 50% */
export function HOSSummary({ hosState }: HOSSummaryProps) {
  const driveRemaining = DRIVE_LIMIT - hosState.hoursDriven;
  const dutyRemaining = DUTY_LIMIT - hosState.onDutyTime;
  const available = Math.min(driveRemaining, dutyRemaining);

  return <div className="mt-1.5 text-2xs text-muted-foreground">HOS: {formatHours(available)} drive available</div>;
}

/**
 * Compact inline HOS bars — all metrics in one row with mini progress bars.
 * Matches the HTML mockup: DRIVE 0/11H ✓  DUTY 0/14H ✓  BREAK 0/8H ✓  CYCLE 39/70H
 */
export function HOSProgressBars({ hosState, segmentType, isReset, showCycle }: HOSProgressBarsProps) {
  const driveReset = isReset && segmentType === 'rest';
  const dutyReset = isReset && segmentType === 'rest';
  const breakReset = isReset && (segmentType === 'rest' || segmentType === 'break');

  return (
    <div className="flex items-end gap-3 mt-2 p-2 rounded-md bg-muted/30 border border-border">
      <InlineMetric label="Drive" used={hosState.hoursDriven} limit={DRIVE_LIMIT} isReset={driveReset ?? false} />
      <InlineMetric label="Duty" used={hosState.onDutyTime} limit={DUTY_LIMIT} isReset={dutyReset ?? false} />
      <InlineMetric
        label="Break"
        used={hosState.drivingHoursSinceBreak ?? hosState.hoursSinceBreak}
        limit={BREAK_LIMIT}
        isReset={breakReset ?? false}
      />
      {showCycle && <InlineMetric label="Cycle" used={hosState.cycleHoursUsed} limit={CYCLE_LIMIT} isReset={false} />}
    </div>
  );
}

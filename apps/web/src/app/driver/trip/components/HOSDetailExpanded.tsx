'use client';

/**
 * HOSDetailExpanded — legacy inline expanded view.
 *
 * The primary HOS UI is now the HOSBottomSheet (opened by SmartHOSStrip).
 * This component is kept in case it is rendered elsewhere.
 */

import { getHOSRemainingColor, SEMANTIC_COLORS } from '@/shared/lib/colors';
import type { HOSState } from './SmartHOSStrip';

interface HOSDetailExpandedProps {
  hosState: HOSState;
}

interface ClockConfig {
  label: string;
  remaining: number;
  max: number;
}

function formatHours(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

function CircularClock({ label, remaining, max }: ClockConfig) {
  const size = 68;
  const strokeWidth = 5;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const ratio = Math.min(Math.max(remaining / max, 0), 1);
  const offset = circumference * (1 - ratio);

  const severity = getHOSRemainingColor(remaining);
  const textColor = SEMANTIC_COLORS[severity].text;

  const strokeClass =
    severity === 'critical' ? 'stroke-critical' : severity === 'caution' ? 'stroke-caution' : 'stroke-muted-foreground';

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            className="stroke-gray-200 dark:stroke-gray-800"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            className={strokeClass}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-xs font-bold tabular-nums ${textColor}`}>{formatHours(remaining)}</span>
        </div>
      </div>
      <span className="text-[11px] text-muted-foreground font-medium leading-none">{label}</span>
      <span className="text-2xs text-muted-foreground/60 leading-none">/{max}h</span>
    </div>
  );
}

export function HOSDetailExpanded({ hosState }: HOSDetailExpandedProps) {
  const clocks: ClockConfig[] = [
    { label: 'Drive', remaining: hosState.driveHoursRemaining, max: 11 },
    { label: 'Shift', remaining: hosState.shiftHoursRemaining, max: 14 },
    { label: 'Cycle', remaining: hosState.cycleHoursRemaining, max: 70 },
    { label: 'Break', remaining: hosState.breakHoursRemaining, max: 8 },
  ];

  return (
    <div
      className="grid grid-cols-4 gap-2 px-3 py-4 bg-muted/30 rounded-lg border border-border"
      role="region"
      aria-label="Hours of Service detail"
    >
      {clocks.map((clock) => (
        <CircularClock key={clock.label} {...clock} />
      ))}
    </div>
  );
}

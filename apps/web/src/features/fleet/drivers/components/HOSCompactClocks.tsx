'use client';

import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { SEMANTIC_COLORS, getHOSRemainingColor } from '@/shared/lib/colors';

interface ClockData {
  label: string;
  remaining: number; // hours
  max: number;
}

interface HOSCompactClocksProps {
  driveRemaining?: number;
  shiftRemaining?: number;
  cycleRemaining?: number;
  breakRemaining?: number;
  isLoading?: boolean;
}

function formatHours(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

function getColor(remaining: number): string {
  return SEMANTIC_COLORS[getHOSRemainingColor(remaining)].text;
}

function getStroke(remaining: number): string {
  const color = getHOSRemainingColor(remaining);
  if (color === 'critical') return 'stroke-critical';
  if (color === 'caution') return 'stroke-caution';
  return 'stroke-muted-foreground';
}

function CircularProgress({ value, max, color }: { value: number; max: number; color: string }) {
  const size = 56;
  const strokeWidth = 4;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const ratio = Math.min(value / max, 1);
  const offset = circumference * (1 - ratio);

  return (
    <svg width={size} height={size} className="-rotate-90">
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
        className={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  );
}

function ClockItem({ label, remaining, max }: ClockData) {
  const color = getColor(remaining);
  const strokeColor = getStroke(remaining);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative">
        <CircularProgress value={remaining} max={max} color={strokeColor} />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-xs font-semibold ${color}`}>{formatHours(remaining)}</span>
        </div>
      </div>
      <span className="text-2xs text-muted-foreground font-medium">{label}</span>
    </div>
  );
}

export function HOSCompactClocksSkeleton() {
  return (
    <div className="flex justify-around py-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <Skeleton className="h-14 w-14 rounded-full" />
          <Skeleton className="h-3 w-10" />
        </div>
      ))}
    </div>
  );
}

export function HOSCompactClocks({
  driveRemaining = 0,
  shiftRemaining = 0,
  cycleRemaining = 0,
  breakRemaining = 0,
  isLoading,
}: HOSCompactClocksProps) {
  if (isLoading) return <HOSCompactClocksSkeleton />;

  const clocks: ClockData[] = [
    { label: 'Drive', remaining: driveRemaining, max: 11 },
    { label: 'Shift', remaining: shiftRemaining, max: 14 },
    { label: 'Cycle', remaining: cycleRemaining, max: 70 },
    { label: 'Break', remaining: breakRemaining, max: 8 },
  ];

  return (
    <div className="flex justify-around py-3">
      {clocks.map((clock) => (
        <ClockItem key={clock.label} {...clock} />
      ))}
    </div>
  );
}

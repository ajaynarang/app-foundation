'use client';

import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@sally/ui/components/ui/sheet';
import { getHOSRemainingColor } from '@/shared/lib/colors';
import type { HOSState } from './SmartHOSStrip';

interface HOSBottomSheetProps {
  hosState: HOSState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Individual gauge ─────────────────────────────────────────────────────────

interface GaugeProps {
  label: string;
  remaining: number;
  max: number;
  /** Delay class for staggered entrance */
  delayMs: number;
  /** Whether the sheet is visible (triggers animation) */
  animate: boolean;
}

function formatGaugeTime(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h}h`;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function Gauge({ label, remaining, max, delayMs, animate }: GaugeProps) {
  const size = 88;
  const strokeWidth = 7;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;

  const ratio = Math.min(Math.max(remaining / max, 0), 1);
  const targetOffset = circumference * (1 - ratio);

  // Animate from empty (circumference) to targetOffset
  const [offset, setOffset] = useState(circumference);

  useEffect(() => {
    if (!animate) {
      setOffset(circumference);
      return;
    }
    const timeout = setTimeout(() => {
      setOffset(targetOffset);
    }, delayMs + 50); // small extra delay so sheet finishes opening first
    return () => clearTimeout(timeout);
  }, [animate, targetOffset, circumference, delayMs]);

  const severity = getHOSRemainingColor(remaining);

  // Ring color: green >60%, yellow 30-60%, red <30%
  const ringColor =
    ratio > 0.6 ? 'stroke-emerald-500 dark:stroke-emerald-400' : ratio > 0.3 ? 'stroke-caution' : 'stroke-critical';

  const valueColor =
    severity === 'critical' ? 'text-critical' : severity === 'caution' ? 'text-caution' : 'text-foreground';

  const trackColor = 'stroke-gray-200 dark:stroke-gray-800';

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden>
          {/* Background track */}
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" className={trackColor} strokeWidth={strokeWidth} />
          {/* Animated progress arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            className={ringColor}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{
              transition: `stroke-dashoffset 0.9s cubic-bezier(0.34, 1.56, 0.64, 1)`,
            }}
          />
        </svg>

        {/* Center value */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-sm font-bold tabular-nums leading-none ${valueColor}`}>
            {formatGaugeTime(remaining)}
          </span>
          <span className="text-2xs text-muted-foreground/60 leading-none mt-0.5">/{max}h</span>
        </div>
      </div>

      {/* Label */}
      <span className="text-xs font-medium text-muted-foreground leading-none">{label}</span>
    </div>
  );
}

// ─── Bottom sheet ─────────────────────────────────────────────────────────────

const CLOCKS = [
  { key: 'drive', label: 'Drive', max: 11 },
  { key: 'shift', label: 'Shift', max: 14 },
  { key: 'cycle', label: 'Cycle', max: 70 },
  { key: 'break', label: 'Break', max: 8 },
] as const;

type ClockKey = (typeof CLOCKS)[number]['key'];

function getRemainingForKey(hosState: HOSState, key: ClockKey): number {
  switch (key) {
    case 'drive':
      return hosState.driveHoursRemaining;
    case 'shift':
      return hosState.shiftHoursRemaining;
    case 'cycle':
      return hosState.cycleHoursRemaining;
    case 'break':
      return hosState.breakHoursRemaining;
  }
}

export function HOSBottomSheet({ hosState, open, onOpenChange }: HOSBottomSheetProps) {
  // Trigger gauge animations after sheet opens
  const [gaugesVisible, setGaugesVisible] = useState(false);

  useEffect(() => {
    if (open) {
      // Brief delay to let the sheet slide-in finish
      const t = setTimeout(() => setGaugesVisible(true), 120);
      return () => clearTimeout(t);
    } else {
      setGaugesVisible(false);
    }
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl border-border bg-card px-0 pb-8 pt-0">
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1" aria-hidden>
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>

        <SheetHeader className="px-6 pb-5 pt-2 text-left">
          <SheetTitle className="text-base font-semibold text-foreground">Hours of Service</SheetTitle>
          <p className="text-xs text-muted-foreground mt-0.5">Federal limits — 11h drive / 14h shift / 70h cycle</p>
        </SheetHeader>

        {/* 2×2 gauge grid */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 px-8 pb-2" role="region" aria-label="Hours of Service gauges">
          {CLOCKS.map((clock, idx) => (
            <div key={clock.key} className="flex justify-center">
              <Gauge
                label={clock.label}
                remaining={getRemainingForKey(hosState, clock.key)}
                max={clock.max}
                delayMs={idx * 80}
                animate={gaugesVisible}
              />
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-5 mt-6 px-6">
          <LegendDot color="bg-emerald-500 dark:bg-emerald-400" label=">60% OK" />
          <LegendDot color="bg-caution" label="30–60% Attention" />
          <LegendDot color="bg-critical" label="<30% Critical" />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full shrink-0 ${color}`} aria-hidden />
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}

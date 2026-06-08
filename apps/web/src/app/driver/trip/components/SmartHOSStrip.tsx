'use client';

import { useState } from 'react';
import { Skeleton } from '@sally/ui/components/ui/skeleton';

import { formatHOSHours } from '@/shared/lib/format-time';
import { HOSBottomSheet } from './HOSBottomSheet';

export interface HOSState {
  driveHoursRemaining: number;
  shiftHoursRemaining: number;
  cycleHoursRemaining: number;
  breakHoursRemaining: number;
}

interface SmartHOSStripProps {
  hosState: HOSState | null;
  /** Legacy prop — kept for backwards compat, ignored (sheet handles its own state) */
  onExpand?: () => void;
  /** Legacy prop — kept for backwards compat, ignored */
  expanded?: boolean;
}

interface CriticalClock {
  label: string;
  remaining: number;
}

function getMostCriticalClock(hosState: HOSState): CriticalClock {
  const clocks = [
    { label: 'drive', remaining: hosState.driveHoursRemaining },
    { label: 'shift', remaining: hosState.shiftHoursRemaining },
    { label: 'break', remaining: hosState.breakHoursRemaining },
    { label: 'cycle', remaining: hosState.cycleHoursRemaining },
  ];
  return [...clocks].sort((a, b) => a.remaining - b.remaining)[0];
}

type PillState = 'normal' | 'attention' | 'critical';

function getPillState(hosState: HOSState): PillState {
  const minRemaining = Math.min(
    hosState.driveHoursRemaining,
    hosState.shiftHoursRemaining,
    hosState.breakHoursRemaining,
    hosState.cycleHoursRemaining,
  );
  if (minRemaining < 2) return 'critical';
  if (minRemaining < 4) return 'attention';
  return 'normal';
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function _HOSStripSkeleton() {
  return (
    <div className="flex justify-center pb-2 pt-1">
      <Skeleton className="h-8 w-28 rounded-full" />
    </div>
  );
}

// ─── Normal pill — tiny, minimal, almost invisible ────────────────────────────

function NormalPill({ clock }: { clock: CriticalClock }) {
  return (
    <div className="flex justify-center pb-2 pt-1">
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-md bg-card/80 border border-border/50 shadow-sm">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" aria-hidden />
        <span className="text-xs font-medium text-muted-foreground whitespace-nowrap tabular-nums">
          {formatHOSHours(clock.remaining)} {clock.label}
        </span>
      </div>
    </div>
  );
}

// ─── Attention pill — larger, yellow glow, gentle pulse ───────────────────────

function AttentionPill({ clock }: { clock: CriticalClock }) {
  const formatted = formatHOSHours(clock.remaining);

  return (
    <div className="flex justify-center pb-2 pt-1">
      {/* Outer glow wrapper */}
      <div className="relative animate-hos-attention">
        {/* Shimmer border ring */}
        <div
          className="absolute -inset-[1px] rounded-full opacity-70"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, hsl(var(--caution)/0.8) 50%, transparent 100%)',
            backgroundSize: '200% 100%',
            animation: 'hos-shimmer 2.5s linear infinite',
          }}
          aria-hidden
        />
        <div className="relative flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur-md bg-card/90 border border-caution/30 shadow-[0_0_12px_hsl(var(--caution)/0.25)]">
          <span className="h-2 w-2 rounded-full bg-caution shrink-0 animate-hos-dot" aria-hidden />
          <span className="text-xs font-semibold text-caution whitespace-nowrap tabular-nums">
            Break needed in {formatted}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Critical banner — full-width, red, no animation needed ──────────────────

function CriticalBanner({ clock }: { clock: CriticalClock }) {
  const formatted = formatHOSHours(clock.remaining);

  return (
    <div className="mx-0 mb-0">
      <div className="flex items-center justify-center gap-2 px-4 py-3 bg-critical/90 border-t border-critical/50 min-h-[3.7rem]">
        <span className="h-2 w-2 rounded-full bg-white/90 shrink-0" aria-hidden />
        <span className="text-sm font-bold text-white whitespace-nowrap">
          {formatted} {clock.label} left — find rest now
        </span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SmartHOSStrip({ hosState }: SmartHOSStripProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  if (!hosState) {
    return null; // No HOS data available — don't show pill
  }

  const clock = getMostCriticalClock(hosState);
  const pillState = getPillState(hosState);

  const pillContent =
    pillState === 'critical' ? (
      <CriticalBanner clock={clock} />
    ) : pillState === 'attention' ? (
      <AttentionPill clock={clock} />
    ) : (
      <NormalPill clock={clock} />
    );

  return (
    <>
      {/* Fixed floating pill above tab bar — like Dynamic Island */}
      <div className="fixed bottom-[calc(var(--tab-bar-height,64px)+8px)] left-0 right-0 z-40 pointer-events-none">
        <div className="pointer-events-auto">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-full"
            aria-label={`HOS status: ${formatHOSHours(clock.remaining)} ${clock.label} remaining. Tap to view details.`}
          >
            {pillContent}
          </button>
        </div>
      </div>

      <HOSBottomSheet hosState={hosState} open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  );
}

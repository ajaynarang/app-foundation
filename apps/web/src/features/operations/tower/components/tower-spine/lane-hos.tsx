'use client';

import type { ActiveLoadHos } from '@sally/shared-types';
import { cn } from '@sally/ui';
import { getHOSColor, SEMANTIC_COLORS } from '@/shared/lib/colors';

interface LaneHosProps {
  hos: ActiveLoadHos | null;
}

/**
 * FMCSA limits (hours) — the denominator for each clock's "% used". This is the
 * same set the route-planning page uses (`HOSProgressBars` / `HOSDepartureGauges`),
 * so the two surfaces speak one HOS vocabulary.
 *  - drive : 11h driving limit
 *  - duty  : 14h on-duty / shift window
 *  - cycle : 70h weekly limit (8-day)
 *  - break : 8h of driving before the mandatory 30-min break is due
 */
const HOS_LIMITS = {
  drive: 11,
  duty: 14,
  cycle: 70,
  break: 8,
} as const;

type ClockKey = keyof typeof HOS_LIMITS;

const CLOCK_LABEL: Record<ClockKey, string> = {
  drive: 'Drive',
  duty: 'Duty',
  cycle: 'Cycle',
  break: 'Break',
};

interface Clock {
  key: ClockKey;
  label: string;
  /** Hours used so far (FMCSA "% used" numerator). */
  usedHours: number;
  /** FMCSA limit for this clock, in hours. */
  limit: number;
  /** 0–1 fraction used — 1 = exhausted. Drives "tightest" ranking + colour. */
  ratio: number;
}

/**
 * Lane-foot HOS block. A driver has four legal clocks (drive / duty / cycle /
 * break) and ANY of them running out strands the load — so we surface all
 * four, but headline the *tightest* one (closest to its limit) as the number
 * that actually constrains the next move. The other three read compact.
 *
 * The clock labels, hour units, used/limit value text, `getHOSColor` colour
 * semantics and bar styling all match the route-planning page. Tower keeps its
 * deliberate tightest-clock-first ordering — a dense triage view — but speaks
 * the same HOS visual language as route-planning everywhere else.
 */
export function LaneHos({ hos }: LaneHosProps) {
  if (!hos) {
    return <span className="text-xs text-muted-foreground">HOS · no ELD data</span>;
  }

  const clocks = buildClocks(hos);
  // Tightest = highest fraction used. That's the clock the dispatcher must respect.
  const tightest = clocks.reduce((a, b) => (b.ratio > a.ratio ? b : a));
  const rest = clocks.filter((c) => c.key !== tightest.key);
  const headlineColor = getHOSColor(tightest.ratio);

  return (
    <div className="flex flex-col gap-1">
      {/* Headline — the binding clock + a bar for it */}
      <div className="flex items-center gap-2 text-xs">
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">HOS</span>
        <div
          role="meter"
          aria-label={`${tightest.label} ${hosValueText(tightest)} used — tightest clock`}
          aria-valuenow={Math.round(tightest.usedHours)}
          aria-valuemin={0}
          aria-valuemax={tightest.limit}
          className="relative h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800"
        >
          <div
            className={cn(
              'absolute inset-y-0 left-0 rounded-full transition-all duration-500',
              SEMANTIC_COLORS[headlineColor].dot,
              !hos.isEldConnected &&
                'bg-[repeating-linear-gradient(45deg,currentColor,currentColor_2px,transparent_2px,transparent_4px)] opacity-60',
            )}
            style={{ width: `${barPct(tightest)}%` }}
          />
        </div>
        <span className="truncate uppercase tracking-wide">
          <span className="text-[10px] font-medium text-muted-foreground">{tightest.label}</span>{' '}
          <span className={cn('font-mono tabular-nums', SEMANTIC_COLORS[headlineColor].text)}>
            {hosValueText(tightest)}
          </span>
        </span>
      </div>

      {/* The other three clocks, compact — each carries its own HOS colour */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pl-8 text-[11px] uppercase tracking-wide text-muted-foreground">
        {rest.map((c) => {
          const color = getHOSColor(c.ratio);
          return (
            <span key={c.key} className="font-mono tabular-nums">
              <span className="text-muted-foreground">{c.label}</span>{' '}
              <span className={SEMANTIC_COLORS[color].text}>{hosValueText(c)}</span>
            </span>
          );
        })}
        {!hos.isEldConnected && eldDisconnectedNote(hos.lastSyncAt)}
      </div>
    </div>
  );
}

function buildClocks(hos: ActiveLoadHos): Clock[] {
  const make = (key: ClockKey, minutesRemaining: number): Clock => {
    const limit = HOS_LIMITS[key];
    // Backend reports minutes *remaining*; route-planning's HOS shows hours
    // *used*. Convert once here so the rest of the component is hours-used.
    const usedHours = Math.max(0, Math.min(limit, limit - minutesRemaining / 60));
    return {
      key,
      label: CLOCK_LABEL[key],
      usedHours,
      limit,
      ratio: Math.max(0, Math.min(1, usedHours / limit)),
    };
  };
  const clocks: Clock[] = [
    make('drive', hos.driveMinutesRemaining),
    make('duty', hos.dutyMinutesRemaining),
    make('cycle', hos.cycleMinutesRemaining),
  ];
  // Break is optional — only rank it when the ELD reports it.
  if (hos.breakMinutesRemaining != null) {
    clocks.push(make('break', hos.breakMinutesRemaining));
  }
  return clocks;
}

/** Bar width %, with a 2% floor so a barely-used clock still reads as a sliver. */
function barPct(c: Clock): number {
  const pct = c.ratio * 100;
  return pct > 0 ? Math.max(pct, 2) : 0;
}

/** "8/11H" — used over limit, the same value format the route-planning page uses. */
function hosValueText(c: Clock): string {
  return `${Math.round(c.usedHours)}/${c.limit}H`;
}

function eldDisconnectedNote(lastSyncAt: string | null) {
  return (
    <span className="normal-case text-red-600 dark:text-red-400">
      ELD disconnected
      {lastSyncAt &&
        ` · last sync ${new Date(lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
    </span>
  );
}

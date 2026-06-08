'use client';

import { useMemo } from 'react';
import type { ActiveLoadStop, ActiveLoadView, RiskBand } from '@sally/shared-types';
import { cn } from '@sally/ui';
import { formatTime } from '@/shared/lib/utils/formatters';
import { RISK_BAND_DOT_TOKENS } from '../../constants';

interface LaneRibbonProps {
  load: ActiveLoadView;
  band: RiskBand;
}

/** A travel segment between two stops — drive (loaded) or deadhead (empty). */
interface TravelSegment {
  kind: 'drive' | 'deadhead';
  leftPct: number;
  widthPct: number;
  tooltip: string;
}

/** A stop marker — pickup or delivery — positioned on the timeline. */
interface StopMarker {
  kind: 'pickup' | 'delivery';
  leftPct: number;
  tooltip: string;
}

const DAY_MS = 24 * 60 * 60_000;
const STOP_WIDTH_PCT = 1.5;

/**
 * Lane ribbon — a 24-hour today timeline (00→24). Encoding rule:
 *  - SHAPE conveys ACTIVITY: a solid bar is a loaded drive, a hatched bar is
 *    a deadhead, a thin marker (▲ pickup / ▼ delivery) is an at-stop event.
 *  - COLOUR conveys RISK ONLY: healthy = neutral grey, at-risk = yellow,
 *    critical = red. Colour is reserved so the dispatcher's eye jumps to red.
 * No text inside segments per UX directive — the block + marker carry it.
 */
export function LaneRibbon({ load, band }: LaneRibbonProps) {
  const { travel, stops } = useMemo(() => computeTimeline(load), [load]);
  const nowPct = nowOfDayPct();
  const riskColor = RISK_BAND_DOT_TOKENS[band];

  return (
    <div
      role="img"
      aria-label={ribbonAriaLabel(travel, stops)}
      className="relative h-3 w-full overflow-hidden rounded bg-muted/40"
    >
      {travel.map((seg, idx) => (
        <div
          key={`${seg.kind}-${idx}`}
          title={seg.tooltip}
          aria-hidden
          className={cn(
            'absolute top-0 bottom-0',
            // Risk colour tints the loaded-drive fill; deadhead stays a
            // neutral hatch so "empty miles" reads as texture, not alarm.
            seg.kind === 'drive' && riskColor,
          )}
          style={{
            left: `${seg.leftPct}%`,
            width: `${seg.widthPct}%`,
            // Deadhead hatch — built from the muted-foreground CSS var rather
            // than a Tailwind theme() arbitrary value (theme() can't resolve
            // the var-backed token, so the class silently no-ops).
            ...(seg.kind === 'deadhead'
              ? {
                  backgroundImage:
                    'repeating-linear-gradient(45deg, hsl(var(--muted-foreground) / 0.4) 0, hsl(var(--muted-foreground) / 0.4) 3px, transparent 3px, transparent 6px)',
                }
              : {}),
          }}
        />
      ))}

      {stops.map((marker, idx) => (
        <StopGlyph key={`${marker.kind}-${idx}`} marker={marker} />
      ))}

      {/* now marker — a subtle pulse draws the eye; stilled under reduced motion */}
      <div
        aria-hidden
        title="Now"
        className="absolute top-0 bottom-0 w-px bg-foreground motion-safe:animate-pulse"
        style={{ left: `${nowPct}%` }}
      />
    </div>
  );
}

/**
 * Screen-reader description of the ribbon — the visual segments are decorative,
 * so the `role="img"` label summarises them in words instead.
 */
function ribbonAriaLabel(travel: TravelSegment[], stops: StopMarker[]): string {
  const parts = ['Today timeline'];
  const pickups = stops.filter((s) => s.kind === 'pickup').length;
  const deliveries = stops.filter((s) => s.kind === 'delivery').length;
  if (pickups) parts.push(`${pickups} pickup${pickups > 1 ? 's' : ''}`);
  if (deliveries) parts.push(`${deliveries} delivery${deliveries > 1 ? 'ies' : ''}`);
  if (travel.some((t) => t.kind === 'drive')) parts.push('in transit');
  if (travel.some((t) => t.kind === 'deadhead')) parts.push('deadhead');
  return parts.join(', ');
}

/**
 * A stop marker: a thin foreground tick plus a tiny shape — an upward
 * triangle for a pickup, a downward one for a delivery. Pickup vs delivery
 * is conveyed by SHAPE, never colour.
 */
function StopGlyph({ marker }: { marker: StopMarker }) {
  return (
    <div
      title={marker.tooltip}
      aria-hidden
      className="absolute top-0 bottom-0 flex flex-col items-center"
      style={{ left: `${marker.leftPct}%`, width: `${STOP_WIDTH_PCT}%` }}
    >
      <span
        aria-hidden
        className={cn(
          'h-0 w-0 border-x-[3px] border-x-transparent',
          marker.kind === 'pickup' ? 'border-b-[4px] border-b-foreground' : 'border-t-[4px] border-t-foreground',
        )}
      />
      <span className="w-px flex-1 bg-foreground/80" />
    </div>
  );
}

function nowOfDayPct(): number {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  return ((now.getTime() - startOfDay.getTime()) / DAY_MS) * 100;
}

function stopPct(at: string | null | undefined): number | null {
  if (!at) return null;
  const t = new Date(at).getTime();
  if (Number.isNaN(t)) return null;
  const startOfDay = new Date(t);
  startOfDay.setHours(0, 0, 0, 0);
  const pct = ((t - startOfDay.getTime()) / DAY_MS) * 100;
  return Math.max(0, Math.min(100, pct));
}

/**
 * Human-readable hover text for a stop glyph, e.g.
 *  "Pickup · Cargill, Memphis TN · 2:00 PM"
 * Names the facility when known so the dispatcher recognises the stop without
 * opening the load. Falls back gracefully when a field is missing.
 */
function stopTooltip(stop: ActiveLoadStop): string {
  const label = stop.kind === 'pickup' ? 'Pickup' : 'Delivery';
  const place = [stop.customerName, [stop.city, stop.state].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const when = stop.appointmentAt ? formatTime(new Date(stop.appointmentAt)) : 'time TBD';
  return [label, place || 'location TBD', when].join(' · ');
}

/** Hover text for a travel segment between two stops. */
function travelTooltip(kind: TravelSegment['kind']): string {
  return kind === 'deadhead' ? 'Deadhead — empty miles to the next pickup' : 'In transit — loaded and rolling';
}

function computeTimeline(load: ActiveLoadView): { travel: TravelSegment[]; stops: StopMarker[] } {
  const travel: TravelSegment[] = [];
  const stops: StopMarker[] = [];

  const currentPct = load.currentStop ? stopPct(load.currentStop.appointmentAt) : null;
  const nextPct = load.nextStop ? stopPct(load.nextStop.appointmentAt) : null;

  // Travel between current → next. Loaded run is a drive; an unstarted
  // assignment moving to its first pickup is a deadhead.
  if (currentPct != null && nextPct != null && nextPct > currentPct) {
    const kind: TravelSegment['kind'] = load.assignmentState === 'rolling' ? 'deadhead' : 'drive';
    travel.push({
      kind,
      leftPct: currentPct,
      widthPct: Math.max(1, nextPct - currentPct),
      tooltip: travelTooltip(kind),
    });
  }

  if (load.currentStop && currentPct != null) {
    stops.push({ kind: load.currentStop.kind, leftPct: currentPct, tooltip: stopTooltip(load.currentStop) });
  }
  if (load.nextStop && nextPct != null) {
    stops.push({ kind: load.nextStop.kind, leftPct: nextPct, tooltip: stopTooltip(load.nextStop) });
  }

  return { travel, stops };
}

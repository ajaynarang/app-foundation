'use client';

import type { ActiveLoadView, RiskBand } from '@sally/shared-types';
import { formatLoadLabel } from '@sally/shared-types';
import { cn } from '@sally/ui';
import { RISK_BAND_LABELS, RISK_BAND_TOKENS } from '../../constants';
import { currentLocationLabel, headlineLane, nextStopLine } from '../../utils/tower-load-format';
import { useTowerInteraction } from '../../context/tower-interaction.context';
import { DriverLoadsPopover } from './driver-loads-popover';
import { LaneRibbon } from './lane-ribbon';
import { LaneHos } from './lane-hos';

interface DriverLaneProps {
  /** The driver's most urgent load — headlines the lane. */
  load: ActiveLoadView;
  band: RiskBand;
  /** The driver's other active loads, urgency-sorted — power the +N popover. */
  otherLoads: ActiveLoadView[];
  /** Risk band per loadId — drives the popover row dots. */
  bandByLoadId: Map<string, RiskBand>;
}

const TICK_HOURS = [0, 6, 12, 18, 24]; // rendered as 00 · 06 · NOW · 18 · 24

/**
 * One lane per driver in the spine. Headlined by the driver's most urgent
 * load — surfaced inline (number, lane, next stop + slack) so the card is a
 * finding, not a teaser. A "+N more loads" popover discloses the rest.
 * Layout:
 *  - head: avatar + name + truck id + risk badge
 *  - load identity: load number + lane
 *  - next-stop line: pickup/delivery time + slack
 *  - +N popover (when the driver runs more loads)
 *  - ribbon + tick scale
 *  - HOS bar + readable hours-left / "out of hours" foot
 */
export function DriverLane({ load, band, otherLoads, bandByLoadId }: DriverLaneProps) {
  const { openLoad } = useTowerInteraction();
  const eldDown = load.hos != null && !load.hos.isEldConnected;

  const ariaLabel = [
    load.driver.name,
    `load ${formatLoadLabel(load.loadNumber, load.referenceNumber)}`,
    load.vehicleIdentifier,
    otherLoads.length > 0 ? `${otherLoads.length + 1} active loads` : null,
    RISK_BAND_LABELS[band].toLowerCase(),
    hosAriaSummary(load.hos),
    eldDown ? 'ELD disconnected' : null,
  ]
    .filter(Boolean)
    .join(', ');

  const nextLine = nextStopLine(load);
  const locationLabel = currentLocationLabel(load);

  return (
    <article
      aria-label={ariaLabel}
      className={cn(
        'rounded-md border border-border bg-card p-3 hover:bg-muted/30 transition-colors',
        'motion-reduce:transition-none contrast-more:border-2',
        // High-contrast: a risk lane gets a colored 2px frame, not just a badge.
        band === 'critical' && 'contrast-more:border-red-600 dark:contrast-more:border-red-400',
        band === 'at-risk' && 'contrast-more:border-yellow-600 dark:contrast-more:border-yellow-400',
      )}
    >
      {/* Head row — name + risk badge on top, truck · location on a quiet
          sub-line so nothing competes for the same row or crushes the badge. */}
      <div className="flex items-start gap-2">
        <Avatar initials={load.driver.initials} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex-1 min-w-0 truncate text-sm font-semibold text-foreground">{load.driver.name}</span>
            {band !== 'on-track' && <RiskBadge band={band} load={load} />}
          </div>
          <div className="mt-0.5 flex items-baseline gap-1.5 text-xs text-muted-foreground">
            {load.vehicleIdentifier && <span className="shrink-0">{load.vehicleIdentifier}</span>}
            {load.vehicleIdentifier && locationLabel && <span className="shrink-0">·</span>}
            {locationLabel && <span className="truncate">{locationLabel}</span>}
          </div>
        </div>
      </div>

      {/* Headline load — identity + next stop. The whole block is a button
          that opens the load detail, so the driver's primary load is the
          most-clickable thing on the card (not just the +N popover rows). */}
      <div className="mt-2 pl-10">
        <button
          type="button"
          onClick={() => openLoad(load.loadId)}
          aria-label={`Open load ${formatLoadLabel(load.loadNumber, load.referenceNumber)}`}
          className={cn(
            '-mx-1 block w-[calc(100%+0.5rem)] rounded px-1 py-0.5 text-left',
            'transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'motion-reduce:transition-none',
          )}
        >
          <span className="flex items-baseline gap-1.5 text-xs">
            <span className="font-medium text-foreground tabular-nums shrink-0">
              {formatLoadLabel(load.loadNumber, load.referenceNumber)}
            </span>
            <span className="text-muted-foreground truncate">{headlineLane(load)}</span>
          </span>
          {nextLine && <span className="mt-0.5 block text-xs text-muted-foreground">Next: {nextLine}</span>}
        </button>
        {otherLoads.length > 0 && (
          <div className="mt-1.5">
            <DriverLoadsPopover otherLoads={otherLoads} bandByLoadId={bandByLoadId} driverName={load.driver.name} />
          </div>
        )}
      </div>

      {/* Ribbon */}
      <div className="mt-3">
        <LaneRibbon load={load} band={band} />
        <TickScale />
      </div>

      {/* Foot — four HOS clocks, tightest headlined */}
      <div className="mt-2">
        <LaneHos hos={load.hos} />
      </div>
    </article>
  );
}

function Avatar({ initials }: { initials: string }) {
  return (
    <div
      aria-hidden
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground"
    >
      {initials}
    </div>
  );
}

function RiskBadge({ band, load }: { band: RiskBand; load: ActiveLoadView }) {
  const text =
    band === 'critical' ? (load.slackMinutes != null && load.slackMinutes < 0 ? `HOS CLASH` : 'CRITICAL') : 'FRAGILE';

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide border',
        // High-contrast: thicker frame + one-step-deeper text colour.
        'contrast-more:border-2',
        RISK_BAND_TOKENS[band],
        band === 'critical'
          ? 'border-red-500/40 bg-red-500/10 contrast-more:border-red-600 contrast-more:text-red-700 dark:contrast-more:text-red-300'
          : 'border-yellow-500/40 bg-yellow-500/10 contrast-more:border-yellow-600 contrast-more:text-yellow-700 dark:contrast-more:text-yellow-300',
      )}
    >
      {text}
    </span>
  );
}

function TickScale() {
  return (
    <div className="mt-1 grid grid-cols-5 text-[10px] text-muted-foreground/70">
      {TICK_HOURS.map((h, i) => (
        <span
          key={h}
          className={cn('text-center', i === 0 && 'text-left', i === TICK_HOURS.length - 1 && 'text-right')}
        >
          {h === 12 ? 'NOW' : h.toString().padStart(2, '0')}
        </span>
      ))}
    </div>
  );
}

/**
 * One-line HOS summary for the lane's screen-reader label — names the four
 * clocks so the card's aria-label still conveys the full HOS picture.
 */
function hosAriaSummary(hos: ActiveLoadView['hos']): string {
  if (!hos) return 'HOS no ELD data';
  const part = (label: string, min: number) => {
    const m = Math.round(min);
    if (m <= 0) return `${label} out`;
    const h = Math.floor(m / 60);
    return h > 0 ? `${label} ${h}h ${m % 60}m` : `${label} ${m}m`;
  };
  const clocks = [
    part('drive', hos.driveMinutesRemaining),
    part('duty', hos.dutyMinutesRemaining),
    part('cycle', hos.cycleMinutesRemaining),
    hos.breakMinutesRemaining != null ? part('break', hos.breakMinutesRemaining) : null,
  ].filter(Boolean);
  return `HOS ${clocks.join(', ')}`;
}

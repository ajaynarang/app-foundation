'use client';

import { useMemo } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { ActiveLoadView } from '@sally/shared-types';
import { RadarEvent } from './radar-event';

interface RadarLedgeProps {
  loads: ActiveLoadView[];
  /** Collapsed = header row only, timeline track hidden. */
  isCollapsed: boolean;
  /** Toggle collapsed/expanded. The owner persists the preference. */
  onToggleCollapse: () => void;
}

const WINDOW_MS = 4 * 60 * 60_000; // next 4 hours

interface EventRow {
  key: string;
  kind: 'pickup' | 'delivery';
  loadNumber: string;
  driverName: string;
  city: string | null;
  state: string | null;
  appointmentAt: string;
  leftPct: number;
}

/**
 * Bottom strip on the map: scheduled pickups + deliveries in the next 4 hours,
 * positioned proportionally along the window.
 *
 * Collapsible — the header row doubles as the collapse toggle. Collapsed, only
 * that row stays and the proportional timeline track is dropped, so less of the
 * map sits under the ledge (the ledge floats over the map, so this frees the
 * dispatcher's view rather than resizing the GL canvas).
 */
export function RadarLedge({ loads, isCollapsed, onToggleCollapse }: RadarLedgeProps) {
  const events = useMemo(() => buildEvents(loads), [loads]);

  return (
    // Floats just above the page-bottom loads handle so the two never overlap;
    // inset from the edges so it reads as a panel inside the map, not chrome.
    <div className="absolute bottom-8 left-3 right-3 z-10 rounded-md border border-border bg-card/90 backdrop-blur-sm px-4 py-2 shadow-sm">
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-expanded={!isCollapsed}
        aria-label={isCollapsed ? 'Expand next 4 hours' : 'Collapse next 4 hours'}
        className="flex w-full items-center justify-between text-2xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
      >
        <span className="font-medium uppercase tracking-wide">Next 4 hours</span>
        <span className="flex items-center gap-1.5">
          <span className="tabular-nums">
            {events.length} {events.length === 1 ? 'event' : 'events'}
          </span>
          {isCollapsed ? (
            <ChevronUp className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          )}
        </span>
      </button>
      {!isCollapsed && (
        <div className="relative mt-2 h-3 rounded bg-muted/50">
          {events.map((e) => (
            <RadarEvent
              key={e.key}
              kind={e.kind}
              loadNumber={e.loadNumber}
              driverName={e.driverName}
              city={e.city}
              state={e.state}
              appointmentAt={e.appointmentAt}
              leftPct={e.leftPct}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function buildEvents(loads: ActiveLoadView[]): EventRow[] {
  const now = Date.now();
  const out: EventRow[] = [];
  for (const load of loads) {
    for (const stop of [load.currentStop, load.nextStop]) {
      if (!stop?.appointmentAt) continue;
      const t = new Date(stop.appointmentAt).getTime();
      if (Number.isNaN(t)) continue;
      if (t < now || t > now + WINDOW_MS) continue;
      out.push({
        key: `${load.loadId}-${stop.stopId}`,
        kind: stop.kind,
        loadNumber: load.loadNumber,
        driverName: load.driver.name,
        city: stop.city,
        state: stop.state,
        appointmentAt: stop.appointmentAt,
        leftPct: ((t - now) / WINDOW_MS) * 100,
      });
    }
  }
  return out.sort((a, b) => a.leftPct - b.leftPct);
}

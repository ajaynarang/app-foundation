'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MapGL, { NavigationControl, ScaleControl, type MapRef } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useTheme } from 'next-themes';
import { MapPin, Truck } from 'lucide-react';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import type { LookaheadHours, RiskBand, RiskScore } from '@sally/shared-types';
import { useMapData } from '../../hooks/use-map-data';
import { useActiveLoads } from '../../hooks/use-active-loads';
import { useStaleMapDetector } from '../../hooks/use-stale-map-detector';
import { useRadarCollapsed } from '../../hooks/use-radar-collapsed';
import { matchesRiskFilter, type RiskFilter } from '../../constants';
import type { MapTruckLocation } from '../../types';
import { MapResetButton } from './map-reset-button';
import { MapLegend } from './map-legend';
import { MapStaleBanner } from './map-stale-banner';
import { TruckMarker } from './truck-marker';
import { DeadheadLine } from './deadhead-line';
import { LoadRouteLine } from './load-route-line';
import { WeatherOverlay } from './weather-overlay';
import { InspectPopover } from './inspect-popover';
import { RadarLedge } from './radar-ledge/radar-ledge';

interface TowerMapProps {
  lookaheadHours: LookaheadHours;
  riskScores: RiskScore[];
  /** Canvas-wide risk filter (from the control row) — scopes the visible trucks. */
  riskFilter: RiskFilter;
  /** Resets the risk filter to All — backs the "Show all" affordance when a filter empties the map. */
  onClearRiskFilter: () => void;
  onOpenLoad: (loadId: string) => void;
  /**
   * Side-panel visibility from `useTowerLayout`. Toggling a panel resizes the
   * map's grid cell via a CSS change Mapbox can't observe on its own — this
   * signal lets the map force a GL resize at exactly that moment.
   */
  panelsKey: string;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const MAP_STYLE_DARK = 'mapbox://styles/mapbox/dark-v11';
const MAP_STYLE_LIGHT = 'mapbox://styles/mapbox/outdoors-v12';

/** Continental-US fallback view when there are no positions to frame. */
const US_VIEW = { longitude: -98.5795, latitude: 39.8283, zoom: 3.4 } as const;

/**
 * Padding for the auto-fit. Generous on top (toolbar) and bottom (radar ledge
 * + loads handle) so no truck hides under a chrome element.
 */
const FIT_PADDING = { top: 64, bottom: 96, left: 56, right: 56 } as const;

/** Reach this zoom for a lone truck — fitBounds can't infer a scale from one point. */
const SINGLE_TRUCK_ZOOM = 9;

/**
 * Risk-coded fleet map. Composition root for the middle column.
 *
 * On load — and whenever the visible truck set changes — the viewport
 * auto-fits to the fleet's actual positions, so a regional carrier sees their
 * region instead of the whole country. Truck markers are risk-colored;
 * at-risk and critical trucks are enlarged and pulsed so the dispatcher's eye
 * lands on them first.
 */
export function TowerMap({
  lookaheadHours,
  riskScores,
  riskFilter,
  onClearRiskFilter,
  onOpenLoad,
  panelsKey,
}: TowerMapProps) {
  const mapRef = useRef<MapRef>(null);
  const containerRef = useRef<HTMLElement>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== 'light';

  const { data: mapData, isLoading: mapLoading } = useMapData(true);
  const { data: activeLoads } = useActiveLoads(lookaheadHours);

  const [selectedTruckId, setSelectedTruckId] = useState<string | null>(null);
  const { isCollapsed: radarCollapsed, toggleCollapsed: toggleRadarCollapsed } = useRadarCollapsed();

  const bandByLoadId = useMemo(() => {
    const map = new Map<string, RiskBand>();
    for (const s of riskScores) map.set(s.loadId, s.band);
    return map;
  }, [riskScores]);

  const scoreByLoadId = useMemo(() => {
    const map = new Map<string, RiskScore>();
    for (const s of riskScores) map.set(s.loadId, s);
    return map;
  }, [riskScores]);

  // Trucks with a real fix — collapsed to one marker per driver. The feed can
  // return one entry per active load, so a multi-load driver shows up twice.
  const locatedTrucks = useMemo(() => {
    const raw = (mapData?.trucks ?? []).filter((t) => t.latitude !== 0 || t.longitude !== 0);
    const byDriver = new Map<string, (typeof raw)[number]>();
    for (const t of raw) {
      if (!byDriver.has(t.driverId)) byDriver.set(t.driverId, t);
    }
    return Array.from(byDriver.values());
  }, [mapData?.trucks]);

  const visibleTrucks = useMemo(() => {
    if (riskFilter === 'all') return locatedTrucks;
    return locatedTrucks.filter((t) => matchesRiskFilter(truckBand(t, bandByLoadId), riskFilter));
  }, [locatedTrucks, riskFilter, bandByLoadId]);

  const stale = useStaleMapDetector(mapData?.lastUpdated ?? null);

  const selectedTruck = useMemo(
    () => (selectedTruckId ? (visibleTrucks.find((t) => t.driverId === selectedTruckId) ?? null) : null),
    [selectedTruckId, visibleTrucks],
  );

  const handleMapClick = useCallback(() => setSelectedTruckId(null), []);

  // ── Auto-fit the viewport to the fleet ──────────────────────────────────
  const mapLoadedRef = useRef(false);
  // The set of driver ids we last framed — so we only re-fit when it changes,
  // not on every poll that returns the same trucks in new positions.
  const lastFitKeyRef = useRef<string>('');
  // True for the duration of a programmatic camera move (`fitToFleet`). The
  // `moveend` listener checks this so the auto-fit's own settle isn't read as
  // the dispatcher having panned away.
  const programmaticMoveRef = useRef(false);
  // Whether the dispatcher has manually moved the map off the fleet framing.
  // Drives the conditional reset-to-fleet button — false = button hidden.
  const [hasMovedAway, setHasMovedAway] = useState(false);

  const fitToFleet = useCallback(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current || locatedTrucks.length === 0) return;

    // Any camera change from here is ours — flag it so `moveend` ignores it,
    // and drop the "moved away" state since we're back on the fleet framing.
    programmaticMoveRef.current = true;
    setHasMovedAway(false);

    if (locatedTrucks.length === 1) {
      const only = locatedTrucks[0];
      map.easeTo({ center: [only.longitude, only.latitude], zoom: SINGLE_TRUCK_ZOOM, duration: 600 });
      return;
    }

    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;
    for (const t of locatedTrucks) {
      minLng = Math.min(minLng, t.longitude);
      minLat = Math.min(minLat, t.latitude);
      maxLng = Math.max(maxLng, t.longitude);
      maxLat = Math.max(maxLat, t.latitude);
    }
    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding: FIT_PADDING, duration: 600, maxZoom: 11 },
    );
  }, [locatedTrucks]);

  // Re-fit only when the framed driver set changes (add/remove a truck), not
  // on every position tick — otherwise the map would jitter on each poll.
  useEffect(() => {
    const key = locatedTrucks
      .map((t) => t.driverId)
      .sort()
      .join('|');
    if (key === lastFitKeyRef.current) return;
    lastFitKeyRef.current = key;
    fitToFleet();
  }, [locatedTrucks, fitToFleet]);

  const handleMapLoad = useCallback(() => {
    mapLoadedRef.current = true;
    fitToFleet();
  }, [fitToFleet]);

  // A settled camera move that wasn't ours means the dispatcher panned/zoomed
  // away from the fleet framing — surface the reset button. `fitToFleet`'s own
  // moves clear the programmatic flag here instead of tripping the button.
  const handleMoveEnd = useCallback(() => {
    if (programmaticMoveRef.current) {
      programmaticMoveRef.current = false;
      return;
    }
    setHasMovedAway(true);
  }, []);

  // ── Keep the GL canvas matched to its container ─────────────────────────
  // The Tower layout lets the dispatcher hide side panels and drag-resize
  // columns. Mapbox sizes its canvas once and won't notice a CSS-driven
  // width change, so without this the canvas keeps its stale pixel size and
  // the map leaves a gap (or shows stale tiles). A ResizeObserver on the
  // container calls map.resize() on every container size change. The resize
  // is deferred to the next animation frame so a fast drag coalesces into
  // one resize per frame instead of spamming the GL context.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        mapRef.current?.resize();
      });
    });
    observer.observe(container);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  // Hiding/showing a side panel rewrites the layout grid template. The grid
  // cell resizes instantly, but the ResizeObserver above can fire before the
  // browser has applied the new layout — Mapbox then reads a stale clientWidth
  // and the canvas stays at its old size (full-width only reappears on a
  // reload). Forcing a resize across the next two frames — once after layout,
  // once after paint — pins the GL canvas to the settled cell width.
  useEffect(() => {
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      mapRef.current?.resize();
      raf2 = requestAnimationFrame(() => mapRef.current?.resize());
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [panelsKey]);

  if (mapLoading) {
    return (
      <section aria-label="Tower map" className="relative flex h-full items-center justify-center bg-muted/20">
        <Skeleton className="h-3/4 w-3/4 rounded-lg" />
      </section>
    );
  }

  if (!MAPBOX_TOKEN) {
    return (
      <section
        aria-label="Tower map"
        className="relative flex h-full flex-col items-center justify-center gap-2 bg-muted/20 text-center px-6"
      >
        <MapPin className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Map not configured</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          Set <code className="bg-muted px-1 rounded">NEXT_PUBLIC_MAPBOX_TOKEN</code> to enable the live fleet map.
        </p>
      </section>
    );
  }

  return (
    <section ref={containerRef} aria-label="Tower map" className="relative h-full w-full overflow-hidden bg-background">
      <MapGL
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={US_VIEW}
        style={{ width: '100%', height: '100%' }}
        mapStyle={isDark ? MAP_STYLE_DARK : MAP_STYLE_LIGHT}
        onLoad={handleMapLoad}
        onClick={handleMapClick}
        onMoveEnd={handleMoveEnd}
      >
        {/* Compass hidden — the Tower map is strictly top-down and never
            rotated, so a rotation/pitch reset is dead weight (and reads as a
            viewport-reset button it isn't). The reset-to-fleet button below
            is the only viewport-reset affordance. */}
        <NavigationControl position="top-right" showCompass={false} />
        <ScaleControl position="bottom-right" maxWidth={100} unit="imperial" />

        <DeadheadLine trucks={visibleTrucks} />
        {/* Selected truck's load route — origin → stops → destination. */}
        <LoadRouteLine truck={selectedTruck} />
        <WeatherOverlay />

        {visibleTrucks.map((truck) => (
          <TruckMarker
            key={truck.driverId}
            truck={truck}
            band={truckBand(truck, bandByLoadId)}
            isSelected={selectedTruckId === truck.driverId}
            isStale={stale.isStale}
            onClick={() => setSelectedTruckId((prev) => (prev === truck.driverId ? null : truck.driverId))}
          />
        ))}

        {selectedTruck && (
          <InspectPopover
            truck={selectedTruck}
            band={truckBand(selectedTruck, bandByLoadId)}
            score={selectedTruck.activeLoad ? scoreByLoadId.get(selectedTruck.activeLoad.loadNumber) : undefined}
            onOpenLoad={onOpenLoad}
            onClose={() => setSelectedTruckId(null)}
          />
        )}
      </MapGL>

      {/* Risk filter lives in the canvas control row above the map — no on-map pill. */}
      {/* Conditional — only once the dispatcher has moved off the fleet
          framing, and only when there's a fleet to frame. */}
      {hasMovedAway && locatedTrucks.length > 0 && <MapResetButton onReset={fitToFleet} />}
      <MapLegend />
      {stale.isStale && <MapStaleBanner ageMs={stale.ageMs} />}

      {locatedTrucks.length === 0 ? (
        <MapEmptyState filtered={false} />
      ) : visibleTrucks.length === 0 ? (
        <MapEmptyState filtered onClearFilter={onClearRiskFilter} />
      ) : null}

      <RadarLedge loads={activeLoads ?? []} isCollapsed={radarCollapsed} onToggleCollapse={toggleRadarCollapsed} />
    </section>
  );
}

/**
 * Plain-language overlay shown when there's nothing to plot — either no truck
 * has a position fix, or the active filter excluded every truck.
 */
function MapEmptyState({ filtered, onClearFilter }: { filtered: boolean; onClearFilter?: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="pointer-events-auto flex max-w-xs flex-col items-center gap-1.5 rounded-lg border border-border bg-card/95 px-6 py-5 text-center shadow-lg backdrop-blur-sm">
        <Truck className="h-7 w-7 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium text-foreground">
          {filtered ? 'No trucks match this filter' : 'No truck positions yet'}
        </p>
        <p className="text-xs text-muted-foreground">
          {filtered
            ? 'Switch back to All to see the whole fleet.'
            : 'Positions appear here once trucks report a GPS fix.'}
        </p>
        {filtered && onClearFilter && (
          <button
            type="button"
            onClick={onClearFilter}
            className="mt-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Show all
          </button>
        )}
      </div>
    </div>
  );
}

function truckBand(truck: MapTruckLocation, bandByLoadId: Map<string, RiskBand>): RiskBand {
  return truck.activeLoad ? (bandByLoadId.get(truck.activeLoad.loadNumber) ?? 'on-track') : 'on-track';
}

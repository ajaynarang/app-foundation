'use client';

import { useMemo } from 'react';
import { Marker, Source, Layer } from 'react-map-gl/mapbox';
import { Flag, MapPin, PackageCheck } from 'lucide-react';
import type { FeatureCollection } from 'geojson';
import { cn } from '@sally/ui';
import { LOAD_ROUTE_COLOR } from '../../constants';
import type { MapRouteStop, MapTruckLocation } from '../../types';

interface LoadRouteLineProps {
  /** The currently selected truck, or null when nothing is selected. */
  truck: MapTruckLocation | null;
}

const SOURCE_ID = 'tower-load-route';

/** Per-stop glyph: first stop is the pickup, last is the delivery. */
function stopGlyph(index: number, total: number) {
  if (index === 0) return Flag;
  if (index === total - 1) return PackageCheck;
  return MapPin;
}

/**
 * Draws the selected truck's active-load route on the map — a straight-line
 * connector through the load's stop sequence (origin → intermediate → dest),
 * plus a small numbered marker at each stop.
 *
 * Renders only for the selected truck (passed in by TowerMap); clears when the
 * truck is deselected or has no geocoded route. This is a great-circle
 * connector, not a road-snapped polyline — a real road route would need the
 * routing provider wired into the map-data endpoint.
 */
export function LoadRouteLine({ truck }: LoadRouteLineProps) {
  const stops = useMemo<MapRouteStop[]>(() => truck?.activeLoad?.stops ?? [], [truck]);

  const lineData = useMemo<FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features:
        stops.length >= 2
          ? [
              {
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'LineString',
                  coordinates: stops.map((s) => [s.lng, s.lat]),
                },
              },
            ]
          : [],
    }),
    [stops],
  );

  if (stops.length < 2) return null;

  return (
    <>
      <Source id={SOURCE_ID} type="geojson" data={lineData}>
        <Layer
          id={`${SOURCE_ID}-line`}
          type="line"
          paint={{
            'line-color': LOAD_ROUTE_COLOR,
            'line-width': 3,
            'line-opacity': 0.65,
          }}
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        />
      </Source>

      {stops.map((stop, index) => {
        const Glyph = stopGlyph(index, stops.length);
        const label = `Stop ${index + 1} of ${stops.length}: ${stop.actionType}, ${stop.city}${
          stop.state ? `, ${stop.state}` : ''
        }`;
        return (
          <Marker key={`${stop.sequenceOrder}-${index}`} longitude={stop.lng} latitude={stop.lat} anchor="center">
            <span
              role="img"
              aria-label={label}
              title={label}
              className={cn(
                'flex h-5 w-5 items-center justify-center rounded-full',
                'border border-background bg-card text-foreground shadow-sm',
              )}
            >
              <Glyph className="h-3 w-3" aria-hidden style={{ color: LOAD_ROUTE_COLOR }} />
            </span>
          </Marker>
        );
      })}
    </>
  );
}

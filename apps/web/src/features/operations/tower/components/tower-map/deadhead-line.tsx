'use client';

import { Source, Layer } from 'react-map-gl/mapbox';
import type { FeatureCollection } from 'geojson';
import type { MapTruckLocation } from '../../types';

interface DeadheadLineProps {
  trucks: MapTruckLocation[];
}

/**
 * Gray-dashed polyline between a truck's current GPS and its load origin —
 * only for assigned (not-yet-rolling) trucks. v3 brainstorm-locked feature.
 */
export function DeadheadLine({ trucks }: DeadheadLineProps) {
  const data: FeatureCollection = {
    type: 'FeatureCollection',
    features: trucks
      .filter((t) => t.activeLoad && t.status !== 'moving' && (t.latitude !== 0 || t.longitude !== 0))
      .map((t) => ({
        type: 'Feature' as const,
        properties: { id: t.driverId },
        geometry: {
          type: 'LineString' as const,
          coordinates: [
            [t.longitude, t.latitude],
            [t.activeLoad!.origin.lng, t.activeLoad!.origin.lat],
          ],
        },
      })),
  };

  if (data.features.length === 0) return null;

  return (
    <Source id="tower-deadhead-lines" type="geojson" data={data}>
      <Layer
        id="tower-deadhead-lines"
        type="line"
        paint={{
          'line-color': '#6b7280',
          'line-width': 1.5,
          'line-opacity': 0.6,
          'line-dasharray': [3, 3],
        }}
      />
    </Source>
  );
}

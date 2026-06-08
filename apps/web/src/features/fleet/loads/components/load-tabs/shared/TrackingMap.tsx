'use client';

import { useRef, useCallback, useEffect, useMemo } from 'react';
import Map, {
  NavigationControl,
  FullscreenControl,
  ScaleControl,
  Source,
  Layer,
  Marker,
  type MapRef,
} from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useTheme } from 'next-themes';
import type { MapTruckLocation } from '@/features/operations/tower/types';
import type { FeatureCollection } from 'geojson';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

const MAP_STYLES = {
  dark: 'mapbox://styles/mapbox/dark-v11',
  light: 'mapbox://styles/mapbox/outdoors-v12',
};

const STATUS_COLORS: Record<MapTruckLocation['status'], string> = {
  moving: 'bg-emerald-500',
  idle: 'bg-yellow-500',
  parked: 'bg-gray-500',
};

const HOS_COLORS: Record<string, string> = {
  safe: 'bg-emerald-600 text-white',
  warning: 'bg-yellow-500 text-black',
  critical: 'bg-red-600 text-white',
};

interface TrackingMapProps {
  truck: MapTruckLocation;
  /** Road-following route GeoJSON from route plan (when available) */
  routeGeoJSON?: FeatureCollection | null;
}

export function TrackingMap({ truck, routeGeoJSON }: TrackingMapProps) {
  const mapRef = useRef<MapRef>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== 'light';

  // Use route plan polylines if available, otherwise fall back to straight line
  const hasRoutePolyline = routeGeoJSON && routeGeoJSON.features.length > 0;

  const routeLineFeatures = useMemo<FeatureCollection>(() => {
    if (hasRoutePolyline) {
      // Filter to only LineString features (drive segments)
      return {
        type: 'FeatureCollection',
        features: routeGeoJSON!.features.filter((f) => f.geometry.type === 'LineString'),
      };
    }
    // Fallback: straight dashed line origin → truck → destination
    if (!truck.activeLoad) return { type: 'FeatureCollection', features: [] };
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature' as const,
          properties: {},
          geometry: {
            type: 'LineString' as const,
            coordinates: [
              [truck.activeLoad.origin.lng, truck.activeLoad.origin.lat],
              [truck.longitude, truck.latitude],
              [truck.activeLoad.destination.lng, truck.activeLoad.destination.lat],
            ],
          },
        },
      ],
    };
  }, [hasRoutePolyline, routeGeoJSON, truck]);

  // Stop markers from route plan GeoJSON (Point features)
  const stopMarkers = useMemo(() => {
    if (!hasRoutePolyline) return [];
    return routeGeoJSON!.features.filter((f) => f.geometry.type === 'Point');
  }, [hasRoutePolyline, routeGeoJSON]);

  // Collect all coordinates for fitBounds
  const fitBounds = useCallback(() => {
    if (!mapRef.current) return;
    const points: [number, number][] = [[truck.longitude, truck.latitude]];
    if (truck.activeLoad) {
      points.push([truck.activeLoad.origin.lng, truck.activeLoad.origin.lat]);
      points.push([truck.activeLoad.destination.lng, truck.activeLoad.destination.lat]);
    }
    if (points.length < 2) return;
    const lngs = points.map((p) => p[0]);
    const lats = points.map((p) => p[1]);
    mapRef.current.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 60, duration: 1000 },
    );
  }, [truck]);

  useEffect(() => {
    const timer = setTimeout(fitBounds, 300);
    return () => clearTimeout(timer);
  }, [fitBounds]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Map unavailable — Mapbox token not configured
      </div>
    );
  }

  return (
    <Map
      ref={mapRef}
      mapboxAccessToken={MAPBOX_TOKEN}
      mapStyle={isDark ? MAP_STYLES.dark : MAP_STYLES.light}
      initialViewState={{
        longitude: truck.longitude,
        latitude: truck.latitude,
        zoom: 7,
      }}
      style={{ width: '100%', height: '100%' }}
    >
      <NavigationControl position="top-right" />
      <FullscreenControl position="top-right" />
      <ScaleControl position="bottom-right" />

      {/* Route polyline */}
      {routeLineFeatures.features.length > 0 && (
        <Source id="tracking-route" type="geojson" data={routeLineFeatures}>
          <Layer
            id="tracking-route-line"
            type="line"
            paint={{
              'line-color': '#3b82f6',
              'line-width': hasRoutePolyline ? 4 : 3,
              'line-opacity': hasRoutePolyline ? 0.7 : 0.5,
              ...(hasRoutePolyline ? {} : { 'line-dasharray': [4, 3] }),
            }}
            layout={{
              'line-cap': 'round',
              'line-join': 'round',
            }}
          />
        </Source>
      )}

      {/* Stop markers from route plan GeoJSON */}
      {stopMarkers.map((feature, idx) => {
        if (feature.geometry.type !== 'Point') return null;
        const [lng, lat] = feature.geometry.coordinates;
        const props = feature.properties ?? {};
        const segType = props.segmentType as string;
        const isStop = segType === 'dock' || segType === 'fuel';
        if (!isStop) return null;
        return (
          <Marker key={`stop-${idx}`} longitude={lng} latitude={lat} anchor="center">
            <div className="flex flex-col items-center">
              <div
                className={`w-3 h-3 rounded-full shadow-md border border-background ${
                  segType === 'fuel' ? 'bg-caution' : 'bg-accent'
                }`}
              />
              {props.toLocation && (
                <div className="mt-0.5 px-1 py-px rounded bg-background/80 backdrop-blur-sm border border-border">
                  <span className="text-[8px] text-muted-foreground whitespace-nowrap">{props.toLocation}</span>
                </div>
              )}
            </div>
          </Marker>
        );
      })}

      {/* Origin marker (fallback when no route plan) */}
      {!hasRoutePolyline && truck.activeLoad && (
        <Marker longitude={truck.activeLoad.origin.lng} latitude={truck.activeLoad.origin.lat} anchor="center">
          <div className="flex flex-col items-center">
            <div className="w-4 h-4 rounded-full bg-accent shadow-lg shadow-accent/40 border-2 border-background" />
            <div className="mt-1 px-1.5 py-0.5 rounded bg-background/80 backdrop-blur-sm border border-border shadow-sm">
              <span className="text-[9px] text-muted-foreground whitespace-nowrap">{truck.activeLoad.origin.city}</span>
            </div>
          </div>
        </Marker>
      )}

      {/* Destination marker (fallback when no route plan) */}
      {!hasRoutePolyline && truck.activeLoad && (
        <Marker
          longitude={truck.activeLoad.destination.lng}
          latitude={truck.activeLoad.destination.lat}
          anchor="center"
        >
          <div className="flex flex-col items-center">
            <div className="w-4 h-4 rounded-full border-2 border-foreground bg-background shadow-lg" />
            <div className="mt-1 px-1.5 py-0.5 rounded bg-background/80 backdrop-blur-sm border border-border shadow-sm">
              <span className="text-[9px] text-muted-foreground whitespace-nowrap">
                {truck.activeLoad.destination.city}
              </span>
            </div>
          </div>
        </Marker>
      )}

      {/* Truck marker */}
      <Marker longitude={truck.longitude} latitude={truck.latitude} anchor="center">
        <div className="flex flex-col items-center">
          <div className="relative">
            {truck.status === 'moving' && (
              <span
                className={`absolute inset-0 rounded-full ${STATUS_COLORS[truck.status]} animate-ping opacity-40`}
              />
            )}
            <div
              className={`relative z-10 flex items-center justify-center w-10 h-10 rounded-full border-2 border-background shadow-lg ${STATUS_COLORS[truck.status]}`}
            >
              <span className="text-base" role="img" aria-label="truck">
                🚛
              </span>
            </div>
          </div>
          <div className="mt-1 px-2 py-0.5 rounded bg-background/90 backdrop-blur-sm border border-border shadow-sm">
            <span className="text-2xs font-medium text-foreground whitespace-nowrap">{truck.driverName}</span>
          </div>
          {truck.hosStatus !== 'none' && (
            <div
              className={`mt-0.5 px-1.5 py-px rounded-full text-[9px] font-semibold leading-tight ${HOS_COLORS[truck.hosStatus]}`}
            >
              {truck.hosDriveRemaining.toFixed(1)}h drive
            </div>
          )}
        </div>
      </Marker>
    </Map>
  );
}

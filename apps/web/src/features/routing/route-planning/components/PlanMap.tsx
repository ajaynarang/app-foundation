'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Map, {
  Layer,
  NavigationControl,
  FullscreenControl,
  ScaleControl,
  Popup,
  Source,
  MapRef,
} from 'react-map-gl/mapbox';
import type { MapMouseEvent } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useTheme } from 'next-themes';
import { Maximize2 } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import type { FeatureCollection, Feature } from 'geojson';

import { RouteMarker } from './RouteMarker';
import { SegmentPopup } from './SegmentPopup';

// ─── Constants ──────────────────────────────────────────────────────────────

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

const SEGMENT_COLORS: Record<string, string> = {
  drive: '#7c8aff',
  rest: '#8b5cf6',
  fuel: '#f59e0b',
  dock: '#4ade80',
  break: '#94a3b8',
};

const MAP_STYLES = {
  dark: 'mapbox://styles/mapbox/dark-v11',
  light: 'mapbox://styles/mapbox/outdoors-v12',
};

const FOG_DARK = {
  range: [-1, 2] as [number, number],
  'horizon-blend': 0.3,
  color: '#242B4B',
  'high-color': '#161B36',
  'space-color': '#0B1026',
  'star-intensity': 0.8,
};

const FOG_LIGHT = {
  range: [-1, 2] as [number, number],
  'horizon-blend': 0.3,
  color: 'white',
  'high-color': '#add8e6',
  'space-color': '#d8f2ff',
  'star-intensity': 0.0,
};

// ─── Types ──────────────────────────────────────────────────────────────────

interface PopupInfo {
  longitude: number;
  latitude: number;
  properties: Record<string, string | number | boolean | null | undefined>;
}

interface PlanMapProps {
  geojson: FeatureCollection | null | undefined;
  isLoading?: boolean;
  selectedSegmentId?: string | null;
  hoveredSegmentId?: string | null;
  onSegmentSelect?: (segmentId: string | null) => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getBoundsFromGeoJSON(geojson: FeatureCollection): [number, number, number, number] | null {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  let hasCoords = false;

  for (const feature of geojson.features) {
    const coords =
      feature.geometry.type === 'Point'
        ? [feature.geometry.coordinates as [number, number]]
        : feature.geometry.type === 'LineString'
          ? (feature.geometry.coordinates as [number, number][])
          : [];
    for (const [lng, lat] of coords) {
      if (lng != null && lat != null) {
        minLng = Math.min(minLng, lng);
        minLat = Math.min(minLat, lat);
        maxLng = Math.max(maxLng, lng);
        maxLat = Math.max(maxLat, lat);
        hasCoords = true;
      }
    }
  }

  return hasCoords ? [minLng, minLat, maxLng, maxLat] : null;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function PlanMap({ geojson, isLoading, selectedSegmentId, hoveredSegmentId, onSegmentSelect }: PlanMapProps) {
  const mapRef = useRef<MapRef>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== 'light';
  const [popupInfo, setPopupInfo] = useState<PopupInfo | null>(null);
  const animationRef = useRef<number | null>(null);

  // ── Separate line and point features ────────────────────────────────────
  const lineFeatures = useMemo<FeatureCollection | null>(() => {
    if (!geojson) return null;
    return {
      type: 'FeatureCollection',
      features: geojson.features.filter(
        (f) => f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString',
      ),
    };
  }, [geojson]);

  const pointFeatures = useMemo<Feature[]>(() => {
    if (!geojson) return [];
    return geojson.features.filter((f) => f.geometry.type === 'Point');
  }, [geojson]);

  const mapLoadedRef = useRef(false);

  // ── Fit bounds when geojson arrives or map loads ────────────────────────
  const fitToRoute = useCallback(() => {
    if (!geojson || !mapRef.current || !mapLoadedRef.current) return;
    const bounds = getBoundsFromGeoJSON(geojson);
    if (bounds) {
      mapRef.current.fitBounds(bounds, {
        padding: { top: 80, bottom: 40, left: 40, right: 40 },
        duration: 1000,
      });
    }
  }, [geojson]);

  // Re-fit when geojson changes (map may already be loaded)
  useEffect(() => {
    fitToRoute();
  }, [fitToRoute]);

  // ── Fly to selected segment ─────────────────────────────────────────────
  useEffect(() => {
    if (!selectedSegmentId || !mapRef.current || !geojson) return;
    const feature = geojson.features.find((f) => f.properties?.segmentId === selectedSegmentId);
    if (!feature) return;

    let lng: number;
    let lat: number;
    if (feature.geometry.type === 'Point') {
      [lng, lat] = feature.geometry.coordinates as [number, number];
    } else if (feature.geometry.type === 'LineString') {
      const coords = feature.geometry.coordinates as [number, number][];
      const mid = coords[Math.floor(coords.length / 2)];
      [lng, lat] = mid;
    } else return;

    mapRef.current.flyTo({
      center: [lng, lat],
      zoom: 12,
      speed: 0.8,
      curve: 1.2,
      duration: 1500,
    });

    // Open popup for selected segment
    setPopupInfo({
      longitude: lng,
      latitude: lat,
      properties: feature.properties as PopupInfo['properties'],
    });
  }, [selectedSegmentId, geojson]);

  // ── Hover highlight ─────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !map.isStyleLoaded() || !map.getLayer('route-lines')) return;

    if (hoveredSegmentId) {
      // Highlight hovered segment by increasing opacity
      map.setPaintProperty('route-lines', 'line-opacity', [
        'case',
        ['==', ['get', 'segmentId'], hoveredSegmentId],
        0.9,
        0.2,
      ]);
      map.setPaintProperty('route-lines', 'line-width', ['case', ['==', ['get', 'segmentId'], hoveredSegmentId], 6, 3]);
    } else {
      // Reset to default
      map.setPaintProperty('route-lines', 'line-opacity', 0.4);
      map.setPaintProperty('route-lines', 'line-width', 4);
    }
  }, [hoveredSegmentId]);

  // ── Ant-path animation ──────────────────────────────────────────────────
  const setupAntPath = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const mapInstance = map!;

    const dashArraySequence = [
      [0, 4, 3],
      [0.5, 4, 2.5],
      [1, 4, 2],
      [1.5, 4, 1.5],
      [2, 4, 1],
      [2.5, 4, 0.5],
      [3, 4, 0],
      [0, 0.5, 3, 3.5],
      [0, 1, 3, 3],
      [0, 1.5, 3, 2.5],
      [0, 2, 3, 2],
      [0, 2.5, 3, 1.5],
      [0, 3, 3, 1],
      [0, 3.5, 3, 0.5],
    ];

    let step = 0;
    let lastTime = 0;
    const FRAME_INTERVAL = 100; // ~10fps — sufficient for ant-path visual
    function animate(timestamp: number) {
      if (!mapInstance.getLayer('route-lines-dash')) {
        // Layer not yet added — stop polling, setupAntPath will be re-called on map load
        return;
      }
      if (timestamp - lastTime >= FRAME_INTERVAL) {
        mapInstance.setPaintProperty('route-lines-dash', 'line-dasharray', dashArraySequence[step]);
        step = (step + 1) % dashArraySequence.length;
        lastTime = timestamp;
      }
      animationRef.current = requestAnimationFrame(animate);
    }
    animationRef.current = requestAnimationFrame(animate);
  }, []);

  // Clean up animation on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  // ── Setup terrain + fog on map load ─────────────────────────────────────
  const handleMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    mapLoadedRef.current = true;

    // Add terrain
    if (!map.getSource('mapbox-dem')) {
      map.addSource('mapbox-dem', {
        type: 'raster-dem',
        url: 'mapbox://mapbox.terrain-rgb',
        tileSize: 512,
        maxzoom: 14,
      });
    }
    map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });

    // Set fog based on theme
    map.setFog(isDark ? FOG_DARK : FOG_LIGHT);

    // Fit to route (geojson may already be loaded)
    fitToRoute();

    // Start ant-path animation
    setupAntPath();
  }, [isDark, setupAntPath, fitToRoute]);

  // ── Update fog when theme changes ───────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (map && map.isStyleLoaded()) {
      map.setFog(isDark ? FOG_DARK : FOG_LIGHT);
    }
  }, [isDark]);

  // ── Handle line click ───────────────────────────────────────────────────
  const handleLineClick = useCallback(
    (e: MapMouseEvent) => {
      const features = (e as MapMouseEvent & { features?: Array<{ properties?: Record<string, unknown> }> }).features;
      const lineFeature = features?.find((f) => f.properties?.segmentType);
      if (lineFeature?.properties) {
        const segId = lineFeature.properties.segmentId as string;
        setPopupInfo({
          longitude: e.lngLat.lng,
          latitude: e.lngLat.lat,
          properties: lineFeature.properties as PopupInfo['properties'],
        });
        onSegmentSelect?.(segId);
      }
    },
    [onSegmentSelect],
  );

  // ── Handle marker click ─────────────────────────────────────────────────
  const handleMarkerClick = useCallback(
    (feature: Feature) => {
      if (feature.geometry.type !== 'Point') return;
      const [lng, lat] = feature.geometry.coordinates as [number, number];
      const props = feature.properties as PopupInfo['properties'];
      setPopupInfo({ longitude: lng, latitude: lat, properties: props });
      onSegmentSelect?.(props?.segmentId as string);
    },
    [onSegmentSelect],
  );

  // ── Fit all button ──────────────────────────────────────────────────────
  const fitBounds = useCallback(() => {
    if (!geojson || !mapRef.current) return;
    const bounds = getBoundsFromGeoJSON(geojson);
    if (bounds) {
      mapRef.current.fitBounds(bounds, {
        padding: { top: 80, bottom: 40, left: 40, right: 40 },
        duration: 1000,
      });
    }
    setPopupInfo(null);
    onSegmentSelect?.(null);
  }, [geojson, onSegmentSelect]);

  // ── Loading state ───────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-background">
        <div className="space-y-4 w-64">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <p className="text-sm text-muted-foreground text-center mt-4">Loading route map...</p>
        </div>
      </div>
    );
  }

  if (!MAPBOX_TOKEN) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Mapbox token not configured. Set NEXT_PUBLIC_MAPBOX_TOKEN.</p>
      </div>
    );
  }

  return (
    <Map
      ref={mapRef}
      mapboxAccessToken={MAPBOX_TOKEN}
      initialViewState={{
        longitude: -98.5795,
        latitude: 39.8283,
        zoom: 4,
        pitch: 45,
      }}
      style={{ width: '100%', height: '100%' }}
      mapStyle={isDark ? MAP_STYLES.dark : MAP_STYLES.light}
      interactiveLayerIds={['route-lines', 'route-lines-dash']}
      onClick={(e: MapMouseEvent) => {
        const features = (
          e as MapMouseEvent & { features?: Array<{ layer?: { id?: string }; properties?: Record<string, unknown> }> }
        ).features;
        const lineFeature = features?.find((f) => f.layer?.id === 'route-lines' || f.layer?.id === 'route-lines-dash');
        if (lineFeature) {
          handleLineClick(e);
        } else {
          setPopupInfo(null);
          onSegmentSelect?.(null);
        }
      }}
      onLoad={handleMapLoad}
      cursor="pointer"
    >
      {/* ── Controls ─────────────────────────────────────────────────── */}
      <NavigationControl position="bottom-right" />
      <FullscreenControl position="top-right" />
      <ScaleControl position="bottom-left" maxWidth={100} unit="imperial" />

      {/* ── Fit Bounds Button ────────────────────────────────────────── */}
      <div className="absolute top-12 right-2.5 z-10">
        <Button
          variant="outline"
          size="icon"
          className="h-[29px] w-[29px] bg-background/80 backdrop-blur-sm border-border shadow-md"
          onClick={fitBounds}
          title="Fit route"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* ── Route Lines ──────────────────────────────────────────────── */}
      {lineFeatures && (
        <Source id="route-lines" type="geojson" data={lineFeatures}>
          {/* Solid base line */}
          <Layer
            id="route-lines"
            type="line"
            paint={{
              'line-color': [
                'match',
                ['get', 'segmentType'],
                'drive',
                SEGMENT_COLORS.drive,
                'rest',
                SEGMENT_COLORS.rest,
                'fuel',
                SEGMENT_COLORS.fuel,
                'dock',
                SEGMENT_COLORS.dock,
                'break',
                SEGMENT_COLORS.break,
                '#7c8aff',
              ],
              'line-width': 4,
              'line-opacity': 0.4,
            }}
            layout={{
              'line-cap': 'round',
              'line-join': 'round',
            }}
          />
          {/* Animated dash overlay (ant-path) */}
          <Layer
            id="route-lines-dash"
            type="line"
            paint={{
              'line-color': [
                'match',
                ['get', 'segmentType'],
                'drive',
                SEGMENT_COLORS.drive,
                'rest',
                SEGMENT_COLORS.rest,
                'fuel',
                SEGMENT_COLORS.fuel,
                'dock',
                SEGMENT_COLORS.dock,
                'break',
                SEGMENT_COLORS.break,
                '#7c8aff',
              ],
              'line-width': 4,
              'line-dasharray': [0, 4, 3],
            }}
            layout={{
              'line-cap': 'round',
              'line-join': 'round',
            }}
          />
        </Source>
      )}

      {/* ── Custom Markers ───────────────────────────────────────────── */}
      {pointFeatures.map((feature) => {
        if (feature.geometry.type !== 'Point') return null;
        const [lng, lat] = feature.geometry.coordinates as [number, number];
        const props = feature.properties ?? {};
        const segId = String(props.segmentId ?? '');

        return (
          <RouteMarker
            key={segId}
            longitude={lng}
            latitude={lat}
            segmentType={String(props.segmentType ?? 'break')}
            sequenceOrder={props.sequenceOrder != null ? Number(props.sequenceOrder) : undefined}
            actionType={props.actionType != null ? String(props.actionType) : undefined}
            isSelected={selectedSegmentId === segId}
            onClick={() => handleMarkerClick(feature)}
          />
        );
      })}

      {/* ── Popup ────────────────────────────────────────────────────── */}
      {popupInfo && (
        <Popup
          longitude={popupInfo.longitude}
          latitude={popupInfo.latitude}
          closeOnClick={false}
          onClose={() => {
            setPopupInfo(null);
            onSegmentSelect?.(null);
          }}
          anchor="bottom"
          offset={20}
          className="route-popup"
        >
          <SegmentPopup properties={popupInfo.properties} />
        </Popup>
      )}
    </Map>
  );
}

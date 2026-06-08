'use client';

import { Marker } from 'react-map-gl/mapbox';

const TYPE_STYLES = {
  origin: 'bg-blue-500 shadow-blue-500/40',
  destination: 'bg-emerald-500 shadow-emerald-500/40',
};

interface LoadMarkerProps {
  lat: number;
  lng: number;
  type: 'origin' | 'destination';
}

export function LoadMarker({ lat, lng, type }: LoadMarkerProps) {
  return (
    <Marker longitude={lng} latitude={lat} anchor="center">
      <div className={`w-3 h-3 rounded-full shadow-lg ${TYPE_STYLES[type]}`} />
    </Marker>
  );
}

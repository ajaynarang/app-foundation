'use client';

import { Marker } from 'react-map-gl/mapbox';
import type { MapTruckLocation } from '../../types';

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

interface TruckMarkerProps {
  truck: MapTruckLocation;
  isSelected: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export function TruckMarker({ truck, isSelected, onClick, onMouseEnter, onMouseLeave }: TruckMarkerProps) {
  return (
    <Marker
      longitude={truck.longitude}
      latitude={truck.latitude}
      anchor="center"
      onClick={(e) => {
        e.originalEvent.stopPropagation();
        onClick();
      }}
    >
      <div
        className="flex flex-col items-center cursor-pointer select-none"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {/* Truck dot with pulse for moving */}
        <div className="relative">
          {truck.status === 'moving' && (
            <span className={`absolute inset-0 rounded-full ${STATUS_COLORS[truck.status]} animate-ping opacity-40`} />
          )}
          <div
            className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-full border-2 ${
              isSelected ? 'border-white shadow-lg shadow-white/20 scale-125' : 'border-background shadow-md'
            } ${STATUS_COLORS[truck.status]} transition-transform`}
          >
            <span className="text-sm" role="img" aria-label="truck">
              🚛
            </span>
          </div>
        </div>

        {/* Driver name label */}
        <div className="mt-1 px-1.5 py-0.5 rounded bg-background/80 backdrop-blur-sm border border-border shadow-sm">
          <span className="text-2xs font-mono text-foreground leading-none whitespace-nowrap">
            {truck.driverName?.split(' ')[0] ?? 'Unassigned'}
          </span>
        </div>

        {/* HOS badge — hidden when no HOS data (no driver assigned) */}
        {truck.hosStatus !== 'none' && (
          <div
            className={`mt-0.5 px-1 py-px rounded-full text-[9px] font-semibold leading-tight ${HOS_COLORS[truck.hosStatus]}`}
          >
            {truck.hosDriveRemaining.toFixed(1)}h
          </div>
        )}
      </div>
    </Marker>
  );
}

'use client';

import { Marker } from 'react-map-gl/mapbox';
import { Moon, Fuel, Warehouse, PackageCheck, Coffee, MapPin, Flag } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface RouteMarkerProps {
  longitude: number;
  latitude: number;
  segmentType: string;
  sequenceOrder?: number;
  actionType?: string;
  isSelected?: boolean;
  onClick?: () => void;
}

// ─── Color + Icon mapping ───────────────────────────────────────────────────

const MARKER_CONFIG: Record<string, { icon: React.ElementType; bg: string; ring: string }> = {
  origin: { icon: MapPin, bg: 'bg-green-500', ring: 'ring-green-400/50' },
  destination: { icon: Flag, bg: 'bg-red-500', ring: 'ring-red-400/50' },
  dock: { icon: Warehouse, bg: 'bg-blue-500', ring: 'ring-blue-400/50' },
  'dock-pickup': { icon: PackageCheck, bg: 'bg-blue-500', ring: 'ring-blue-400/50' },
  rest: { icon: Moon, bg: 'bg-purple-500', ring: 'ring-purple-400/50' },
  fuel: { icon: Fuel, bg: 'bg-amber-500', ring: 'ring-amber-400/50' },
  break: { icon: Coffee, bg: 'bg-slate-500', ring: 'ring-slate-400/50' },
};

// ─── Component ──────────────────────────────────────────────────────────────

export function RouteMarker({
  longitude,
  latitude,
  segmentType,
  sequenceOrder,
  actionType,
  isSelected,
  onClick,
}: RouteMarkerProps) {
  let configKey = segmentType;
  if (segmentType === 'dock' && actionType?.toLowerCase().includes('pickup')) {
    configKey = 'dock-pickup';
  }
  const config = MARKER_CONFIG[configKey] ?? MARKER_CONFIG.break;
  const Icon = config.icon;

  const isPulse = segmentType === 'origin' || segmentType === 'destination';
  const showSequence = sequenceOrder != null && segmentType !== 'origin' && segmentType !== 'destination';

  return (
    <Marker
      longitude={longitude}
      latitude={latitude}
      anchor="center"
      onClick={(e) => {
        e.originalEvent.stopPropagation();
        onClick?.();
      }}
    >
      <div className="relative cursor-pointer group">
        {/* Pulse ring for origin/destination */}
        {isPulse && (
          <span
            className={`absolute inset-0 rounded-full ${config.bg} opacity-30 animate-ping`}
            style={{ animationDuration: '2s' }}
          />
        )}

        {/* Selected highlight ring */}
        {isSelected && <span className={`absolute -inset-1 rounded-full ring-2 ${config.ring} animate-pulse`} />}

        {/* Marker body */}
        <div
          className={`
            relative flex items-center justify-center
            w-8 h-8 rounded-full ${config.bg}
            shadow-lg shadow-black/30
            border-2 border-white/20
            transition-transform duration-200
            group-hover:scale-110
            ${isSelected ? 'scale-110' : ''}
          `}
        >
          <Icon className="h-4 w-4 text-white" />
        </div>

        {/* Sequence number badge */}
        {showSequence && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center w-4 h-4 rounded-full bg-background text-[9px] font-bold text-foreground border border-border shadow-sm">
            {sequenceOrder}
          </span>
        )}
      </div>
    </Marker>
  );
}

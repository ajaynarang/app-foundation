'use client';

import { Marker } from 'react-map-gl/mapbox';
import { Truck } from 'lucide-react';
import type { RiskBand } from '@sally/shared-types';
import { cn } from '@sally/ui';
import { RISK_BAND_LABELS } from '../../constants';
import type { MapTruckLocation } from '../../types';

interface TruckMarkerProps {
  truck: MapTruckLocation;
  band: RiskBand;
  isSelected: boolean;
  isStale: boolean;
  pendingCount?: number;
  onClick: () => void;
}

/**
 * Risk-coded truck marker. A filled pin carries a truck glyph; its fill is
 * driven by RiskBand (not status/HOS, which are subsumed). At-risk and
 * critical markers are enlarged and ringed — critical also pulses — so the
 * dispatcher's eye lands on the trouble first. The `aria-label` spells out
 * the band so color is never the only signal. Stale markers render dimmed.
 */

/** Per-band fill, ring halo, size and z-order — louder as risk climbs. */
const BAND_STYLE: Record<RiskBand, { fill: string; halo: string; size: string; z: string }> = {
  'on-track': {
    fill: 'bg-muted-foreground',
    halo: 'ring-background/70',
    size: 'h-7 w-7',
    z: 'z-[1]',
  },
  'at-risk': {
    fill: 'bg-yellow-500',
    halo: 'ring-yellow-500/35',
    size: 'h-8 w-8',
    z: 'z-[2]',
  },
  critical: {
    fill: 'bg-red-500',
    halo: 'ring-red-500/40',
    size: 'h-9 w-9',
    z: 'z-[3]',
  },
};

export function TruckMarker({ truck, band, isSelected, isStale, pendingCount, onClick }: TruckMarkerProps) {
  const style = BAND_STYLE[band];
  const bandLabel = RISK_BAND_LABELS[band].toLowerCase();
  const isAlert = band !== 'on-track';
  const ariaLabel = [
    truck.driverName,
    bandLabel,
    pendingCount != null && pendingCount > 0 ? `${pendingCount} pending` : null,
    isStale ? 'position stale' : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Marker longitude={truck.longitude} latitude={truck.latitude} anchor="center">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-pressed={isSelected}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className={cn(
          'relative flex items-center justify-center select-none rounded-full',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-foreground',
          style.z,
          isStale && 'opacity-40 grayscale',
        )}
      >
        {/* Pulse halo — critical only, draws the eye to the worst trucks. */}
        {band === 'critical' && !isStale && (
          <span
            aria-hidden
            className="absolute inset-0 -m-1 animate-ping rounded-full bg-red-500/40 motion-reduce:hidden"
          />
        )}
        <span
          aria-hidden
          className={cn(
            'relative flex items-center justify-center rounded-full text-white shadow-md',
            'ring-2 ring-offset-2 ring-offset-transparent',
            'transition-transform motion-reduce:transition-none',
            style.size,
            style.fill,
            style.halo,
            isAlert && 'shadow-lg',
            isSelected && 'scale-125 ring-foreground',
          )}
        >
          <Truck className={cn(band === 'on-track' ? 'h-3.5 w-3.5' : 'h-4 w-4')} aria-hidden />
        </span>
        {pendingCount != null && pendingCount > 0 && (
          <span
            aria-hidden
            className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full border border-background bg-red-500 px-1 text-[9px] font-bold text-white"
          >
            {pendingCount}
          </span>
        )}
      </button>
    </Marker>
  );
}

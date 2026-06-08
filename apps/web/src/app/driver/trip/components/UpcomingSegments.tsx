'use client';

import { Car, Clock, Coffee, Fuel, MapPin, Moon, Package } from 'lucide-react';

import { getSegmentColor, formatETA } from '../lib/route-state';
import { formatDurationHours } from '@/shared/lib/format-time';
import { WeatherBadge } from '@/features/routing/route-planning/components/WeatherBadge';
import type { RouteSegment } from '@/features/routing/route-planning';

// ─── Segment type icons ────────────────────────────────────────────────────────

const SEGMENT_ICONS: Record<string, React.ElementType> = {
  drive: Car,
  rest: Moon,
  fuel: Fuel,
  dock: MapPin,
  break: Coffee,
};

function getDockIcon(segment: RouteSegment): React.ElementType {
  if (segment.actionType === 'delivery') return Package;
  return MapPin;
}

// ─── Props ─────────────────────────────────────────────────────────────────────

interface UpcomingSegmentsProps {
  segments: RouteSegment[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getSegmentName(seg: RouteSegment): string {
  switch (seg.segmentType) {
    case 'drive':
      return seg.toLocation || 'Drive';
    case 'dock': {
      const action = seg.actionType === 'pickup' ? 'Pickup' : seg.actionType === 'delivery' ? 'Delivery' : 'Stop';
      return seg.customerName ? `${action} — ${seg.customerName}` : action;
    }
    case 'fuel':
      return seg.fuelStationName || 'Fuel Stop';
    case 'break':
      return `${Math.round((seg.restDurationHours ?? 0.5) * 60)}-min Break`;
    case 'rest': {
      const dur = seg.restDurationHours ?? 10;
      return `${Math.round(dur)}h ${seg.restType === 'split_8_2' ? 'Split 8/2' : seg.restType === 'split_7_3' ? 'Split 7/3' : 'Sleeper'} Rest`;
    }
    default:
      return seg.toLocation || 'Next';
  }
}

function getSegmentDetail(seg: RouteSegment): string {
  switch (seg.segmentType) {
    case 'drive':
      return (
        [
          seg.distanceMiles ? `${Math.round(seg.distanceMiles)} mi` : null,
          seg.driveTimeHours ? formatDurationHours(seg.driveTimeHours) : null,
        ]
          .filter(Boolean)
          .join(' · ') || ''
      );
    case 'dock':
      return seg.toLocation || '';
    case 'fuel':
      return (
        [seg.toLocation, seg.detourMiles ? `${seg.detourMiles.toFixed(1)} mi detour` : null]
          .filter(Boolean)
          .join(' · ') || ''
      );
    case 'break':
      return seg.restReason || 'HOS compliance';
    case 'rest':
      return seg.toLocation || '';
    default:
      return '';
  }
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function UpcomingSegments({ segments }: UpcomingSegmentsProps) {
  if (!segments.length) return null;

  return (
    <div className="space-y-1">
      <p className="text-2xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">Coming Up</p>

      <div className="space-y-1.5">
        {segments.map((seg) => {
          const isDock = seg.segmentType === 'dock';
          const isDelivery = isDock && seg.actionType === 'delivery';
          const color = isDock ? (isDelivery ? '#f87171' : '#4ade80') : getSegmentColor(seg.segmentType);
          const Icon = isDock ? getDockIcon(seg) : (SEGMENT_ICONS[seg.segmentType] ?? Clock);
          const name = getSegmentName(seg);
          const detail = getSegmentDetail(seg);

          return (
            <div
              key={seg.segmentId}
              className="flex items-center gap-3 rounded-lg border border-border/50 bg-card/50 px-3 py-2.5 hover:bg-card/80 transition-colors"
            >
              {/* Icon */}
              <div
                className="h-8 w-8 rounded-[8px] flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: `${color}12`,
                  border: `1.5px solid ${color}30`,
                }}
              >
                <Icon className="h-4 w-4" style={{ color }} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-medium text-foreground truncate">{name}</p>
                  {/* Weather badge on drive segments */}
                  {seg.segmentType === 'drive' && seg.weatherAlerts && (
                    <WeatherBadge weatherAlerts={seg.weatherAlerts} compact />
                  )}
                </div>
                {detail && <p className="text-2xs text-muted-foreground truncate">{detail}</p>}
              </div>

              {/* ETA */}
              {seg.estimatedArrival && (
                <span className="text-2xs text-muted-foreground shrink-0 tabular-nums">
                  {formatETA(seg.estimatedArrival)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

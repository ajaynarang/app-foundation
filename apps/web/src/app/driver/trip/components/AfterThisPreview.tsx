'use client';

import { Clock, Car, Moon, Fuel, MapPin, Coffee } from 'lucide-react';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { getSegmentColor, formatDuration } from '../lib/route-state';
import type { RouteSegment } from '@/features/routing/route-planning';
import type { LoadStop } from '@/features/fleet/loads/types';

// Icon map — mirrors RouteSegmentCard
const SEGMENT_ICONS: Record<string, React.ElementType> = {
  drive: Car,
  rest: Moon,
  fuel: Fuel,
  dock: MapPin,
  break: Coffee,
};

function segmentLabel(seg: RouteSegment): string {
  switch (seg.segmentType) {
    case 'drive':
      return `Drive ${Math.round(seg.distanceMiles ?? 0)} mi`;
    case 'rest':
      return `Rest ${seg.restDurationHours ? formatDuration(seg.restDurationHours) : '10h'}`;
    case 'fuel':
      return `Fuel ~${seg.fuelGallons != null ? Math.round(seg.fuelGallons) : '—'} gal`;
    case 'dock': {
      const action = seg.actionType === 'pickup' ? 'Pickup' : seg.actionType === 'delivery' ? 'Delivery' : 'Stop';
      return `${action}${seg.customerName ? ` — ${seg.customerName}` : ''}`;
    }
    case 'break':
      return `Break ${seg.restDurationHours ? formatDuration(seg.restDurationHours) : '30min'}`;
    default:
      return seg.toLocation || 'Next';
  }
}

interface Props {
  segments?: RouteSegment[];
  nextStop?: LoadStop;
  currentSegmentIndex?: number;
}

export function AfterThisPreview({ segments, nextStop, currentSegmentIndex }: Props) {
  // Smart route: show next 1-2 segments after current
  if (segments && segments.length > 0) {
    const sorted = [...segments].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
    const startIdx = currentSegmentIndex != null ? currentSegmentIndex + 1 : 0;
    const upcomingSegments = sorted.slice(startIdx, startIdx + 2);

    if (upcomingSegments.length === 0) return null;

    return (
      <Card className="border-border">
        <CardContent className="p-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">After This</p>
          <div className="flex items-center gap-2 flex-wrap">
            {upcomingSegments.map((seg, i) => {
              const color = getSegmentColor(seg.segmentType);
              const Icon = SEGMENT_ICONS[seg.segmentType] ?? Clock;
              const label = segmentLabel(seg);
              return (
                <div key={seg.segmentId} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-muted-foreground text-xs">→ then</span>}
                  {i === 0 && <span className="text-muted-foreground text-xs">→</span>}
                  <div
                    className="h-5 w-5 rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${color}20` }}
                  >
                    <Icon className="h-3 w-3" style={{ color }} />
                  </div>
                  <span className="text-sm text-foreground">{label}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Manual route: show next stop
  if (nextStop) {
    const actionLabel =
      nextStop.actionType === 'pickup' ? 'Pickup' : nextStop.actionType === 'delivery' ? 'Delivery' : 'Stop';

    return (
      <Card className="border-border">
        <CardContent className="p-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">After This</p>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs">→</span>
            <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center shrink-0">
              <MapPin className="h-3 w-3 text-muted-foreground" />
            </div>
            <span className="text-sm text-foreground truncate">
              {actionLabel}
              {nextStop.stopName ? ` — ${nextStop.stopName}` : ''}
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}

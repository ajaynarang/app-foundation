'use client';

import { Truck } from 'lucide-react';
import { Badge } from '@sally/ui/components/ui/badge';
import { Button } from '@sally/ui/components/ui/button';
import { cn } from '@sally/ui';
import type { DriverRecommendation } from '../types';
import { formatHOSHours } from '@/shared/lib/format-time';

interface Props {
  driver: DriverRecommendation;
  selected: boolean;
  onSelect: () => void;
}

// Status indicator colors — green/yellow/red are acceptable per project conventions
// for status-only indicators (HOS remaining is a traffic-light pattern).
// These classes intentionally omit dark variants because -500 shades are
// readable on both light and dark backgrounds.
function hosColor(hours: number): string {
  if (hours >= 4) return 'text-green-500';
  if (hours >= 2) return 'text-yellow-500';
  return 'text-red-500';
}

export function DriverRecommendationCard({ driver, selected, onSelect }: Props) {
  const hosHours = driver.hos.driveHoursRemaining;
  const availability = driver.availability;

  const locationStr = driver.proximity.lastKnownLocation;
  const hasLocation = locationStr && locationStr !== 'Unknown';

  const availabilityLine =
    availability.status === 'available'
      ? hasLocation
        ? `Available now · Last delivered in ${locationStr}`
        : 'Available now'
      : `Delivering Load #${availability.currentLoadNumber}${availability.currentLoadEta ? ` · ETA ${availability.currentLoadEta}` : hasLocation ? ` · Near ${locationStr}` : ''}`;

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onSelect}
      className={cn(
        'w-full text-left rounded-lg border p-3 h-auto justify-start transition-colors',
        'hover:bg-gray-100 dark:hover:bg-gray-800',
        selected ? 'border-accent bg-accent/5 dark:bg-accent/10' : 'border-border bg-card',
      )}
    >
      <div className="flex items-start gap-3">
        {/* Radio indicator */}
        <div className="mt-0.5 flex-shrink-0">
          <div
            className={cn(
              'h-4 w-4 rounded-full border-2 flex items-center justify-center',
              selected ? 'border-foreground' : 'border-gray-400 dark:border-gray-500',
            )}
          >
            {selected && <div className="h-2 w-2 rounded-full bg-foreground" />}
          </div>
        </div>

        {/* Avatar */}
        <div className="flex-shrink-0 h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-semibold text-foreground">
          {driver.initials}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Name row */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-sm text-foreground truncate">{driver.name}</span>
            {driver.isBestMatch && (
              <Badge className="text-2xs px-1.5 py-0 h-4 bg-accent/15 text-accent border-accent/20 font-normal">
                Best match
              </Badge>
            )}
            {driver.equipmentType && (
              <Badge
                variant="outline"
                className={cn(
                  'text-2xs px-1.5 py-0 h-4 font-normal',
                  driver.equipmentMatch ? 'border-green-500/30 text-green-500' : 'border-red-500/30 text-red-500',
                )}
              >
                <Truck className="h-2.5 w-2.5 mr-0.5" />
                {driver.equipmentType} {driver.equipmentMatch ? '✓' : '✗'}
              </Badge>
            )}
          </div>

          {/* Rationale */}
          <p className="text-[11px] italic text-muted-foreground mt-0.5 leading-tight">{driver.matchRationale}</p>

          {/* Stats row */}
          <div className="flex flex-wrap gap-3 mt-1.5 text-[11px]">
            <span>
              <span className={cn('font-medium', hosColor(hosHours))}>HOS {formatHOSHours(hosHours)}</span>
            </span>
            <span className="text-muted-foreground">
              {driver.proximity.distanceMilesFromPickup.toLocaleString(undefined, { maximumFractionDigits: 0 })} mi away
            </span>
            {driver.activeLoadCount > 0 && (
              <span className="text-muted-foreground">
                {driver.activeLoadCount} active {driver.activeLoadCount === 1 ? 'load' : 'loads'}
              </span>
            )}
          </div>

          {/* Availability */}
          <p className="text-[11px] text-muted-foreground mt-0.5">{availabilityLine}</p>
        </div>
      </div>
    </Button>
  );
}

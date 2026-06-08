'use client';

import { Button } from '@sally/ui/components/ui/button';
import { Layers } from 'lucide-react';
import { getTripColor } from '../utils';

interface TripContextBarProps {
  tripId: string;
  tripOrder?: number | null;
  tripLoadCount?: number | null;
  onViewTrip: () => void;
}

export function TripContextBar({ tripId, tripOrder, tripLoadCount, onViewTrip }: TripContextBarProps) {
  const color = getTripColor(tripId);
  const shortId = tripId.replace('TRIP-', '');

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-muted/50 dark:bg-gray-900/50 text-xs"
      style={{ borderLeftWidth: 3, borderLeftColor: color }}
    >
      <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground">Part of</span>
      <span className="font-mono font-medium text-foreground">{shortId}</span>
      {tripOrder != null && tripLoadCount != null && (
        <span className="text-muted-foreground">
          · {tripOrder} of {tripLoadCount}
        </span>
      )}
      <div className="flex-1" />
      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onViewTrip}>
        View Trip
      </Button>
    </div>
  );
}

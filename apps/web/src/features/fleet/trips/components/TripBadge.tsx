'use client';

import { cn } from '@/shared/lib/utils';
import { Badge } from '@sally/ui/components/ui/badge';
import { getTripColor } from '../utils';

interface TripBadgeProps {
  tripId: string;
  tripOrder?: number | null;
  tripLoadCount?: number | null;
  size?: 'sm' | 'md';
  onClick?: (e: React.MouseEvent) => void;
}

export function TripBadge({ tripId, tripOrder, tripLoadCount, size = 'md', onClick }: TripBadgeProps) {
  const color = getTripColor(tripId);
  const shortId = tripId.replace('TRIP-', '');

  return (
    <Badge
      variant="outline"
      onClick={onClick}
      className={cn(
        'cursor-pointer hover:bg-muted dark:hover:bg-gray-800',
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs',
      )}
      style={{ borderLeftColor: color, borderLeftWidth: 3 }}
    >
      <span className="font-semibold">{shortId}</span>
      {tripOrder != null && tripLoadCount != null && (
        <span className="text-muted-foreground ml-1">
          · {tripOrder} of {tripLoadCount}
        </span>
      )}
    </Badge>
  );
}

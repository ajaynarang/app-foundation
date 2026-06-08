'use client';

import { Progress } from '@sally/ui/components/ui/progress';
import { Skeleton } from '@sally/ui/components/ui/skeleton';

interface RouteProgressProps {
  loadNumber?: string;
  originCity?: string;
  originState?: string;
  destinationCity?: string;
  destinationState?: string;
  completedStops: number;
  totalStops: number;
  isLoading?: boolean;
}

export function RouteProgressSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-4 w-56" />
      <Skeleton className="h-2 w-full" />
    </div>
  );
}

export function RouteProgress({
  loadNumber,
  originCity,
  originState,
  destinationCity,
  destinationState,
  completedStops,
  totalStops,
  isLoading,
}: RouteProgressProps) {
  if (isLoading) return <RouteProgressSkeleton />;

  const percentage = totalStops > 0 ? Math.round((completedStops / totalStops) * 100) : 0;
  const origin = [originCity, originState].filter(Boolean).join(', ');
  const destination = [destinationCity, destinationState].filter(Boolean).join(', ');

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-foreground">Load {loadNumber}</h2>
      {(origin || destination) && (
        <p className="text-xs text-muted-foreground">
          {origin || '—'} → {destination || '—'}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Progress value={percentage} className="h-2 flex-1" />
        <span className="text-xs text-muted-foreground shrink-0">{percentage}%</span>
      </div>
    </div>
  );
}

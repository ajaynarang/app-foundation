'use client';

import { Route } from 'lucide-react';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { formatDistance, formatDuration } from '@/shared/lib/utils/formatters';

interface LoadRouteSummaryChipProps {
  totalMiles: number | null | undefined;
  estimatedDriveHours: number | null | undefined;
  mileageProvider: string | null | undefined;
}

/**
 * System-computed route mileage on the load detail. Renders a skeleton while the
 * async HERE Routing job is still running (mileage fields null on first fetch),
 * then live-updates via the loads query invalidation on `load:mileage-calculated`.
 */
export function LoadRouteSummaryChip({ totalMiles, estimatedDriveHours, mileageProvider }: LoadRouteSummaryChipProps) {
  const hasMileage = totalMiles != null && estimatedDriveHours != null;

  if (!hasMileage) {
    return (
      <div className="mt-2 flex items-center gap-2">
        <Route className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <Skeleton className="h-3.5 w-40" />
        <span className="text-2xs text-muted-foreground">calculating route…</span>
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
      <Route className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
      <span className="text-xs font-medium text-foreground tabular-nums">{formatDistance(totalMiles)}</span>
      <span className="text-2xs text-muted-foreground">·</span>
      <span className="text-xs text-muted-foreground tabular-nums">~{formatDuration(estimatedDriveHours)} drive</span>
      {mileageProvider && <span className="text-2xs text-muted-foreground">· via {mileageProvider.toUpperCase()}</span>}
    </div>
  );
}

'use client';

import { Skeleton } from '@sally/ui/components/ui/skeleton';

/**
 * Skeleton that matches the DriverLane footprint. Same heights so the layout
 * doesn't shift when data loads.
 */
export function DriverLaneSkeleton() {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-8 rounded-full" />
        <div className="flex-1">
          <Skeleton className="h-3.5 w-40" />
        </div>
      </div>
      {/* Headline load — identity line + next-stop line */}
      <div className="mt-2 space-y-1 pl-10">
        <Skeleton className="h-3 w-44" />
        <Skeleton className="h-3 w-28" />
      </div>
      <Skeleton className="mt-3 h-3 w-full rounded" />
      <Skeleton className="mt-1 h-2 w-full opacity-50" />
      <div className="mt-2 flex items-center gap-2">
        <Skeleton className="h-3 w-6" />
        <Skeleton className="h-1.5 w-32 rounded-full" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  );
}

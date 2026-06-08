'use client';

import { Skeleton } from '@/shared/components/ui/skeleton';
import { cn } from '@/shared/lib/utils';

export interface PageLoadingSkeletonProps {
  variant: 'table' | 'board' | 'cards';
  /** rows (table), columns (board), or card count (cards). Defaults: 5 / 4 / 4. */
  rows?: number;
  className?: string;
}

/**
 * PageLoadingSkeleton — shaped placeholder for the data zone while loading. Matches the
 * shape of the eventual content (NOT a spinner). See sally-frontend-patterns §16.
 */
export function PageLoadingSkeleton({ variant, rows, className }: PageLoadingSkeletonProps) {
  if (variant === 'table') {
    const count = rows ?? 5;
    return (
      <div className={cn('space-y-3', className)}>
        {Array.from({ length: count }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (variant === 'cards') {
    const count = rows ?? 4;
    return (
      <div className={cn('grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4', className)}>
        {Array.from({ length: count }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    );
  }

  // board
  const columns = rows ?? 4;
  return (
    <div className={cn('grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4', className)}>
      {Array.from({ length: columns }).map((_, i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ))}
    </div>
  );
}

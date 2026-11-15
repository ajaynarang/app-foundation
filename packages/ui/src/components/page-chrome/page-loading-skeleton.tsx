'use client';

import { Skeleton } from '../ui/skeleton';
import { cn } from '../../lib/utils';

export interface PageLoadingSkeletonProps {
  variant: 'table' | 'board' | 'cards' | 'form';
  /** rows (table), columns (board), card count (cards) or fields (form). Defaults: 5 / 4 / 4 / 4. */
  rows?: number;
  className?: string;
}

/**
 * PageLoadingSkeleton — shaped placeholder for the data zone while loading. Matches the
 * shape of the eventual content (NOT a spinner).
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

  if (variant === 'form') {
    // A settings form: one label + one control per field, in a card.
    const fields = rows ?? 4;
    return (
      <div className={cn('space-y-5 rounded-lg border border-border bg-card p-6', className)}>
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-full" />
          </div>
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

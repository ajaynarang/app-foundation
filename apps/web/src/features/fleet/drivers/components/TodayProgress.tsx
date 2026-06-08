'use client';

import { Progress } from '@sally/ui/components/ui/progress';
import { Skeleton } from '@sally/ui/components/ui/skeleton';

interface TodayProgressProps {
  completedStops: number;
  totalStops: number;
  rateCents?: number;
  isLoading?: boolean;
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

export function TodayProgressSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-2 w-full" />
      <Skeleton className="h-4 w-16" />
    </div>
  );
}

export function TodayProgress({ completedStops, totalStops, rateCents, isLoading }: TodayProgressProps) {
  if (isLoading) return <TodayProgressSkeleton />;

  const percentage = totalStops > 0 ? Math.round((completedStops / totalStops) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">
          {completedStops} of {totalStops} stops
        </span>
        <span className="text-xs text-muted-foreground">{percentage}%</span>
      </div>
      <Progress value={percentage} className="h-2" />
      {rateCents != null && rateCents > 0 && (
        <p className="text-sm text-muted-foreground">Load pay: {formatCurrency(rateCents)}</p>
      )}
    </div>
  );
}

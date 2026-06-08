'use client';

import { Button } from '@sally/ui/components/ui/button';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { XCircle, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { CATEGORY_DISPLAY_NAMES, TYPE_DISPLAY_NAMES } from '../types';
import type { Job } from '../types';

interface RecentFailuresProps {
  failures: Job[] | undefined;
  isLoading: boolean;
  onRetry: (jobId: number) => void;
  isRetrying: boolean;
  /** Job ID currently being retried, for per-button disable state */
  retryingJobId?: number;
  /** Optional callback to open job detail sheet */
  onJobClick?: (job: Job) => void;
}

export function RecentFailures({
  failures,
  isLoading,
  onRetry,
  isRetrying,
  retryingJobId,
  onJobClick,
}: RecentFailuresProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (!failures?.length) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-foreground">Recent Failures ({failures.length})</h3>
      <div className="space-y-2">
        {failures.map((job) => (
          <div
            key={job.id}
            className="flex items-center justify-between rounded-lg border border-border p-3 bg-card cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => onJobClick?.(job)}
          >
            <div className="flex items-center gap-3 min-w-0">
              <XCircle className="h-4 w-4 text-critical shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {CATEGORY_DISPLAY_NAMES[job.category] ?? job.category}{' '}
                  <span className="text-muted-foreground font-normal">
                    &middot; {TYPE_DISPLAY_NAMES[job.type] ?? job.type}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {job.errorMessage ?? 'Unknown error'} &middot;{' '}
                  {formatDistanceToNow(new Date(job.completedAt ?? job.createdAt), { addSuffix: true })}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onRetry(job.id);
              }}
              loading={isRetrying && retryingJobId === job.id}
              className="shrink-0 ml-2"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span className="ml-1.5">Retry</span>
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

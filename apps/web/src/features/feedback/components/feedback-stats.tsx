'use client';

import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import type { FeedbackStats as Stats } from '../types';

interface FeedbackStatsProps {
  stats?: Stats;
  isLoading: boolean;
}

const STAT_ITEMS = [
  { key: 'total', label: 'Total' },
  { key: 'new', label: 'New' },
  { key: 'reviewed', label: 'Reviewed' },
  { key: 'resolved', label: 'Resolved' },
] as const;

export function FeedbackStats({ stats, isLoading }: FeedbackStatsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {STAT_ITEMS.map(({ key, label }) => (
        <Card key={key} className="border-border">
          <CardContent className="p-4">
            {isLoading ? (
              <>
                <Skeleton className="h-10 w-16 mb-1" />
                <Skeleton className="h-4 w-12" />
              </>
            ) : (
              <>
                <p className="text-4xl font-mono font-semibold text-foreground tabular-nums">{stats?.[key] ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">{label}</p>
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

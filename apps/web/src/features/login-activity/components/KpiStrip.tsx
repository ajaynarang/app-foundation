'use client';

import { Card } from '@sally/ui/components/ui/card';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import type { LoginActivitySummary } from '../types';

interface KpiStripProps {
  summary?: LoginActivitySummary;
  isLoading: boolean;
}

/**
 * 4-tile KPI strip. Failed-delta turns red when > +20% — the threshold flagged
 * as "notable" in the design doc. Loading state renders shaped Skeletons (never
 * a spinner or null).
 */
export function KpiStrip({ summary, isLoading }: KpiStripProps) {
  if (isLoading || !summary) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  const { kpis } = summary;
  const failedAlert = kpis.failedDeltaPct > 20;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Total sign-ins</p>
        <p className="text-3xl font-semibold text-foreground mt-1">{kpis.totalSignIns}</p>
      </Card>
      <Card className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Failed attempts</p>
        <div className="flex items-baseline gap-2 mt-1">
          <p className="text-3xl font-semibold text-foreground">{kpis.failedAttempts}</p>
          {kpis.failedDeltaPct !== 0 && (
            <span className={failedAlert ? 'text-sm text-red-500 dark:text-red-400' : 'text-sm text-muted-foreground'}>
              {kpis.failedDeltaPct > 0 ? '+' : ''}
              {kpis.failedDeltaPct}%
            </span>
          )}
        </div>
      </Card>
      <Card className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Unique users</p>
        <p className="text-3xl font-semibold text-foreground mt-1">{kpis.uniqueUsers}</p>
      </Card>
      <Card className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Unique IPs</p>
        <p className="text-3xl font-semibold text-foreground mt-1">{kpis.uniqueIps}</p>
      </Card>
    </div>
  );
}

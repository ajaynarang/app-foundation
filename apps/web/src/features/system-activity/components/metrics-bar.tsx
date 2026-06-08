'use client';

import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import type { JobMetrics } from '../types';
import { formatDuration } from '../utils';

interface MetricsBarProps {
  metrics: JobMetrics | undefined;
  isLoading: boolean;
}

export function MetricsBar({ metrics, isLoading }: MetricsBarProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    );
  }

  if (!metrics) return null;

  const items = [
    { label: 'Total Jobs Today', value: metrics.totalToday.toString() },
    { label: 'Success Rate', value: `${metrics.successRate}%` },
    {
      label: 'Failed',
      value: metrics.failedCount.toString(),
      highlight: metrics.failedCount > 0,
    },
    { label: 'Avg Duration', value: formatDuration(metrics.avgDurationMs) },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {items.map((item) => (
        <Card key={item.label}>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{item.label}</p>
            <p className={`text-2xl font-bold mt-1 ${item.highlight ? 'text-critical' : 'text-foreground'}`}>
              {item.value}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

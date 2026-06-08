'use client';

import { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { useEventVolume, useEventStats } from '../use-admin-events';
import type { EventVolumePoint, EventStatsEntry } from '../api';

// Muted color palette that works across light and dark themes
const COLORS = [
  'hsl(var(--foreground))',
  'hsl(210 40% 60%)',
  'hsl(210 40% 45%)',
  'hsl(0 60% 55%)',
  'hsl(45 70% 55%)',
  'hsl(210 20% 50%)',
];

interface ChartDataPoint {
  hour: string;
  [eventName: string]: string | number;
}

const tooltipStyle = {
  background: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 6,
  color: 'hsl(var(--foreground))',
  fontSize: 12,
};

export function EventVolumeChart() {
  const { data: volumeData, isLoading: volumeLoading } = useEventVolume();
  const { data: statsData, isLoading: statsLoading } = useEventStats();

  const isLoading = volumeLoading || statsLoading;

  // Transform volume data: pivot from array of { hour, event, count } to { hour, event1: count, event2: count }
  const { chartData, eventNames } = useMemo(() => {
    if (!volumeData || volumeData.length === 0) {
      return { chartData: [] as ChartDataPoint[], eventNames: [] as string[] };
    }

    const namesSet = new Set<string>();
    const hourMap = new Map<string, ChartDataPoint>();

    for (const point of volumeData) {
      namesSet.add(point.event);
      if (!hourMap.has(point.hour)) {
        hourMap.set(point.hour, { hour: point.hour });
      }
      const entry = hourMap.get(point.hour)!;
      entry[point.event] = point.count;
    }

    const names = Array.from(namesSet);
    const sorted = Array.from(hourMap.values()).sort((a, b) => new Date(a.hour).getTime() - new Date(b.hour).getTime());

    return { chartData: sorted, eventNames: names };
  }, [volumeData]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-[300px] w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Bar Chart */}
      {chartData.length > 0 ? (
        <Card>
          <CardContent className="p-4 md:p-6">
            <p className="text-sm font-medium text-foreground mb-4">Events per hour (last 24h)</p>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="hour"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(v: string) => {
                    const d = new Date(v);
                    return `${d.getHours().toString().padStart(2, '0')}:00`;
                  }}
                />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <RechartsTooltip contentStyle={tooltipStyle} />
                <Legend />
                {eventNames.slice(0, 6).map((name, i) => (
                  <Bar
                    key={name}
                    dataKey={name}
                    stackId="events"
                    fill={COLORS[i % COLORS.length]}
                    radius={i === eventNames.length - 1 || i === 5 ? [2, 2, 0, 0] : undefined}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-6 flex items-center justify-center h-[300px]">
            <p className="text-sm text-muted-foreground">No volume data available</p>
          </CardContent>
        </Card>
      )}

      {/* Stats summary table */}
      {statsData && statsData.length > 0 && (
        <Card>
          <CardContent className="p-4 md:p-6">
            <p className="text-sm font-medium text-foreground mb-3">Event type totals</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {statsData.map((stat: EventStatsEntry) => (
                <div key={stat.event} className="flex items-center justify-between rounded-md border border-border p-3">
                  <span className="text-xs font-mono text-muted-foreground truncate mr-2">{stat.event}</span>
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {stat.count.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

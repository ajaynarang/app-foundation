'use client';

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
} from 'recharts';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import type { TimeSeriesPoint } from '../types';

interface ReportChartProps {
  data?: TimeSeriesPoint[];
  type?: 'area' | 'bar';
  isLoading?: boolean;
}

const tooltipStyle = {
  background: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 6,
  color: 'hsl(var(--foreground))',
  fontSize: 12,
};

export function ReportChart({ data, type = 'area', isLoading }: ReportChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4 md:p-6">
          <Skeleton className="h-[300px] w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center h-[300px]">
          <p className="text-sm text-muted-foreground">No chart data available</p>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map((d) => ({
    period: d.label ?? d.period,
    value: d.value,
  }));

  return (
    <Card>
      <CardContent className="p-4 md:p-6">
        <ResponsiveContainer width="100%" height={300}>
          {type === 'area' ? (
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="currentColor" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="currentColor" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="period"
                tick={{ fontSize: 11 }}
                stroke="hsl(var(--muted-foreground))"
                tickLine={false}
                axisLine={false}
              />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
              <RechartsTooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="value" stroke="currentColor" fill="url(#chartGrad)" strokeWidth={2} />
            </AreaChart>
          ) : (
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="period"
                tick={{ fontSize: 11 }}
                stroke="hsl(var(--muted-foreground))"
                tickLine={false}
                axisLine={false}
              />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
              <RechartsTooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" fill="currentColor" opacity={0.8} radius={[4, 4, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

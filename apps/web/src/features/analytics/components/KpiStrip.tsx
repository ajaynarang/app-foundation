'use client';

import { DollarSign, TrendingUp, Clock, Truck, Receipt } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@sally/ui/components/ui/card';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { useKpiDashboard } from '../hooks/use-analytics';

const KPI_CARDS = [
  {
    key: 'todayRevenue' as const,
    label: 'Today Revenue',
    icon: DollarSign,
    format: 'currency' as const,
    field: 'todayRevenueCents' as const,
  },
  {
    key: 'mtdRevenue' as const,
    label: 'MTD Revenue',
    icon: TrendingUp,
    format: 'currency' as const,
    field: 'mtdRevenueCents' as const,
  },
  {
    key: 'onTime' as const,
    label: 'On-Time %',
    icon: Clock,
    format: 'percent' as const,
    field: 'onTimePercent' as const,
  },
  {
    key: 'fleetUtil' as const,
    label: 'Fleet Utilization',
    icon: Truck,
    format: 'percent' as const,
    field: 'fleetUtilizationPercent' as const,
  },
  {
    key: 'arOutstanding' as const,
    label: 'AR Outstanding',
    icon: Receipt,
    format: 'currency' as const,
    field: 'arOutstandingCents' as const,
  },
];

export function KpiStrip() {
  const { data, isLoading } = useKpiDashboard();
  const { formatCents } = useFormatters();

  function formatValue(format: 'currency' | 'number' | 'percent', raw: number | undefined): string {
    if (raw === undefined || raw === null) return '--';
    switch (format) {
      case 'currency':
        return formatCents(raw);
      case 'percent':
        return `${raw.toFixed(1)}%`;
      case 'number':
        return raw.toLocaleString();
    }
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
      {KPI_CARDS.map((kpi) => {
        const Icon = kpi.icon;
        const rawValue = data?.[kpi.field];

        return (
          <Card key={kpi.key}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.label}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold text-foreground">{formatValue(kpi.format, rawValue)}</div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

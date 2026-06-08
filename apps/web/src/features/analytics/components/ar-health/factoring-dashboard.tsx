'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@sally/ui/components/ui/card';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { TrendingUp, DollarSign, Clock, AlertTriangle, FileBarChart, Briefcase } from 'lucide-react';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { useFactoringSummary } from '@/features/financials/billing/hooks/use-factoring-transactions';

/**
 * Phase 4C — factoring dashboard. 6 metric tiles for the YTD-funded view.
 * Renders nothing when no factoring activity (totalSubmittedCount === 0).
 */
export function FactoringDashboard() {
  const { formatCents } = useFormatters();
  const { data, isLoading } = useFactoringSummary();

  if (isLoading) {
    return <Skeleton className="h-32 w-full" />;
  }
  if (!data || data.totalSubmittedCount === 0) {
    return null;
  }

  const tiles: Array<{ label: string; value: string; sub?: string; icon: React.ComponentType<any> }> = [
    {
      label: 'Submitted',
      value: String(data.totalSubmittedCount),
      sub: `${data.totalFundedCount} funded`,
      icon: FileBarChart,
    },
    {
      label: 'Funded',
      value: formatCents(data.totalFundedCents),
      icon: DollarSign,
    },
    {
      label: 'Fees paid',
      value: formatCents(data.totalFeeCents),
      icon: Briefcase,
    },
    {
      label: 'Reserves outstanding',
      value: formatCents(data.reservesOutstandingCents),
      icon: TrendingUp,
    },
    {
      label: 'Avg days to fund',
      value: data.averageDaysToFund == null ? '—' : data.averageDaysToFund.toFixed(1),
      sub: 'rolling 30d',
      icon: Clock,
    },
    {
      label: 'Recourse rate',
      value: `${data.recourseRatePct.toFixed(1)}%`,
      icon: AlertTriangle,
    },
  ];

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-foreground">Factoring</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <Card key={tile.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
                <CardTitle className="text-xs font-medium text-muted-foreground">{tile.label}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="text-lg font-semibold text-foreground">{tile.value}</div>
                {tile.sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{tile.sub}</div>}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

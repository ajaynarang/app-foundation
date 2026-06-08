'use client';

import { Users, Package, RefreshCw, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@sally/ui/components/ui/card';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { useSmartAlertStats } from '@/features/operations/alerts';
import { SEMANTIC_COLORS } from '@/shared/lib/colors';

export function SmartStatsBar() {
  const { data: stats, isLoading } = useSmartAlertStats();

  const cards = [
    {
      label: 'Drivers with Issues',
      value: stats ? `${stats.driversWithIssues}/${stats.totalActiveDrivers}` : undefined,
      icon: <Users className="h-4 w-4 text-muted-foreground" />,
      highlight: stats && stats.driversWithIssues > 0,
    },
    {
      label: 'Loads at Risk',
      value: stats ? `${stats.loadsAtRisk}/${stats.totalActiveLoads}` : undefined,
      icon: <Package className="h-4 w-4 text-muted-foreground" />,
      highlight: stats && stats.loadsAtRisk > 0,
    },
    {
      label: 'Recurring Alerts',
      value: stats?.recurringAlerts,
      icon: <RefreshCw className="h-4 w-4 text-muted-foreground" />,
      highlight: stats && stats.recurringAlerts > 0,
    },
    {
      label: 'Avg Resolve Time',
      value: stats?.avgResolveTimeMinutes != null ? `${stats.avgResolveTimeMinutes}m` : undefined,
      icon: <Clock className="h-4 w-4 text-muted-foreground" />,
      highlight: false,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{card.label}</CardTitle>
            {card.icon}
          </CardHeader>
          <CardContent>
            {isLoading || card.value == null ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className={`text-2xl font-bold ${card.highlight ? SEMANTIC_COLORS.caution.text : ''}`}>
                {card.value}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

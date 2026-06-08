'use client';

import { Badge } from '@sally/ui/components/ui/badge';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { useAlerts } from '@/features/operations/alerts/hooks/use-alerts';
import { DriverAlertCard } from './DriverAlertCard';

interface DriverAlertListProps {
  driverId: string;
}

export function DriverAlertListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-28 w-full rounded-lg" />
      ))}
    </div>
  );
}

export function DriverAlertList({ driverId }: DriverAlertListProps) {
  const { data: alerts = [], isLoading } = useAlerts({ driverId: driverId });

  if (isLoading) return <DriverAlertListSkeleton />;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeAlerts = (alerts as any[])
    .filter((a) => a.status === 'active')
    .sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return (order[a.priority as keyof typeof order] ?? 4) - (order[b.priority as keyof typeof order] ?? 4);
    });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const acknowledgedAlerts = (alerts as any[]).filter((a) => a.status === 'acknowledged').slice(0, 10);

  return (
    <div className="space-y-4">
      {/* Active header */}
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-foreground">Active Alerts</h3>
        {activeAlerts.length > 0 && (
          <Badge variant="destructive" className="text-xs">
            {activeAlerts.length}
          </Badge>
        )}
      </div>

      {/* Active alerts */}
      {activeAlerts.length > 0 ? (
        <div className="space-y-3">
          {activeAlerts.map((alert) => (
            <DriverAlertCard key={alert.alertId} alert={alert} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground py-4 text-center">No active alerts</p>
      )}

      {/* Acknowledged section */}
      {acknowledgedAlerts.length > 0 && (
        <>
          <div className="flex items-center gap-3 mt-6">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">Earlier Today</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="space-y-3">
            {acknowledgedAlerts.map((alert) => (
              <DriverAlertCard key={alert.alertId} alert={alert} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

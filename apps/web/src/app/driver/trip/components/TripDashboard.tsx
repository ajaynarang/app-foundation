'use client';

import Link from 'next/link';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Package, ChevronRight, AlertTriangle, Rocket } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';

import { Skeleton } from '@sally/ui/components/ui/skeleton';
// HOSCompactClocks removed — HOS is now handled by the floating nudge pill
import { DeliveryCelebration } from '@/features/fleet/drivers/components/DeliveryCelebration';
import { useDriverHome } from '@/features/fleet/drivers/hooks/use-driver-home';
import { useDriverLoadHistory } from '@/features/fleet/drivers/hooks/use-driver-load-history';
import { useDriverWeeklyStats } from '@/features/fleet/drivers/hooks/use-driver-weekly-stats';
import { useAlerts } from '@/features/operations/alerts/hooks/use-alerts';
import { AlertPriority } from '@/features/operations/alerts';
import { useSallyStore } from '@/features/platform/sally-ai/store';

import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { formatCents } from '@/shared/lib/utils/formatters';
import { DISPLAY_FORMATS } from '@/shared/lib/utils/date-utils';
import { SESSION_KEYS } from '@/shared/constants';
import type { Alert } from '@/features/operations/alerts/types';

interface Props {
  driverName: string;
}

function StatsRow({ driverId }: { driverId: string }) {
  const { data: stats } = useDriverWeeklyStats(driverId);
  if (!stats) return null;

  // Redesign #5: Empty stats → motivational collapse instead of "0 / 0 / —"
  const hasActivity = (stats.loadsCompleted ?? 0) > 0 || (stats.milesDriven ?? 0) > 0;

  if (!hasActivity) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-card border border-border/50 p-3">
        <div className="h-9 w-9 rounded-[10px] bg-blue-500/10 flex items-center justify-center shrink-0">
          <Rocket className="h-[18px] w-[18px] text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">New week, fresh start</p>
          <p className="text-xs text-muted-foreground">Your stats will appear as you complete loads</p>
        </div>
      </div>
    );
  }

  const items = [
    { label: 'Loads', value: stats.loadsCompleted ?? 0 },
    { label: 'Miles', value: (stats.milesDriven ?? 0).toLocaleString() },
    { label: 'Pay', value: stats.earningsCents ? formatCents(stats.earningsCents) : '—' },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map(({ label, value }) => (
        <div key={label} className="rounded-lg bg-card border border-border p-3 text-center">
          <p className="text-base font-semibold text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      ))}
    </div>
  );
}

function RecentLoads() {
  const { formatTimestamp } = useFormatters();
  const router = useRouter();
  const { data } = useDriverLoadHistory();
  const loads = (data?.data ?? []).slice(0, 5);

  if (loads.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recent Loads</p>
      <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {loads.map((load: any) => {
          const origin = [load.originCity, load.originState].filter(Boolean).join(', ');
          const dest = [load.destinationCity, load.destinationState].filter(Boolean).join(', ');
          const route = origin && dest ? `${origin} → ${dest}` : origin || dest || '';
          const dateStr = load.deliveredAt ? formatTimestamp(load.deliveredAt, DISPLAY_FORMATS.COMPACT) : null;

          return (
            <button
              key={load.loadNumber}
              type="button"
              className="w-full px-3 py-2.5 bg-card flex items-center justify-between gap-3 text-left hover:bg-muted/50 transition-colors min-h-[3.4rem]"
              onClick={() => router.push(`/driver/me/loads/${load.loadNumber}`)}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">
                  <span className="font-semibold">{load.loadNumber}</span>
                  {load.referenceNumber && (
                    <span className="text-xs text-muted-foreground ml-1">· Ref: {load.referenceNumber}</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground truncate">{[route, dateStr].filter(Boolean).join(' · ')}</p>
              </div>
              {load.driverPayCents ? (
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-foreground">{formatCents(load.driverPayCents)}</p>
                  {load.payStatus && (
                    <p className="text-2xs text-muted-foreground">
                      {load.payStatus === 'paid' ? 'Paid' : load.payStatus === 'approved' ? 'Approved' : 'Pending'}
                    </p>
                  )}
                </div>
              ) : null}
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            </button>
          );
        })}
      </div>
      <Link
        href="/driver/me/loads"
        className="flex items-center justify-between w-full px-3 py-2 min-h-[3.4rem] text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>See all loads</span>
        <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

export function TripDashboard({ driverName: _driverName }: Props) {
  const _router = useRouter();
  const { expandStrip } = useSallyStore();
  const {
    driver: _driver,
    hos: _hos,
    currentLoad,
    upcomingLoads,
    completedStops: _completedStops,
    totalStops: _totalStops,
    driverId,
    isLoading,
  } = useDriverHome();

  const { data: alerts = [] } = useAlerts(driverId ? { driverId } : undefined);

  const [celebratingLoad, setCelebratingLoad] = useState<string | null>(null);
  const prevLoadRef = useRef<string | null>(null);
  const handleDismiss = useCallback(() => setCelebratingLoad(null), []);

  useEffect(() => {
    const prevId = prevLoadRef.current;
    const currentId = currentLoad?.loadNumber ?? null;
    if (prevId && prevId !== currentId) {
      const deliveredLoadId = sessionStorage.getItem(SESSION_KEYS.LAST_DELIVERED_LOAD);
      if (deliveredLoadId) {
        setCelebratingLoad(deliveredLoadId);
        sessionStorage.removeItem(SESSION_KEYS.LAST_DELIVERED_LOAD);
      }
    }
    prevLoadRef.current = currentId;
  }, [currentLoad?.loadNumber]);

  // HOS display removed — handled by floating nudge pill + bottom sheet

  const criticalAlert = (alerts as Alert[]).find(
    (a) => a.status === 'ACTIVE' && (a.priority === AlertPriority.CRITICAL || a.priority === AlertPriority.HIGH),
  );

  if (isLoading) {
    return (
      <div className="space-y-4 py-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-20 w-full rounded-lg" />
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-4">
      {/* Greeting moved to TripContent — shown above toggle for all states */}

      {/* Delivery celebration */}
      {celebratingLoad && <DeliveryCelebration loadNumber={celebratingLoad} onDismiss={handleDismiss} />}

      {/* Critical alert callout */}
      {criticalAlert && (
        <Button
          variant="outline"
          onClick={() => expandStrip()}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-caution/20 bg-caution/10 text-left min-h-[3.4rem] h-auto justify-start"
        >
          <AlertTriangle className="h-4 w-4 text-caution shrink-0" />
          <span className="text-sm text-caution flex-1 truncate">{criticalAlert.title}</span>
          <ChevronRight className="h-4 w-4 text-caution shrink-0" />
        </Button>
      )}

      {/* Upcoming loads */}
      {upcomingLoads.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Up Next</p>
          <div className="space-y-1">
            {upcomingLoads.slice(0, 3).map((load, _i) => {
              const origin = [load.originCity, load.originState].filter(Boolean).join(', ');
              const dest = [load.destinationCity, load.destinationState].filter(Boolean).join(', ');
              const routeStr = origin && dest ? `${origin} → ${dest}` : origin || dest;

              return (
                <div
                  key={load.loadNumber}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-card"
                >
                  <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      <span className="font-semibold">{load.loadNumber}</span>
                      {load.referenceNumber && (
                        <span className="text-xs text-muted-foreground ml-1">· Ref: {load.referenceNumber}</span>
                      )}
                      {load.customerName ? <span className="text-muted-foreground"> · {load.customerName}</span> : ''}
                    </p>
                    {routeStr && <p className="text-xs text-muted-foreground truncate">{routeStr}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Weekly stats */}
      {driverId && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">This Week</p>
          <StatsRow driverId={driverId} />
        </div>
      )}

      {/* HOS removed — the floating nudge pill + bottom sheet handles this now */}

      {/* Recent loads */}
      <RecentLoads />
    </div>
  );
}

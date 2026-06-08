'use client';

import { useState, useMemo, useCallback } from 'react';
import { formatLoadLabel, RoutePlanStatusSchema } from '@sally/shared-types';

const RoutePlanStatus = RoutePlanStatusSchema.enum;
import Link from 'next/link';
import { Route, User, Clock, MapPin, Package } from 'lucide-react';
import { Badge } from '@sally/ui/components/ui/badge';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { PageHeader, FilterBar, StatusPivot } from '@/shared/components/page-chrome';
import { useRoutePlans } from '@/features/routing/route-planning';
import type { RoutePlanListItem } from '@/features/routing/route-planning';
import {
  formatHours,
  statusVariant,
  statusBadgeClassName,
} from '@/features/routing/route-planning/components/plan-utils';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { DISPLAY_FORMATS } from '@/shared/lib/utils/date-utils';
import { DateRangeFilter } from '@/shared/components/ui/date-range-filter';
import { FeatureGuard } from '@/features/platform/feature-flags';

function PlanCard({ plan }: { plan: RoutePlanListItem }) {
  const { formatTimestamp } = useFormatters();

  // First and last dock stops for route summary
  const dockStops = plan.segments.filter((s) => s.actionType);
  const origin = dockStops[0]?.toLocation?.split(',')[0];
  const destination = dockStops.length > 1 ? dockStops[dockStops.length - 1]?.toLocation?.split(',')[0] : null;
  const stopCount = dockStops.length;

  return (
    <Link href={`/dispatcher/smart-routes/${plan.planId}`} className="block">
      <Card className="cursor-pointer hover:bg-accent/30 transition-colors">
        <CardContent className="p-4">
          {/* Row 1: Driver name + status + schedule */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-sm font-medium text-foreground truncate">{plan.driver.name}</span>
              <span className="text-xs text-muted-foreground flex-shrink-0">#{plan.vehicle.unitNumber}</span>
              <Badge
                variant={statusVariant(plan.status)}
                className={`text-2xs px-1.5 py-0 ${statusBadgeClassName(plan.status)}`}
              >
                {plan.status}
              </Badge>
              {!plan.isFeasible && (
                <Badge variant="destructive" className="text-2xs px-1.5 py-0">
                  infeasible
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
              <Clock className="h-3 w-3" />
              <span>
                {formatTimestamp(plan.departureTime, DISPLAY_FORMATS.COMPACT_DATE_TIME)}
                {plan.estimatedArrival &&
                  ` → ${formatTimestamp(plan.estimatedArrival, DISPLAY_FORMATS.COMPACT_DATE_TIME)}`}
              </span>
            </div>
          </div>

          {/* Row 2: Route — origin → destination */}
          {origin && (
            <div className="flex items-center gap-1.5 mt-2 text-sm text-foreground">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span className="truncate">
                {origin}
                {destination && destination !== origin ? ` → ${destination}` : ''}
                {stopCount > 2 && <span className="text-muted-foreground"> ({stopCount} stops)</span>}
              </span>
            </div>
          )}

          {/* Row 3: Load info + route stats */}
          <div className="flex items-center justify-between gap-4 mt-2">
            {/* Loads */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
              <Package className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">
                {plan.loads
                  .map((l) => `${formatLoadLabel(l.load.loadNumber, l.load.referenceNumber)} · ${l.load.customerName}`)
                  .join(' | ')}
              </span>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
              <span>{plan.totalDistanceMiles.toLocaleString(undefined, { maximumFractionDigits: 0 })} mi</span>
              <span>{formatHours(plan.totalTripTimeHours)}</span>
              {plan.totalCostEstimate > 0 && (
                <span>${plan.totalCostEstimate.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              )}
            </div>
          </div>

          {/* Plan ID — subtle, bottom-right */}
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-2xs font-mono text-muted-foreground">{plan.planId}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function PlanListSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i}>
          <CardContent className="p-4 space-y-3">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-2 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-10 text-center">
        <Route className="h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-sm font-medium text-foreground">No smart routes</p>
        <p className="text-xs text-muted-foreground mt-1">{message}</p>
      </CardContent>
    </Card>
  );
}

type SmartRouteScope = 'active' | 'history';

export default function RoutePlansPage() {
  // Active vs History is a status scope (a filter), not page navigation → StatusPivot, not tabs.
  const [scope, setScope] = useState<SmartRouteScope>('active');
  const [search, setSearch] = useState('');
  const [historyDateFrom, setHistoryDateFrom] = useState<string | undefined>();
  const [historyDateTo, setHistoryDateTo] = useState<string | undefined>();
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>('all');
  const isHistory = scope === 'history';

  // Fetch active plans (draft + active)
  const { data: activeDraftData, isLoading: isDraftLoading } = useRoutePlans({
    status: RoutePlanStatus.DRAFT,
    limit: 100,
  });
  const { data: activeData, isLoading: isActiveLoading } = useRoutePlans({
    status: RoutePlanStatus.ACTIVE,
    limit: 100,
  });

  // History: completed + cancelled + superseded, filterable by status
  const historyStatus =
    historyStatusFilter === 'all'
      ? `${RoutePlanStatus.COMPLETED},${RoutePlanStatus.CANCELLED},${RoutePlanStatus.SUPERSEDED}`
      : historyStatusFilter;
  const { data: historyListData, isLoading: isHistoryLoading } = useRoutePlans({
    status: historyStatus,
    limit: 200,
    dateFrom: historyDateFrom,
    dateTo: historyDateTo,
  });

  // Combine active plans
  const activePlans = useMemo(() => {
    const plans: RoutePlanListItem[] = [];
    if (activeDraftData?.plans) plans.push(...activeDraftData.plans);
    if (activeData?.plans) plans.push(...activeData.plans);
    return plans.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [activeDraftData, activeData]);

  // History plans (already sorted by backend, newest first)
  const historyPlans = historyListData?.plans ?? [];

  // Filter by search
  const filterPlans = useCallback((plans: RoutePlanListItem[], search: string) => {
    if (!search.trim()) return plans;
    const q = search.toLowerCase();
    return plans.filter(
      (p) =>
        p.planId.toLowerCase().includes(q) ||
        p.driver.name.toLowerCase().includes(q) ||
        p.vehicle.unitNumber.toLowerCase().includes(q) ||
        p.loads.some(
          (l) => l.load.customerName.toLowerCase().includes(q) || l.load.loadNumber.toLowerCase().includes(q),
        ) ||
        p.segments.some((s) => s.toLocation?.toLowerCase().includes(q)),
    );
  }, []);

  const filteredActive = filterPlans(activePlans, search);
  const filteredHistory = filterPlans(historyPlans, search);

  const isActiveTabLoading = isDraftLoading || isActiveLoading;

  return (
    <FeatureGuard featureKey="route_planning">
      <div className="space-y-6">
        {/* Zone 1 — Header (no nav tabs; Active/History is a filter pivot below) */}
        <PageHeader title="Smart Routes" subtitle="Optimized routes with HOS compliance" />

        {/* Zone 3 — Filter bar: Active/History pivot · search · (history) date + status */}
        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search driver, load, customer, location..."
          searchClassName="w-full sm:w-72"
        >
          <StatusPivot
            value={scope}
            onChange={setScope}
            segments={[
              { value: 'active', label: 'Active' },
              { value: 'history', label: 'History' },
            ]}
            counts={{ active: activePlans.length, history: historyPlans.length }}
            label="Smart route scope"
          />
          {isHistory && (
            <>
              <DateRangeFilter
                dateFrom={historyDateFrom}
                dateTo={historyDateTo}
                defaultPreset="30d"
                onChange={(from, to) => {
                  setHistoryDateFrom(from);
                  setHistoryDateTo(to);
                }}
              />
              <Select value={historyStatusFilter} onValueChange={setHistoryStatusFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value={RoutePlanStatus.COMPLETED}>Completed</SelectItem>
                  <SelectItem value={RoutePlanStatus.CANCELLED}>Cancelled</SelectItem>
                  <SelectItem value={RoutePlanStatus.SUPERSEDED}>Superseded</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}
        </FilterBar>

        {/* Zone 4 — Data */}
        {isHistory ? (
          isHistoryLoading ? (
            <PlanListSkeleton />
          ) : filteredHistory.length === 0 ? (
            <EmptyState message={search ? 'No plans match your search' : 'No smart route history found'} />
          ) : (
            <div className="space-y-3">
              {filteredHistory.map((plan) => (
                <PlanCard key={plan.planId} plan={plan} />
              ))}
            </div>
          )
        ) : isActiveTabLoading ? (
          <PlanListSkeleton />
        ) : filteredActive.length === 0 ? (
          <EmptyState message={search ? 'No plans match your search' : 'No active or draft smart routes'} />
        ) : (
          <div className="space-y-3">
            {filteredActive.map((plan) => (
              <PlanCard key={plan.planId} plan={plan} />
            ))}
          </div>
        )}
      </div>
    </FeatureGuard>
  );
}

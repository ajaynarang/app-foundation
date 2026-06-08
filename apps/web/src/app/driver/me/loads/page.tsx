'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Truck,
  Package,
  ChevronDown,
  ChevronRight,
  MapPin,
  FileText,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Badge } from '@sally/ui/components/ui/badge';
import { useDriverLoadHistory } from '@/features/fleet/drivers/hooks/use-driver-load-history';
import { useDriverHome } from '@/features/fleet/drivers/hooks/use-driver-home';
import { useLoadById } from '@/features/fleet/loads/hooks/use-loads';
import { formatCents } from '@/shared/lib/utils/formatters';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { DISPLAY_FORMATS } from '@/shared/lib/utils/date-utils';
import { DateRangeFilter, type DateRangePresetOption } from '@/shared/components/ui/date-range-filter';

// Driver-specific presets — no Custom (calendar popover doesn't work well on mobile)
function daysAgoRange(days: number) {
  const today = new Date();
  const past = new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { from: fmt(past), to: fmt(today) };
}
const DRIVER_PRESETS: DateRangePresetOption[] = [
  { value: '7d', label: '7 Days', getRange: () => daysAgoRange(7) },
  { value: '30d', label: '30 Days', getRange: () => daysAgoRange(30) },
  { value: '90d', label: '90 Days', getRange: () => daysAgoRange(90) },
];
import { DocUploadInline } from '@/app/driver/trip/components/DocUploadInline';
import { stopHasPrimaryDoc, getStopDocTypeLabel } from '@/app/driver/trip/lib/stop-docs';

function LoadHistorySkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-lg" />
      ))}
    </div>
  );
}

function LoadDetailSkeleton() {
  return (
    <div className="px-4 pb-4 space-y-3">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-16 w-full rounded-lg" />
      <Skeleton className="h-16 w-full rounded-lg" />
    </div>
  );
}

/** Expanded detail panel rendered when a row is tapped */
function LoadExpandedDetail({ loadId }: { loadId: string }) {
  const { formatTimestamp } = useFormatters();
  const { data: load, isLoading } = useLoadById(loadId);
  const [uploadingStopId, setUploadingStopId] = useState<number | null>(null);

  if (isLoading) return <LoadDetailSkeleton />;
  if (!load) return null;

  const meta: { label: string; value: string | null | undefined }[] = [
    { label: 'Customer', value: load.customerName },
    { label: 'Equipment', value: load.requiredEquipmentType },
    { label: 'Commodity', value: load.commodityType },
    { label: 'Weight', value: load.weightLbs ? `${load.weightLbs.toLocaleString()} lbs` : null },
    { label: 'Reference', value: load.referenceNumber },
  ].filter((m) => !!m.value);

  return (
    <div className="px-4 pb-4 space-y-4 border-t border-border bg-card">
      {/* Meta chips */}
      {meta.length > 0 && (
        <div className="pt-3 flex flex-wrap gap-x-4 gap-y-1">
          {meta.map((m) => (
            <span key={m.label} className="text-xs text-muted-foreground">
              <span className="text-foreground font-medium">{m.label}:</span> {m.value}
            </span>
          ))}
        </div>
      )}

      {/* Stops */}
      {load.stops && load.stops.length > 0 ? (
        <div className="space-y-2">
          {load.stops.map((stop) => {
            const hasPrimary = stopHasPrimaryDoc(stop);
            const docTypeLabel = getStopDocTypeLabel(stop);
            const isShowingUpload = uploadingStopId === stop.stopId;

            const addressParts = [stop.stopAddress, stop.stopCity, stop.stopState].filter(Boolean).join(', ');

            return (
              <div key={stop.stopId} className="rounded-lg border border-border bg-background p-3 space-y-2">
                {/* Stop header */}
                <div className="flex items-start gap-2">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground truncate">
                      {stop.stopName || (stop.actionType === 'pickup' ? 'Pickup' : 'Delivery')}
                    </p>
                    {addressParts && <p className="text-xs text-muted-foreground truncate">{addressParts}</p>}
                  </div>
                  {/* Doc badge */}
                  {(stop.actionType === 'pickup' || stop.actionType === 'delivery' || stop.actionType === 'both') && (
                    <Badge variant={hasPrimary ? 'muted' : 'outline'} className="shrink-0 text-2xs gap-1">
                      {hasPrimary ? <CheckCircle2 className="h-2.5 w-2.5" /> : <FileText className="h-2.5 w-2.5" />}
                      {docTypeLabel}
                    </Badge>
                  )}
                </div>

                {/* Timestamps */}
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 pl-5">
                  {stop.arrivedAt && (
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" />
                      Arrived {formatTimestamp(stop.arrivedAt, DISPLAY_FORMATS.COMPACT)}
                    </span>
                  )}
                  {stop.completedAt && (
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <CheckCircle2 className="h-2.5 w-2.5" />
                      Done {formatTimestamp(stop.completedAt, DISPLAY_FORMATS.COMPACT)}
                    </span>
                  )}
                </div>

                {/* Upload prompt / inline uploader */}
                {!hasPrimary &&
                  stop.completedAt == null &&
                  (isShowingUpload ? (
                    <div className="pl-5">
                      <DocUploadInline
                        stopId={String(stop.stopId)}
                        loadId={loadId}
                        documentType={docTypeLabel}
                        onUploaded={() => setUploadingStopId(null)}
                        onSkip={() => setUploadingStopId(null)}
                      />
                    </div>
                  ) : (
                    <div className="pl-5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs gap-1.5"
                        onClick={() => setUploadingStopId(stop.stopId)}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Upload {docTypeLabel}
                      </Button>
                    </div>
                  ))}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default function DriverLoadHistoryPage() {
  const { formatTimestamp } = useFormatters();
  const router = useRouter();
  const { data, isLoading } = useDriverLoadHistory();
  const { upcomingLoads, currentLoad } = useDriverHome();
  const [expandedLoadId, setExpandedLoadId] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<string | undefined>(undefined);
  const [dateTo, setDateTo] = useState<string | undefined>(undefined);

  const allLoads = data?.data ?? [];

  // Filter delivered loads by date range (from DateRangeFilter)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loads = allLoads.filter((l: any) => {
    if (!dateFrom && !dateTo) return true;
    if (!l.deliveredAt) return true;
    const delivered = l.deliveredAt.slice(0, 10); // YYYY-MM-DD
    if (dateFrom && delivered < dateFrom) return false;
    if (dateTo && delivered > dateTo) return false;
    return true;
  });
  const totalDriverPay = allLoads.reduce(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sum: number, l: any) => sum + (l.driverPayCents ?? 0),
    0,
  );

  // Combine current + upcoming for the "Active" section
  const activeLoads = [
    ...(currentLoad
      ? [
          {
            loadNumber: currentLoad.loadNumber,
            status: currentLoad.status,
            customerName: currentLoad.customerName,
            originCity: currentLoad.originCity,
            originState: currentLoad.originState,
            destinationCity: currentLoad.destinationCity,
            destinationState: currentLoad.destinationState,
          },
        ]
      : []),
    ...upcomingLoads,
  ];

  const toggleExpand = (loadId: string) => {
    setExpandedLoadId((prev) => (prev === loadId ? null : loadId));
  };

  return (
    <div className="py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-base font-semibold text-foreground">My Loads</h1>
          <p className="text-xs text-muted-foreground">
            {activeLoads.length > 0 ? `${activeLoads.length} active · ` : ''}
            {loads.length} delivered
            {totalDriverPay > 0 ? ` · ${formatCents(totalDriverPay)} earned` : ''}
          </p>
        </div>
      </div>

      {/* Active / Upcoming loads */}
      {activeLoads.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Active</h4>
          <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
            {activeLoads.map((load) => {
              const origin = [load.originCity, load.originState].filter(Boolean).join(', ');
              const dest = [load.destinationCity, load.destinationState].filter(Boolean).join(', ');
              const route = origin && dest ? `${origin} → ${dest}` : origin || dest || '';
              const isExpanded = expandedLoadId === load.loadNumber;

              return (
                <div key={load.loadNumber} className="bg-card">
                  <button
                    type="button"
                    className="w-full px-4 py-3 flex items-center gap-3 text-left min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                    onClick={() => toggleExpand(load.loadNumber ?? '')}
                    aria-expanded={isExpanded}
                  >
                    <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        <span className="font-semibold">{load.loadNumber}</span>
                        {load.referenceNumber && (
                          <span className="text-xs text-muted-foreground ml-1">· Ref: {load.referenceNumber}</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {[route, load.customerName].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 capitalize">
                      {load.status?.replace('_', ' ')}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {isExpanded && <LoadExpandedDetail loadId={load.loadNumber ?? ''} />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Delivered history with date filter */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Delivered</h4>
        <DateRangeFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          defaultPreset="7d"
          presets={DRIVER_PRESETS}
          hideCustom
          onChange={(from, to) => {
            setDateFrom(from);
            setDateTo(to);
          }}
        />
      </div>

      {isLoading ? (
        <LoadHistorySkeleton />
      ) : loads.length === 0 && activeLoads.length === 0 ? (
        <div className="py-12 text-center space-y-2">
          <Truck className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">No completed loads yet.</p>
        </div>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {loads.map((load: any) => {
            const origin = [load.originCity, load.originState].filter(Boolean).join(', ');
            const dest = [load.destinationCity, load.destinationState].filter(Boolean).join(', ');
            const route = origin && dest ? `${origin} → ${dest}` : origin || dest || load.customerName;

            return (
              <div key={load.loadNumber} className="bg-card">
                <button
                  type="button"
                  className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset hover:bg-muted/40 transition-colors"
                  onClick={() => router.push(`/driver/me/loads/${load.loadNumber}`)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      <span className="font-semibold">{load.loadNumber}</span>
                      {load.referenceNumber && (
                        <span className="text-xs text-muted-foreground ml-1">· Ref: {load.referenceNumber}</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[route, load.deliveredAt ? formatTimestamp(load.deliveredAt, DISPLAY_FORMATS.COMPACT) : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {load.driverPayCents ? (
                      <div className="text-right">
                        <p className="text-sm font-semibold text-foreground">{formatCents(load.driverPayCents)}</p>
                        {load.payStatus && (
                          <p className="text-2xs text-muted-foreground">
                            {load.payStatus === 'paid'
                              ? 'Paid'
                              : load.payStatus === 'approved'
                                ? 'Approved'
                                : 'Pending'}
                          </p>
                        )}
                      </div>
                    ) : null}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

'use client';

import { use, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, ChevronDown, FileText, MapPin, Route, DollarSign } from 'lucide-react';
import { Badge } from '@sally/ui/components/ui/badge';
import { Button } from '@sally/ui/components/ui/button';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { cn } from '@sally/ui';
import { useLoadById } from '@/features/fleet/loads/hooks/use-loads';
import { useRoutePlan } from '@/features/routing/route-planning';
import { DocUploadInline } from '@/app/driver/trip/components/DocUploadInline';
import { stopHasPrimaryDoc, getStopDocTypeLabel } from '@/app/driver/trip/lib/stop-docs';
import { formatCents } from '@/shared/lib/utils/formatters';
import { formatDurationHours } from '@/shared/lib/format-time';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { DISPLAY_FORMATS } from '@/shared/lib/utils/date-utils';
import type { LoadStop } from '@/features/fleet/loads/types';
import { LoadStopStatusSchema } from '@sally/shared-types';

const LOAD_STOP_STATUS = LoadStopStatusSchema.enum;

// ─── Status display ───────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  ASSIGNED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  IN_TRANSIT: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  at_pickup: 'bg-caution/10 text-caution',
  at_delivery: 'bg-caution/10 text-caution',
  DELIVERED: 'bg-muted text-muted-foreground',
  completed: 'bg-muted text-muted-foreground',
};

function statusLabel(status: string): string {
  return status
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Dock time calculation ────────────────────────────────────────────────────

/**
 * Calculate dock time between arrivedAt and completedAt (in minutes).
 * Returns null if timestamps are not available.
 */
function calcDockMinutes(stop: LoadStop): number | null {
  if (!stop.arrivedAt || !stop.completedAt) return null;
  const arrived = new Date(stop.arrivedAt).getTime();
  const departed = new Date(stop.completedAt).getTime();
  if (Number.isNaN(arrived) || Number.isNaN(departed)) return null;
  return Math.max(0, Math.round((departed - arrived) / 60000));
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function LoadDetailSkeleton() {
  return (
    <div className="py-4 space-y-4 px-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-md shrink-0" />
        <div className="space-y-1.5 flex-1">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3.5 w-32" />
        </div>
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      {/* Load details card */}
      <Skeleton className="h-28 w-full rounded-lg" />
      {/* Stops */}
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-32 w-full rounded-lg" />
      <Skeleton className="h-32 w-full rounded-lg" />
      {/* Earnings */}
      <Skeleton className="h-20 w-full rounded-lg" />
    </div>
  );
}

// ─── Stop expanded detail ─────────────────────────────────────────────────────

interface StopCardProps {
  stop: LoadStop;
  loadId: string;
}

function StopCard({ stop, loadId, defaultExpanded }: StopCardProps & { defaultExpanded?: boolean }) {
  const { formatTimestamp } = useFormatters();
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);
  const [showUpload, setShowUpload] = useState(false);

  const hasPrimary = stopHasPrimaryDoc(stop);
  const docTypeLabel = getStopDocTypeLabel(stop);

  const actionLabel = stop.actionType === 'pickup' ? 'Pickup' : stop.actionType === 'delivery' ? 'Delivery' : 'Stop';

  const addressParts = [stop.stopAddress, stop.stopCity, stop.stopState].filter(Boolean).join(', ');

  const dockMinutes = calcDockMinutes(stop);
  const detentionMinutes = stop.detentionMinutes ?? null;

  // Rows: label → value pairs for the timestamp grid
  const timeRows: { label: string; value: string | null }[] = [
    stop.arrivedAt
      ? { label: 'Arrived', value: formatTimestamp(stop.arrivedAt, DISPLAY_FORMATS.COMPACT_DATE_TIME) }
      : null,
    stop.loadingStartedAt
      ? {
          label: stop.actionType === 'delivery' ? 'Unloading started' : 'Loading started',
          value: formatTimestamp(stop.loadingStartedAt, DISPLAY_FORMATS.COMPACT_DATE_TIME),
        }
      : null,
    stop.completedAt
      ? { label: 'Completed', value: formatTimestamp(stop.completedAt, DISPLAY_FORMATS.COMPACT_DATE_TIME) }
      : null,
    dockMinutes !== null && dockMinutes > 0 ? { label: 'Dock time', value: formatMinutes(dockMinutes) } : null,
    detentionMinutes !== null && detentionMinutes > 0
      ? { label: 'Detention', value: formatMinutes(detentionMinutes) }
      : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Stop header row — always visible, tappable */}
      <button
        type="button"
        className="w-full px-3 py-3 flex items-center gap-3 text-left min-h-[52px]"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
      >
        {/* Status icon */}
        <div
          className={cn(
            'h-7 w-7 rounded-full flex items-center justify-center shrink-0',
            stop.status === LOAD_STOP_STATUS.COMPLETED ? 'bg-green-500/15' : 'bg-muted',
          )}
        >
          {stop.status === LOAD_STOP_STATUS.COMPLETED ? (
            <Check className="h-3.5 w-3.5 text-green-400" />
          ) : (
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>

        {/* Stop name + city */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">
            {actionLabel}
            {stop.stopName ? ` — ${stop.stopName}` : ''}
          </p>
          {addressParts && <p className="text-xs text-muted-foreground truncate">{addressParts}</p>}
        </div>

        {/* Doc badge */}
        {(stop.actionType === 'pickup' || stop.actionType === 'delivery' || stop.actionType === 'both') && (
          <span
            className={cn(
              'text-2xs font-medium rounded px-1.5 py-0.5 shrink-0',
              hasPrimary ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400',
            )}
          >
            {hasPrimary ? `✓ ${docTypeLabel}` : `● ${docTypeLabel} needed`}
          </span>
        )}

        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200',
            expanded && 'rotate-180',
          )}
        />
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-border">
          {/* Timestamp grid — clean rows without per-line icons */}
          {timeRows.length > 0 && (
            <div className="pt-3 space-y-1.5">
              {timeRows.map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className="text-xs font-medium text-foreground tabular-nums text-right">{value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Actual weight / pieces if present */}
          {(stop.actualWeight || stop.actualPieces) && (
            <div className="space-y-1.5">
              {stop.actualWeight && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">Actual weight</span>
                  <span className="text-xs font-medium text-foreground tabular-nums">
                    {stop.actualWeight.toLocaleString()} lbs
                  </span>
                </div>
              )}
              {stop.actualPieces && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">Pieces</span>
                  <span className="text-xs font-medium text-foreground tabular-nums">{stop.actualPieces}</span>
                </div>
              )}
            </div>
          )}

          {/* Documents section */}
          <div className="border-t border-border pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-2xs font-semibold text-muted-foreground uppercase tracking-wide">Documents</p>
              {(stop.actionType === 'pickup' || stop.actionType === 'delivery' || stop.actionType === 'both') && (
                <span
                  className={cn(
                    'text-2xs font-medium rounded-full px-2 py-0.5',
                    hasPrimary
                      ? 'bg-green-500/10 text-green-500 dark:text-green-400'
                      : 'bg-yellow-500/10 text-yellow-500 dark:text-yellow-400',
                  )}
                >
                  {hasPrimary ? `✓ ${docTypeLabel}` : `● ${docTypeLabel} needed`}
                </span>
              )}
            </div>

            {/* Upload widget — always available on detail/review page */}
            {!showUpload ? (
              <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5" onClick={() => setShowUpload(true)}>
                <FileText className="h-3.5 w-3.5" />
                {hasPrimary ? 'Add document' : `Upload ${docTypeLabel}`}
              </Button>
            ) : (
              <DocUploadInline
                stopId={String(stop.stopId)}
                loadId={loadId}
                documentType={docTypeLabel}
                isAdditional={hasPrimary}
                onUploaded={() => setShowUpload(false)}
                onSkip={() => setShowUpload(false)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ loadNumber: string }>;
}

export default function DriverLoadDetailPage(props: PageProps) {
  const { loadNumber } = use(props.params);
  const router = useRouter();

  const { data: load, isLoading: isLoadLoading } = useLoadById(loadNumber);

  // Fetch route plan if load has an associated plan
  const routePlanId = load?.routePlan?.planId ?? null;
  const { data: plan, isLoading: isPlanLoading } = useRoutePlan(routePlanId);

  const isLoading = isLoadLoading || (!!routePlanId && isPlanLoading);

  // Sort stops by sequence
  const stops = useMemo(
    () => [...(load?.stops ?? [])].sort((a, b) => a.sequenceOrder - b.sequenceOrder),
    [load?.stops],
  );

  // Route label: "Boston, MA → New York, NY"
  const routeLabel = useMemo(() => {
    if (stops.length < 2) return null;
    const first = stops[0];
    const last = stops[stops.length - 1];
    const fmt = (s: LoadStop) => [s.stopCity, s.stopState].filter(Boolean).join(', ');
    const origin = fmt(first);
    const dest = fmt(last);
    if (!origin && !dest) return null;
    return `${origin} → ${dest}`;
  }, [stops]);

  if (isLoading) {
    return <LoadDetailSkeleton />;
  }

  if (!load) {
    return (
      <div className="py-12 px-3 text-center space-y-2">
        <p className="text-sm text-muted-foreground">Load not found.</p>
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          Go back
        </Button>
      </div>
    );
  }

  // Build meta rows for load details section
  const metaRows: { label: string; value: string }[] = [
    load.customerName ? { label: 'Customer', value: load.customerName } : null,
    load.requiredEquipmentType ? { label: 'Equipment', value: load.requiredEquipmentType.replace(/_/g, ' ') } : null,
    load.commodityType ? { label: 'Commodity', value: load.commodityType } : null,
    load.weightLbs ? { label: 'Weight', value: `${load.weightLbs.toLocaleString()} lbs` } : null,
    load.referenceNumber ? { label: 'Reference', value: load.referenceNumber } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  // Plan summary values
  const planMiles = plan ? Math.round(plan.totalDistanceMiles) : null;
  const planHours = plan ? plan.totalDriveTimeHours : null;
  const planDays = plan ? plan.totalDrivingDays : null;
  const planCost = plan?.totalCostEstimate ? Math.round(plan.totalCostEstimate) : null;

  // Earnings — driverPayCents / payStatus are computed on list endpoints;
  // they may also be present on detail responses at runtime even if not in the Load type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const driverPay: number | null = (load as any).driverPayCents ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payStatus: string | null = (load as any).payStatus ?? null;

  const payStatusLabel = (() => {
    if (!payStatus) return 'Pending';
    if (payStatus === 'paid') return 'Paid';
    if (payStatus === 'approved') return 'Approved';
    return 'Pending';
  })();

  return (
    <div className="py-4 space-y-4">
      {/* ── Back navigation ── */}
      <div className="flex items-center gap-2 px-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => router.back()}
          aria-label="Go back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
            <span className="text-sm font-bold text-foreground">{load.loadNumber}</span>
            {load.referenceNumber && (
              <>
                <span className="text-muted-foreground text-xs">·</span>
                <span className="text-xs text-muted-foreground">Ref: {load.referenceNumber}</span>
              </>
            )}
          </div>
          {routeLabel && <p className="text-xs text-muted-foreground truncate">{routeLabel}</p>}
        </div>
        <Badge
          className={cn(
            'shrink-0 text-xs px-2 py-0.5 border-0',
            STATUS_BADGE[load.status ?? ''] ?? 'bg-muted text-muted-foreground',
          )}
        >
          {statusLabel(load.status ?? '')}
        </Badge>
      </div>

      {/* ── Load details card ── */}
      {metaRows.length > 0 && (
        <div className="px-3">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Load Details</p>
          <Card className="border-border">
            <CardContent className="px-3 py-3 space-y-2">
              {metaRows.map(({ label, value }) => (
                <div key={label} className="flex items-start justify-between gap-3">
                  <span className="text-xs text-muted-foreground shrink-0">{label}</span>
                  <span className="text-xs font-medium text-foreground text-right">{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Stops ── */}
      {stops.length > 0 && (
        <div className="px-3 space-y-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Stops</p>
          {stops.map((stop) => {
            // Auto-expand stops that need doc uploads
            const needsDoc =
              (stop.actionType === 'pickup' || stop.actionType === 'delivery' || stop.actionType === 'both') &&
              !stopHasPrimaryDoc(stop);
            return <StopCard key={stop.stopId} stop={stop} loadId={loadNumber} defaultExpanded={needsDoc} />;
          })}
        </div>
      )}

      {/* ── Smart Route summary (if plan exists) ── */}
      {plan && (
        <div className="px-3 space-y-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Smart Route</p>
          <Card className="border-border">
            <CardContent className="px-3 py-3">
              <div className="flex items-center gap-2 mb-3">
                <Route className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-xs font-medium text-foreground">
                  Route Plan · {plan.status.charAt(0).toUpperCase() + plan.status.slice(1)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {planMiles !== null && (
                  <div>
                    <p className="text-sm font-semibold text-foreground">{planMiles.toLocaleString()} mi</p>
                    <p className="text-2xs text-muted-foreground">Distance</p>
                  </div>
                )}
                {planHours !== null && (
                  <div>
                    <p className="text-sm font-semibold text-foreground">{formatDurationHours(planHours)}</p>
                    <p className="text-2xs text-muted-foreground">Drive time</p>
                  </div>
                )}
                {planDays !== null && (
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {planDays} {planDays === 1 ? 'day' : 'days'}
                    </p>
                    <p className="text-2xs text-muted-foreground">Trip length</p>
                  </div>
                )}
                {planCost !== null && (
                  <div>
                    <p className="text-sm font-semibold text-foreground">${planCost.toLocaleString()}</p>
                    <p className="text-2xs text-muted-foreground">Est. cost</p>
                  </div>
                )}
              </div>

              {/* Segment count summary */}
              {(plan.segments?.length ?? 0) > 0 &&
                (() => {
                  const total = plan.segments.length;
                  const completed = plan.segments.filter(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (s) => (s as any).status === 'completed' || (s as any).status === 'skipped',
                  ).length;
                  return (
                    <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Segments completed</span>
                      <span className="font-medium text-foreground">
                        {completed} / {total}
                      </span>
                    </div>
                  );
                })()}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Earnings ── */}
      {(driverPay !== null || payStatus) && (
        <div className="px-3 space-y-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Earnings</p>
          <Card className="border-border">
            <CardContent className="px-3 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground">Driver pay</span>
                <span className="ml-auto text-sm font-semibold text-foreground">
                  {driverPay !== null ? formatCents(driverPay) : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 pl-6">
                <span className="text-xs text-muted-foreground">Status</span>
                <span
                  className={cn(
                    'text-xs font-medium',
                    payStatus === 'paid'
                      ? 'text-green-400'
                      : payStatus === 'approved'
                        ? 'text-blue-400'
                        : 'text-muted-foreground',
                  )}
                >
                  {payStatusLabel}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Bottom padding for tab bar */}
      <div className="h-4" />
    </div>
  );
}

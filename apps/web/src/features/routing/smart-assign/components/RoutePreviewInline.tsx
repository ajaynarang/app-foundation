'use client';

import { ArrowRight, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { Badge } from '@sally/ui/components/ui/badge';
import { Button } from '@sally/ui/components/ui/button';
import { cn } from '@sally/ui';
import type { RoutePlanResult, RouteSegment } from '@/features/routing/route-planning/types';

interface Props {
  plan: RoutePlanResult;
  deliveryWindowStart: string;
  deliveryWindowEnd: string;
  onViewFullPlan: () => void;
}

type ETAVerdict = 'early' | 'on_time' | 'at_risk' | 'infeasible';

function getETAVerdict(estimatedArrival: string, windowStart: string, windowEnd: string): ETAVerdict {
  if (!estimatedArrival || !windowEnd) return 'on_time';

  const eta = new Date(estimatedArrival).getTime();
  const end = new Date(windowEnd).getTime();
  const start = windowStart ? new Date(windowStart).getTime() : 0;

  // More than 30 min late
  if (eta > end + 30 * 60 * 1000) return 'infeasible';
  // Within 30 min of deadline
  if (eta > end - 15 * 60 * 1000) return 'at_risk';
  // Before window opens
  if (start && eta < start) return 'early';
  return 'on_time';
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatWindow(start: string, end: string): string {
  if (!start || !end) return '';
  const s = new Date(start);
  const e = new Date(end);
  const fmt = (d: Date) => d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${fmt(s)} – ${fmt(e)}`;
}

function formatHours(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatDeltaMinutes(estimatedArrival: string, windowEnd: string): string {
  const eta = new Date(estimatedArrival).getTime();
  const end = new Date(windowEnd).getTime();
  const diffMs = end - eta;
  const diffMin = Math.abs(Math.round(diffMs / 60000));
  if (diffMin < 60) return `${diffMin} min`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ---- Mini-timeline ----
type StopType = 'origin' | 'rest' | 'fuel' | 'break' | 'destination';

interface MiniStop {
  type: StopType;
  label: string;
}

function buildMiniStops(segments: RouteSegment[]): MiniStop[] {
  if (!segments?.length) return [];

  const stops: MiniStop[] = [];
  // First dock = origin
  const first = segments.find((s) => s.actionType === 'dock');
  if (first) stops.push({ type: 'origin', label: first.toLocation });

  // Middle stops
  const middle = segments.filter(
    (s, i) =>
      i > 0 &&
      i < segments.length - 1 &&
      (s.actionType === 'rest' || s.actionType === 'fuel' || s.actionType === 'break'),
  );
  for (const s of middle.slice(0, 3)) {
    stops.push({
      type: s.actionType as StopType,
      label: s.actionType === 'rest' ? 'Rest' : s.actionType === 'fuel' ? 'Fuel' : 'Break',
    });
  }

  if (middle.length > 3) {
    stops.push({ type: 'break', label: `+${middle.length - 3} more` });
  }

  // Last dock = destination
  const last = [...segments].reverse().find((s) => s.actionType === 'dock');
  if (last && last !== first) {
    stops.push({ type: 'destination', label: last.toLocation });
  }

  return stops;
}

function dotStyle(type: StopType): string {
  switch (type) {
    case 'origin':
    case 'destination':
      return 'h-3 w-3 rounded-full bg-foreground ring-2 ring-foreground/20';
    case 'rest':
      return 'h-2.5 w-2.5 rounded-full bg-gray-500 dark:bg-gray-400';
    case 'fuel':
      return 'h-2.5 w-2.5 rounded-full bg-gray-400 dark:bg-gray-500';
    default:
      return 'h-2 w-2 rounded-full bg-muted-foreground';
  }
}

interface MiniTimelineProps {
  segments: RouteSegment[];
}

function MiniTimeline({ segments }: MiniTimelineProps) {
  const stops = buildMiniStops(segments);
  if (stops.length < 2) return null;

  return (
    <div className="flex items-center gap-0">
      {stops.map((stop, i) => (
        <div key={i} className="flex items-center">
          <div className="flex flex-col items-center gap-0.5">
            <div className={dotStyle(stop.type)} />
            <span className="text-[9px] text-muted-foreground max-w-[56px] truncate text-center leading-tight">
              {stop.label}
            </span>
          </div>
          {i < stops.length - 1 && <div className="w-6 h-px bg-border mx-1 flex-shrink-0 mb-3" />}
        </div>
      ))}
    </div>
  );
}

// ---- ETA banner ----
interface ETABannerProps {
  verdict: ETAVerdict;
  estimatedArrival: string;
  windowStart: string;
  windowEnd: string;
  isHOSCompliant: boolean;
}

function ETABanner({ verdict, estimatedArrival, windowStart, windowEnd, isHOSCompliant }: ETABannerProps) {
  const etaStr = formatDate(estimatedArrival);
  const window = formatWindow(windowStart, windowEnd);
  const delta = windowEnd ? formatDeltaMinutes(estimatedArrival, windowEnd) : '';

  if (verdict === 'early' || verdict === 'on_time') {
    return (
      <div className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2.5 space-y-0.5">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
          <p className="text-sm font-medium text-foreground">
            ETA: {etaStr}
            {verdict === 'early' && delta && (
              <span className="ml-1.5 text-xs font-normal text-green-600 dark:text-green-400">— {delta} early</span>
            )}
          </p>
        </div>
        {window && (
          <p className="text-xs text-muted-foreground pl-6">
            Delivery window: {window}
            {isHOSCompliant && ' · HOS fully compliant'}
          </p>
        )}
      </div>
    );
  }

  if (verdict === 'at_risk') {
    return (
      <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2.5 space-y-0.5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0" />
          <p className="text-sm font-medium text-foreground">ETA at risk — arrives {etaStr}</p>
        </div>
        {window && (
          <p className="text-xs text-muted-foreground pl-6">
            Delivery window: {window} · {delta} buffer remaining
          </p>
        )}
      </div>
    );
  }

  // infeasible
  return (
    <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2.5 space-y-0.5">
      <div className="flex items-center gap-2">
        <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
        <p className="text-sm font-medium text-foreground">Cannot meet delivery window</p>
      </div>
      <p className="text-xs text-muted-foreground pl-6">
        Estimated arrival: {etaStr}
        {window && ` · Window: ${window}`}
      </p>
    </div>
  );
}

// ---- Stats grid ----
interface StatCellProps {
  label: string;
  value: string;
  sub?: string;
}

function StatCell({ label, value, sub }: StatCellProps) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <p className="text-2xs uppercase tracking-wider text-muted-foreground leading-none mb-1">{label}</p>
      <p className="text-sm font-semibold text-foreground leading-none">{value}</p>
      {sub && <p className="text-2xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ---- Main component ----
export function RoutePreviewInline({ plan, deliveryWindowStart, deliveryWindowEnd, onViewFullPlan }: Props) {
  const verdict = getETAVerdict(plan.estimatedArrival, deliveryWindowStart, deliveryWindowEnd);
  const isCompliant = plan.complianceReport?.isFullyCompliant ?? false;

  const costStr = plan.totalCostEstimate
    ? `$${plan.totalCostEstimate.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : '—';

  return (
    <div className="space-y-3">
      {/* ETA verdict banner */}
      <ETABanner
        verdict={verdict}
        estimatedArrival={plan.estimatedArrival}
        windowStart={deliveryWindowStart}
        windowEnd={deliveryWindowEnd}
        isHOSCompliant={isCompliant}
      />

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-1.5">
        <StatCell
          label="Miles"
          value={plan.totalDistanceMiles.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        />
        <StatCell
          label="Trip Time"
          value={formatHours(plan.totalTripTimeHours)}
          sub={`${formatHours(plan.totalDriveTimeHours)} drive`}
        />
        <StatCell label="Days" value={String(plan.totalDrivingDays)} sub="driving days" />
        <StatCell label="Est. Cost" value={costStr} />
      </div>

      {/* Mini timeline */}
      {plan.segments?.length > 0 && (
        <div className="rounded-md border border-border bg-card px-3 py-3 overflow-x-auto">
          <MiniTimeline segments={plan.segments} />
        </div>
      )}

      {/* Footer: view full plan + HOS badge */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground hover:text-foreground px-0 gap-1"
          onClick={onViewFullPlan}
        >
          View full route
          <ArrowRight className="h-3 w-3" />
        </Button>

        {isCompliant && (
          <Badge
            variant="outline"
            className={cn(
              'text-2xs px-1.5 py-0 h-5 font-normal',
              'border-green-500/30 text-green-600 dark:text-green-400',
            )}
          >
            <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
            HOS Compliant
          </Badge>
        )}
      </div>
    </div>
  );
}

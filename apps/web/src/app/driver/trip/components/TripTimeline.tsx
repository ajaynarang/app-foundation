'use client';

import { useCallback, useMemo, useState } from 'react';
import { Car, Check, ChevronDown, Coffee, Fuel, MapPin, Moon, Package } from 'lucide-react';
import { cn } from '@sally/ui';
import { Button } from '@sally/ui/components/ui/button';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { getSegmentColor } from '../lib/route-state';
import { formatDurationHours as formatDuration } from '@/shared/lib/format-time';
import { DocUploadInline } from './DocUploadInline';
import { SegmentHeroCard } from './SegmentHeroCard';
import { UpcomingSegments } from './UpcomingSegments';
import { RestAlertBanner } from './RestAlertBanner';
import { StopActionInline } from './StopActionInline';
import { LumperStatusCard } from './LumperStatusCard';
import { StopNudge } from './StopNudge';
import { ReceiptUpload } from './ReceiptUpload';
import { useMoneyCodesByLoad } from '@/features/fleet/loads/hooks/use-money-codes';
import { stopHasPrimaryDoc, stopHasDocument, getStopDocBadge } from '../lib/stop-docs';
import type { RouteSegment, RoutePlanResult } from '@/features/routing/route-planning';
import { useUpdateSegmentStatus } from '@/features/routing/route-planning';
import type { Load, LoadStop } from '@/features/fleet/loads/types';
import type { MoneyCode } from '@sally/shared-types';
import { SEGMENT_STATUS, STOP_STATUS, SEGMENT_TYPE } from '../lib/constants';

// ─── Segment type icons ───────────────────────────────────────────────────────

const SEGMENT_ICONS: Record<string, React.ElementType> = {
  drive: Car,
  rest: Moon,
  fuel: Fuel,
  dock: MapPin,
  break: Coffee,
};

// ─── Dock action icon — pickup vs delivery ────────────────────────────────────

function getDockIcon(segment: RouteSegment): React.ElementType {
  if (segment.actionType === 'delivery') return Package;
  return MapPin;
}

// ─── Dock action color — green for pickup, red for delivery ───────────────────

function getDockColor(segment: RouteSegment): string {
  if (segment.actionType === 'delivery') return '#f87171';
  return '#4ade80';
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  load: Load; // Active load with stops
  plan?: RoutePlanResult; // Route plan with segments (null for manual loads)
  driveHoursRemaining?: number; // HOS drive hours remaining
  currentStop?: LoadStop; // The current/next stop from useDriverHome
  onStopComplete?: () => void;
  onDriverAction?: (action: 'lumper' | 'detention') => void;
}

// ─── Smart Route: Segment Timeline ───────────────────────────────────────────

interface SmartTimelineProps {
  load: Load;
  plan: RoutePlanResult;
  driveHoursRemaining?: number;
  currentStop?: LoadStop;
  onDriverAction?: (action: 'lumper' | 'detention') => void;
}

function findMatchingStop(
  segment: RouteSegment,
  stops: LoadStop[],
  allDockSegments?: RouteSegment[],
): LoadStop | undefined {
  if (segment.segmentType !== 'dock') return undefined;

  const segAction = segment.actionType; // may be undefined for older plans

  // Strategy 1: Match by actionType + city (only if actionType is known)
  if (segAction) {
    const cityMatch = stops.find((stop) => {
      if (stop.actionType !== segAction) return false;
      if (stop.stopCity && segment.toLocation) {
        return segment.toLocation.toLowerCase().includes(stop.stopCity.toLowerCase());
      }
      return false;
    });
    if (cityMatch) return cityMatch;
  }

  // Strategy 2: Match by customerName (works even without actionType)
  if (segment.customerName) {
    const customerMatch = stops.find((stop) => {
      if (segAction && stop.actionType !== segAction) return false;
      if (stop.stopName) {
        return (
          segment.customerName!.toLowerCase().includes(stop.stopName.toLowerCase()) ||
          stop.stopName.toLowerCase().includes(segment.customerName!.toLowerCase())
        );
      }
      return false;
    });
    if (customerMatch) return customerMatch;
  }

  // Strategy 3: Match by toLocation containing stop city (without actionType check)
  if (segment.toLocation) {
    const locationMatch = stops.find((stop) => {
      if (stop.stopCity && segment.toLocation) {
        return segment.toLocation.toLowerCase().includes(stop.stopCity.toLowerCase());
      }
      return false;
    });
    if (locationMatch) return locationMatch;
  }

  // Strategy 4: Sequence-based — Nth dock segment to Nth stop
  if (allDockSegments) {
    const dockSegs = allDockSegments.sort((a, b) => a.sequenceOrder - b.sequenceOrder);
    const segIndex = dockSegs.findIndex((s) => s.segmentId === segment.segmentId);
    const sortedStops = [...stops].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
    if (segIndex >= 0 && segIndex < sortedStops.length) {
      return sortedStops[segIndex];
    }
  }

  // Strategy 5: Just return the first incomplete stop
  return stops.find((stop) => stop.status !== STOP_STATUS.COMPLETED) ?? stops[0];
}

function _getSegmentState(segment: RouteSegment): 'completed' | 'active' | 'upcoming' {
  if (segment.status === SEGMENT_STATUS.COMPLETED || segment.status === SEGMENT_STATUS.SKIPPED) return 'completed';
  if (segment.status === SEGMENT_STATUS.IN_PROGRESS) return 'active';
  return 'upcoming';
}

// ─── Timeline Indicator (32px rounded-square with type-specific icon) ────────

function TimelineIndicator({
  segment,
  state,
  color,
}: {
  segment: RouteSegment;
  state: 'completed' | 'active' | 'upcoming';
  color: string;
}) {
  const isDock = segment.segmentType === 'dock';
  const Icon = isDock ? getDockIcon(segment) : (SEGMENT_ICONS[segment.segmentType] ?? Car);
  const effectiveColor = isDock ? getDockColor(segment) : color;

  return (
    <div
      className={cn(
        'flex items-center justify-center shrink-0 rounded-[10px] transition-all',
        state === 'active' ? 'h-9 w-9' : 'h-8 w-8',
        state === 'completed' && 'opacity-70',
      )}
      style={{
        background: `${effectiveColor}${state === 'completed' ? '18' : state === 'active' ? '20' : '10'}`,
        border: `${state === 'active' ? '2px' : '1.5px'} solid ${effectiveColor}${state === 'active' ? '' : state === 'completed' ? '50' : '30'}`,
        boxShadow: state === 'active' ? `0 0 12px ${effectiveColor}30` : undefined,
      }}
    >
      {state === 'completed' ? (
        <Check className="h-4 w-4" style={{ color: effectiveColor, opacity: 0.8 }} />
      ) : (
        <Icon
          className={cn('shrink-0', state === 'active' ? 'h-[18px] w-[18px]' : 'h-4 w-4')}
          style={{ color: effectiveColor, opacity: state === 'upcoming' ? 0.6 : 1 }}
        />
      )}
    </div>
  );
}

// ─── Collapsed segment label ─────────────────────────────────────────────────

function getCollapsedSegmentLabel(segment: RouteSegment): string {
  switch (segment.segmentType) {
    case 'drive':
      return `Drive ${segment.distanceMiles?.toFixed(0) ?? '?'} mi${segment.driveTimeHours ? ` · ${formatDuration(segment.driveTimeHours)}` : ''}`;
    case 'dock': {
      const a = segment.actionType === 'pickup' ? 'Pickup' : segment.actionType === 'delivery' ? 'Delivery' : 'Dock';
      return `${a}${segment.customerName ? ` — ${segment.customerName}` : ''}`;
    }
    case 'fuel':
      return segment.fuelStationName || 'Fuel Stop';
    case 'rest':
      return `Rest${segment.restDurationHours ? ` · ${formatDuration(segment.restDurationHours)}` : ''}`;
    case 'break':
      return `Break${segment.restDurationHours ? ` · ${formatDuration(segment.restDurationHours)}` : ''}`;
    default:
      return segment.toLocation || '';
  }
}

// ─── SmartTimeline (hero card pattern) ───────────────────────────────────────

function SmartTimeline({
  load,
  plan,
  driveHoursRemaining,
  currentStop: pageCurrentStop,
  onDriverAction,
}: SmartTimelineProps) {
  const { formatTime } = useFormatters();
  const [docUploadSegmentId, setDocUploadSegmentId] = useState<string | null>(null);
  const [receiptTarget, setReceiptTarget] = useState<MoneyCode | null>(null);
  const updateSegmentStatus = useUpdateSegmentStatus();
  const { data: moneyCodes } = useMoneyCodesByLoad(load?.loadNumber ?? '');

  const sorted: RouteSegment[] = useMemo(
    () => [...(plan.segments as RouteSegment[])].sort((a, b) => a.sequenceOrder - b.sequenceOrder),
    [plan.segments],
  );

  const loadStops: LoadStop[] = useMemo(() => load?.stops ?? [], [load?.stops]);
  const dockSegments: RouteSegment[] = useMemo(() => sorted.filter((s) => s.segmentType === 'dock'), [sorted]);

  // Find first active segment index
  // Also considers the load stop status — if a dock segment's matching load stop
  // is already completed, skip that segment (plan and load out of sync)
  const activeIndex = useMemo(() => {
    // First check for in_progress segments
    const idx = sorted.findIndex((s) => s.status === SEGMENT_STATUS.IN_PROGRESS);
    if (idx >= 0) return idx;

    // Fallback: first non-completed segment whose matching load stop isn't done
    return sorted.findIndex((s) => {
      if (s.status === SEGMENT_STATUS.COMPLETED || s.status === SEGMENT_STATUS.SKIPPED) return false;

      // For dock segments, check if the matching load stop is already completed
      if (s.segmentType === SEGMENT_TYPE.DOCK && s.actionType) {
        const allOfType = loadStops.filter((ls) => ls.actionType === s.actionType);
        const allCompleted = allOfType.length > 0 && allOfType.every((ls) => ls.status === STOP_STATUS.COMPLETED);
        if (allCompleted) return false;
      }

      return true;
    });
  }, [sorted, loadStops]);

  const activeSegment = activeIndex >= 0 ? sorted[activeIndex] : undefined;
  const completedSegments = activeIndex > 0 ? sorted.slice(0, activeIndex) : [];
  const upcomingSegments = activeIndex >= 0 ? sorted.slice(activeIndex + 1) : sorted;

  // Handle fuel/break/rest completion from hero card
  const handleStopAction = useCallback(() => {
    if (!plan?.planId || !activeSegment) return;
    updateSegmentStatus.mutate({
      planId: plan.planId,
      segmentId: activeSegment.segmentId,
      status: 'completed',
      actualDeparture: new Date().toISOString(),
    });
  }, [plan?.planId, activeSegment, updateSegmentStatus]);

  // Matching stop for active segment
  // 1. Try heuristic matching (by name/city/customer)
  // 2. Fall back to first non-completed stop matching the segment's actionType
  // 3. Fall back to pageCurrentStop (from useDriverHome — but may not match segment)
  const activeMatchingStop = useMemo(() => {
    if (!activeSegment) return undefined;

    // Try name-based matching first
    const byName = findMatchingStop(activeSegment, loadStops, dockSegments);
    if (byName) return byName;

    // Fall back to actionType matching for dock segments
    if (activeSegment.segmentType === 'dock' && activeSegment.actionType) {
      const byAction = loadStops.find(
        (s) => s.actionType === activeSegment.actionType && s.status !== STOP_STATUS.COMPLETED,
      );
      if (byAction) return byAction;
    }

    // Last resort: use pageCurrentStop only if its actionType matches the segment
    if (pageCurrentStop && activeSegment.segmentType === 'dock') {
      if (pageCurrentStop.actionType === activeSegment.actionType) {
        return pageCurrentStop;
      }
    }

    return undefined;
  }, [activeSegment, loadStops, dockSegments, pageCurrentStop]);

  return (
    <>
      <div className="space-y-4">
        {/* Section title */}
        <p className="text-2xs font-semibold text-muted-foreground uppercase tracking-widest">Your Route</p>

        {/* ─── Completed segments: compact collapsed items ─── */}
        {completedSegments.length > 0 && (
          <div className="relative space-y-0">
            {completedSegments.map((segment, index) => {
              const color =
                segment.segmentType === 'dock' ? getDockColor(segment) : getSegmentColor(segment.segmentType);
              const isDock = segment.segmentType === 'dock';
              const _isLast = index === completedSegments.length - 1;
              const matchingStop = findMatchingStop(segment, loadStops, dockSegments);
              const hasBol = matchingStop ? stopHasDocument(matchingStop, 'bol') : false;
              const hasPod = matchingStop ? stopHasDocument(matchingStop, 'pod') : false;

              return (
                <div key={segment.segmentId} className="relative flex gap-3">
                  {/* Timeline stem */}
                  <div className="flex flex-col items-center w-9 shrink-0">
                    <div className="mt-2.5">
                      <TimelineIndicator segment={segment} state="completed" color={color} />
                    </div>
                    {/* Connecting line — always show for completed, connects to next or hero */}
                    <div className="flex-1 w-0.5 min-h-2 mt-1 rounded-full" style={{ backgroundColor: `${color}35` }} />
                  </div>

                  {/* Collapsed card */}
                  <div className="flex-1 pb-3 min-w-0">
                    <div className="rounded-lg border border-border/50 bg-card px-3 py-2 opacity-55 hover:opacity-75 transition-opacity">
                      {/* Line 1: Label + time */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground truncate flex-1">
                          {getCollapsedSegmentLabel(segment)}
                        </span>
                        <span className="text-2xs text-muted-foreground shrink-0 tabular-nums">
                          {formatTime(segment.estimatedArrival)}
                        </span>
                      </div>
                      {/* Line 2: Location + doc badges */}
                      {isDock && (
                        <div className="flex items-center gap-2 mt-1">
                          {segment.toLocation && (
                            <span className="text-2xs text-muted-foreground truncate flex-1">{segment.toLocation}</span>
                          )}
                          <span className="flex items-center gap-1 shrink-0">
                            {hasBol ? (
                              <span className="text-2xs font-medium text-green-400 bg-green-400/10 rounded-full px-2 py-0.5">
                                ✓ BOL
                              </span>
                            ) : matchingStop?.actionType === 'pickup' ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-auto px-2 py-0.5 text-2xs font-medium text-yellow-400 bg-yellow-400/10 hover:bg-yellow-400/20 rounded-full"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDocUploadSegmentId(segment.segmentId);
                                }}
                              >
                                ● BOL needed
                              </Button>
                            ) : null}
                            {hasPod ? (
                              <span className="text-2xs font-medium text-green-400 bg-green-400/10 rounded-full px-2 py-0.5">
                                ✓ POD
                              </span>
                            ) : matchingStop?.actionType === 'delivery' || matchingStop?.actionType === 'both' ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-auto px-2 py-0.5 text-2xs font-medium text-yellow-400 bg-yellow-400/10 hover:bg-yellow-400/20 rounded-full"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDocUploadSegmentId(segment.segmentId);
                                }}
                              >
                                ● POD needed
                              </Button>
                            ) : null}
                          </span>
                        </div>
                      )}
                    </div>
                    {/* Doc upload prompt for completed stops */}
                    {docUploadSegmentId === segment.segmentId && matchingStop && load?.loadNumber && (
                      <div className="mt-2">
                        <DocUploadInline
                          stopId={String(matchingStop.id)}
                          loadId={load.loadNumber}
                          documentType={matchingStop.actionType === 'pickup' ? 'BOL' : 'POD'}
                          onUploaded={() => setDocUploadSegmentId(null)}
                          onSkip={() => setDocUploadSegmentId(null)}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ─── Active segment: Hero Card ─── */}
        {activeSegment && (
          <SegmentHeroCard
            segment={activeSegment}
            load={load}
            plan={plan}
            matchingStop={activeMatchingStop}
            driveHoursRemaining={driveHoursRemaining}
            onStopAction={handleStopAction}
          />
        )}

        {/* ─── Rest Alert Banner ─── */}
        {activeSegment && <RestAlertBanner plan={plan} activeSegmentId={activeSegment.segmentId} />}

        {/* ─── Lumper status cards for active dock segment ─── */}
        {activeSegment?.segmentType === 'dock' && activeMatchingStop && (
          <>
            {moneyCodes
              ?.filter((mc) => mc.stopId === activeMatchingStop.id || (!mc.stopId && mc.loadId === load.id))
              .map((mc) => (
                <LumperStatusCard
                  key={mc.moneyCodeId}
                  moneyCode={mc}
                  loadId={load.loadNumber}
                  onUploadReceipt={() => setReceiptTarget(mc)}
                />
              ))}
            {/* Lumper nudge for delivery stops without active requests */}
            {activeMatchingStop.actionType === 'delivery' &&
              !moneyCodes?.some(
                (mc) =>
                  ['REQUESTED', 'APPROVED'].includes(mc.status) &&
                  (mc.stopId === activeMatchingStop.id || (!mc.stopId && mc.loadId === load.id)),
              ) && <StopNudge type="lumper" onAction={() => onDriverAction?.('lumper')} />}
            {/* Detention nudge — show when at dock for 2+ hours */}
            {activeMatchingStop.arrivedAt &&
              (() => {
                const hoursAtDock = (Date.now() - new Date(activeMatchingStop.arrivedAt!).getTime()) / (1000 * 60 * 60);
                if (hoursAtDock < 2) return null;
                return (
                  <StopNudge
                    type="detention"
                    hoursAtDock={hoursAtDock}
                    onAction={() => onDriverAction?.('detention')}
                  />
                );
              })()}
          </>
        )}

        {/* ─── Upcoming segments ─── */}
        {upcomingSegments.length > 0 && <UpcomingSegments segments={upcomingSegments} />}
      </div>

      {/* Receipt upload modal */}
      {receiptTarget && (
        <ReceiptUpload
          open={!!receiptTarget}
          onOpenChange={(open) => {
            if (!open) setReceiptTarget(null);
          }}
          loadId={load.loadNumber}
          loadDbId={load.id}
          stopId={receiptTarget.stopId}
          moneyCodeId={receiptTarget.moneyCodeId}
          prefilledAmountCents={receiptTarget.amountCents}
        />
      )}
    </>
  );
}

// ─── Manual Load: Stop Timeline ───────────────────────────────────────────────

interface ManualTimelineProps {
  load: Load;
  onStopComplete?: () => void;
  onDriverAction?: (action: 'lumper' | 'detention') => void;
}

// ─── Stop action color — green for pickup, red for delivery ───────────────────

function getStopColor(stop: LoadStop): string {
  if (stop.actionType === 'delivery') return '#f87171';
  return '#4ade80';
}

function getStopState(stop: LoadStop): 'completed' | 'active' | 'upcoming' {
  const status = stop.status;
  if (status === STOP_STATUS.COMPLETED) return 'completed';
  if (status === STOP_STATUS.IN_PROGRESS || status === STOP_STATUS.ARRIVED) return 'active';
  return 'upcoming';
}

function ManualTimeline({ load, onStopComplete, onDriverAction }: ManualTimelineProps) {
  const { formatTime } = useFormatters();
  const { data: moneyCodes } = useMoneyCodesByLoad(load?.loadNumber ?? '');
  const [receiptTarget, setReceiptTarget] = useState<MoneyCode | null>(null);

  const stops: LoadStop[] = useMemo(
    () => [...(load?.stops ?? [])].sort((a: LoadStop, b: LoadStop) => a.sequenceOrder - b.sequenceOrder),
    [load?.stops],
  );

  // Track which completed stop is expanded (to view/upload docs)
  const [expandedStopId, setExpandedStopId] = useState<number | null>(null);

  // Find active stop index
  const activeIndex = useMemo(() => {
    const idx = stops.findIndex((s) => {
      const st = s.status;
      return st === STOP_STATUS.IN_PROGRESS || st === STOP_STATUS.ARRIVED;
    });
    if (idx >= 0) return idx;
    // Fallback: first incomplete stop
    return stops.findIndex((s) => s.status !== STOP_STATUS.COMPLETED);
  }, [stops]);

  return (
    <>
      {/* Section title */}
      <p className="text-2xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">Stops</p>

      <div className="relative space-y-0">
        {stops.map((stop, index) => {
          const state = getStopState(stop);
          const isCompleted = state === 'completed';
          const isActive = index === activeIndex && state !== 'completed';
          const isLast = index === stops.length - 1;
          const color = getStopColor(stop);

          const actionLabel =
            stop.actionType === 'pickup' ? 'Pickup' : stop.actionType === 'delivery' ? 'Delivery' : 'Stop';

          const StopIcon = stop.actionType === 'delivery' ? Package : MapPin;
          const hasDoc = stopHasPrimaryDoc(stop);
          const docBadge = getStopDocBadge(stop);

          return (
            <div key={stop.stopId} className="relative flex gap-3">
              {/* Timeline stem */}
              <div className="flex flex-col items-center w-9 shrink-0">
                <div className="mt-2.5">
                  <div
                    className={cn(
                      'flex items-center justify-center shrink-0 rounded-[10px] transition-all',
                      isActive ? 'h-9 w-9' : 'h-8 w-8',
                      isCompleted && 'opacity-70',
                    )}
                    style={{
                      background: `${color}${isCompleted ? '18' : isActive ? '20' : '10'}`,
                      border: `${isActive ? '2px' : '1.5px'} solid ${color}${isActive ? '' : isCompleted ? '50' : '30'}`,
                      boxShadow: isActive ? `0 0 12px ${color}30` : undefined,
                    }}
                  >
                    {isCompleted ? (
                      <Check className="h-4 w-4" style={{ color, opacity: 0.8 }} />
                    ) : (
                      <StopIcon
                        className={cn('shrink-0', isActive ? 'h-[18px] w-[18px]' : 'h-4 w-4')}
                        style={{ color, opacity: !isActive ? 0.6 : 1 }}
                      />
                    )}
                  </div>
                </div>
                {/* Connecting line */}
                {!isLast && (
                  <div
                    className="flex-1 w-0.5 min-h-2 mt-1 rounded-full"
                    style={{
                      backgroundColor: isCompleted ? `${color}35` : `${color}25`,
                    }}
                  />
                )}
              </div>

              {/* Stop card + actions */}
              <div className="flex-1 pb-3 min-w-0">
                {/* ─── Completed stop — two-line, tappable ─── */}
                {isCompleted ? (
                  <div>
                    <button
                      type="button"
                      className="w-full rounded-lg border border-border/50 bg-card px-3 py-2 opacity-55 hover:opacity-75 transition-opacity text-left"
                      onClick={() => setExpandedStopId(expandedStopId === stop.id ? null : stop.id)}
                    >
                      {/* Line 1: Label + time */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground truncate flex-1">
                          {actionLabel}
                          {stop.stopName ? ` — ${stop.stopName}` : stop.stopCity ? ` — ${stop.stopCity}` : ''}
                        </span>
                        {stop.completedAt && (
                          <span className="text-2xs text-muted-foreground shrink-0 tabular-nums">
                            {formatTime(stop.completedAt)}
                          </span>
                        )}
                      </div>
                      {/* Line 2: Location + doc badge */}
                      <div className="flex items-center gap-2 mt-1">
                        {(stop.stopCity || stop.stopState) && (
                          <span className="text-2xs text-muted-foreground truncate flex-1">
                            {[stop.stopCity, stop.stopState].filter(Boolean).join(', ')}
                          </span>
                        )}
                        {hasDoc ? (
                          <span className="text-2xs font-medium text-green-400 bg-green-400/10 rounded-full px-2 py-0.5 shrink-0">
                            ✓ {stop.actionType === 'pickup' ? 'BOL' : 'POD'}
                          </span>
                        ) : docBadge ? (
                          <span className="text-2xs font-medium text-yellow-400 bg-yellow-400/10 rounded-full px-2 py-0.5 shrink-0">
                            ● Docs needed
                          </span>
                        ) : null}
                        <ChevronDown
                          className={cn(
                            'h-3 w-3 text-muted-foreground shrink-0 transition-transform',
                            expandedStopId === stop.id && 'rotate-180',
                          )}
                        />
                      </div>
                    </button>

                    {/* Expanded details + documents */}
                    {expandedStopId === stop.id && (
                      <div className="mt-1 rounded-lg border border-border/60 bg-card/50 overflow-hidden">
                        {/* Stop details — compact grid */}
                        <div className="px-3 py-2.5 space-y-1">
                          {stop.stopName && <p className="text-xs font-medium text-foreground">{stop.stopName}</p>}
                          {stop.stopAddress && <p className="text-[11px] text-muted-foreground">{stop.stopAddress}</p>}
                          {(stop.stopCity || stop.stopState) && !stop.stopAddress && (
                            <p className="text-[11px] text-muted-foreground">
                              {[stop.stopCity, stop.stopState].filter(Boolean).join(', ')}
                            </p>
                          )}
                          <div className="flex gap-4 text-[11px] text-muted-foreground pt-0.5">
                            {stop.arrivedAt && <span>Arrived {formatTime(stop.arrivedAt)}</span>}
                            {stop.completedAt && <span>Done {formatTime(stop.completedAt)}</span>}
                          </div>
                        </div>

                        {/* Documents section */}
                        <div className="border-t border-border/50 px-3 py-2.5 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-2xs font-semibold text-muted-foreground uppercase tracking-wide">
                              Documents
                            </p>
                            {hasDoc && (
                              <span className="text-2xs font-medium text-green-500 dark:text-green-400 bg-green-500/10 rounded-full px-2 py-0.5">
                                ✓ {stop.actionType === 'pickup' ? 'BOL' : 'POD'}
                              </span>
                            )}
                          </div>
                          <DocUploadInline
                            stopId={String(stop.id)}
                            loadId={load?.loadNumber ?? ''}
                            documentType={stop.actionType === 'pickup' ? 'BOL' : 'POD'}
                            isAdditional={hasDoc}
                            onUploaded={() => onStopComplete?.()}
                            onSkip={() => setExpandedStopId(null)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* ─── Active / upcoming stop ─── */
                  <div
                    className={cn(
                      'rounded-xl border bg-card transition-all overflow-hidden',
                      isActive && 'border-l-[3px]',
                      !isActive && 'opacity-55',
                    )}
                    style={{
                      borderColor: isActive ? undefined : 'var(--border)',
                      borderLeftColor: isActive ? color : undefined,
                      boxShadow: isActive ? `0 0 12px ${color}15` : undefined,
                    }}
                  >
                    <div className="p-3">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className={cn('font-medium text-foreground', isActive ? 'text-sm' : 'text-xs')}>
                            {actionLabel}
                            {stop.stopName ? ` — ${stop.stopName}` : ''}
                          </p>
                          {(stop.stopCity || stop.stopAddress) && (
                            <p className="text-xs text-muted-foreground truncate">
                              {stop.stopAddress ?? `${stop.stopCity}${stop.stopState ? `, ${stop.stopState}` : ''}`}
                            </p>
                          )}
                          {(stop.earliestArrival || stop.latestArrival) && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {stop.earliestArrival && stop.latestArrival
                                ? `${stop.earliestArrival} – ${stop.latestArrival}`
                                : stop.earliestArrival
                                  ? `After ${stop.earliestArrival}`
                                  : `Before ${stop.latestArrival}`}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Active stop: completion actions INSIDE the card */}
                      {isActive && load?.loadNumber && (
                        <div className="mt-3 pt-3 border-t border-border/50">
                          <StopActionInline stop={stop} loadId={load.loadNumber} isActive />
                          {/* Lumper status cards */}
                          {moneyCodes
                            ?.filter((mc) => mc.stopId === stop.id || (!mc.stopId && mc.loadId === load.id))
                            .map((mc) => (
                              <div key={mc.moneyCodeId} className="mt-2">
                                <LumperStatusCard
                                  moneyCode={mc}
                                  loadId={load.loadNumber}
                                  onUploadReceipt={() => setReceiptTarget(mc)}
                                />
                              </div>
                            ))}
                          {/* Lumper nudge for delivery stops without active requests */}
                          {stop.actionType === 'delivery' &&
                            !moneyCodes?.some(
                              (mc) =>
                                ['REQUESTED', 'APPROVED'].includes(mc.status) &&
                                (mc.stopId === stop.id || (!mc.stopId && mc.loadId === load.id)),
                            ) && (
                              <div className="mt-2">
                                <StopNudge type="lumper" onAction={() => onDriverAction?.('lumper')} />
                              </div>
                            )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Receipt upload modal */}
      {receiptTarget && (
        <ReceiptUpload
          open={!!receiptTarget}
          onOpenChange={(open) => {
            if (!open) setReceiptTarget(null);
          }}
          loadId={load.loadNumber}
          loadDbId={load.id}
          stopId={receiptTarget.stopId}
          moneyCodeId={receiptTarget.moneyCodeId}
          prefilledAmountCents={receiptTarget.amountCents}
        />
      )}
    </>
  );
}

// ─── TripTimeline (public export) ─────────────────────────────────────────────

export function TripTimeline({ load, plan, driveHoursRemaining, currentStop, onStopComplete, onDriverAction }: Props) {
  if (plan?.segments?.length) {
    return (
      <SmartTimeline
        load={load}
        plan={plan}
        driveHoursRemaining={driveHoursRemaining}
        currentStop={currentStop}
        onDriverAction={onDriverAction}
      />
    );
  }

  return <ManualTimeline load={load} onStopComplete={onStopComplete} onDriverAction={onDriverAction} />;
}

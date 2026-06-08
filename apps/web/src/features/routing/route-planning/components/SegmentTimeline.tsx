'use client';

import { useRef, useEffect } from 'react';
import { Badge } from '@sally/ui/components/ui/badge';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { HOSProgressBars } from './HOSProgressBars';
import { DecisionReason } from './DecisionReason';
import { formatHours } from './plan-utils';
import type { RouteSegment, DayBreakdown } from '@/features/routing/route-planning';
import { formatDurationHours as formatDuration } from '@/shared/lib/format-time';
import { useFormatters } from '@/shared/providers/PreferencesProvider';

interface SegmentTimelineProps {
  segments: RouteSegment[];
  planStatus?: string;
  planId?: string;
  selectedSegmentId?: string | null;
  onSegmentSelect?: (segmentId: string | null) => void;
  onSegmentHover?: (segmentId: string | null) => void;
  dailyBreakdown?: DayBreakdown[];
}

function getDotColor(type: string): string {
  switch (type) {
    case 'dock':
      return 'bg-foreground';
    case 'rest':
      return 'bg-violet-500 dark:bg-violet-400';
    case 'fuel':
      return 'bg-caution';
    case 'break':
      return 'bg-emerald-500 dark:bg-emerald-400';
    case 'wait':
      return 'bg-slate-400 dark:bg-slate-500';
    default:
      return 'bg-muted-foreground';
  }
}

function getDotRing(type: string): string {
  switch (type) {
    case 'dock':
      return 'ring-2 ring-foreground/20';
    default:
      return '';
  }
}

/**
 * Day separator shown between segments that cross midnight
 */
function DaySeparator({ day }: { day: DayBreakdown }) {
  return (
    <div className="flex items-center gap-2.5 my-3 px-3">
      <div className="flex-1 h-px bg-border" />
      <span className="text-[11px] font-semibold text-accent uppercase tracking-wider whitespace-nowrap px-2.5 py-0.5 bg-accent/10 rounded">
        Day {day.day} — {day.date}
      </span>
      <span className="text-2xs text-muted-foreground whitespace-nowrap">
        {formatHours(day.driveHours)} drive · {formatHours(day.onDutyHours)} duty
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

function DriveConnector({ segment, isDeadhead }: { segment: RouteSegment; isDeadhead?: boolean }) {
  return (
    <div className="grid grid-cols-[60px_12px_1fr] gap-x-3 items-center py-1.5 px-3">
      {/* Empty time column */}
      <div />

      {/* Timeline line through center */}
      <div className="flex justify-center h-full">
        <div className="w-px bg-border" />
      </div>

      {/* Drive info */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <div className="flex-1 border-t border-dashed border-border" />
        {isDeadhead && (
          <Badge variant="outline" className="text-2xs px-1.5 py-0 uppercase tracking-wider">
            Deadhead
          </Badge>
        )}
        <span>{segment.distanceMiles?.toLocaleString(undefined, { maximumFractionDigits: 0 })} mi</span>
        <span>&middot;</span>
        <span>{formatDuration(segment.driveTimeHours || 0)}</span>
        <div className="flex-1 border-t border-dashed border-border" />
      </div>
    </div>
  );
}

function StopSegment({
  segment,
  isFirst,
  isLast,
  planStatus,
  planId,
}: {
  segment: RouteSegment;
  isFirst: boolean;
  isLast: boolean;
  planStatus?: string;
  planId?: string;
}) {
  const { formatTime, formatDate } = useFormatters();
  const time = segment.estimatedArrival ? formatTime(segment.estimatedArrival) : '';
  const date = segment.estimatedArrival ? formatDate(segment.estimatedArrival) : '';
  const isRest = segment.segmentType === 'rest';
  const isBreak = segment.segmentType === 'break';

  // Always show compact HOS bars (Task 15: remove isHOSMeaningful gate)
  const hosState = segment.hosStateAfter;

  return (
    <div className="grid grid-cols-[60px_12px_1fr] gap-x-3 py-3 px-3 rounded-lg hover:bg-muted/30 transition-colors">
      {/* Time column */}
      <div className="flex-shrink-0 text-right pt-px">
        <div className="text-xs font-medium text-foreground tabular-nums leading-none">{time}</div>
        <div className="text-2xs text-muted-foreground mt-1">{date}</div>
      </div>

      {/* Dot + timeline line */}
      <div className="flex flex-col items-center">
        <div className={`flex-1 w-px ${isFirst ? 'bg-transparent' : 'bg-border'}`} />
        <div
          className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${getDotColor(segment.segmentType)} ${getDotRing(segment.segmentType)}`}
        />
        <div className={`flex-1 w-px ${isLast ? 'bg-transparent' : 'bg-border'}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Dock segments */}
        {segment.segmentType === 'dock' && (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-2xs px-1.5 py-0 uppercase tracking-wider">
                {segment.actionType || 'stop'}
              </Badge>
              <span className="text-sm font-medium text-foreground">{segment.toLocation}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {segment.customerName && `${segment.customerName} \u00B7 `}
              {formatDuration(segment.dockDurationHours || 0)} dock
              {segment.isDocktimeConverted && (
                <Badge variant="muted" className="text-2xs px-1 py-0 ml-2">
                  counts as rest
                </Badge>
              )}
            </div>
            {/* Appointment window + schedule risk */}
            {segment.appointmentWindow && (
              <div className="text-2xs text-muted-foreground mt-1">
                Window {formatTime(segment.appointmentWindow.start)}–{formatTime(segment.appointmentWindow.end)}
                {segment.arrivalBufferMinutes != null && (
                  <span
                    className={
                      segment.arrivalBufferMinutes < 0
                        ? 'text-critical font-medium'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }
                  >
                    {' \u00B7 '}
                    {segment.arrivalBufferMinutes < 0
                      ? `${Math.abs(segment.arrivalBufferMinutes)}m late`
                      : `${segment.arrivalBufferMinutes}m slack`}
                  </span>
                )}
              </div>
            )}
            {segment.isDocktimeConverted && (
              <div className="text-xs text-muted-foreground mt-1 italic border-l-2 border-border pl-2">
                SALLY: Dock time qualifies as off-duty. Credited toward rest requirements.
              </div>
            )}
          </>
        )}

        {/* Wait segments (arrived before the appointment window opens) */}
        {segment.segmentType === 'wait' && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {formatDuration(segment.restDurationHours || 0)} Wait
              </span>
              <span className="text-xs text-muted-foreground">{segment.customerName || segment.toLocation}</span>
            </div>
            {segment.restReason && (
              <div className="text-xs text-muted-foreground mt-1 italic border-l-2 border-border pl-2">
                SALLY: {segment.restReason}
              </div>
            )}
          </>
        )}

        {/* Rest segments */}
        {segment.segmentType === 'rest' && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {formatDuration(segment.restDurationHours || 0)} Rest
              </span>
              <span className="text-xs text-muted-foreground">{segment.toLocation || 'Rest Area'}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">{segment.restType?.replace(/_/g, ' ')}</div>
            {segment.restReason && (
              <div className="text-xs text-muted-foreground mt-1 italic border-l-2 border-border pl-2">
                SALLY: {segment.restReason}
              </div>
            )}
          </>
        )}

        {/* Fuel segments */}
        {segment.segmentType === 'fuel' && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {segment.fuelStationName || segment.toLocation || 'Fuel Stop'}
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {segment.fuelGallons} gal · ${segment.fuelPricePerGallon?.toFixed(2)}/gal · $
              {segment.fuelCostEstimate?.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
              {segment.detourMiles != null && segment.detourMiles > 0 && (
                <span> · {segment.detourMiles.toFixed(1)} mi detour</span>
              )}
            </div>
          </>
        )}

        {/* Break segments */}
        {segment.segmentType === 'break' && (
          <>
            <div className="text-sm font-medium text-foreground">Mandatory Break</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {formatDuration(segment.restDurationHours || 0.5)}
            </div>
            {segment.restReason && (
              <div className="text-xs text-muted-foreground mt-1 italic border-l-2 border-border pl-2">
                SALLY: {segment.restReason}
              </div>
            )}
          </>
        )}

        {/* Final stop indicator */}
        {isLast && segment.segmentType === 'dock' && (
          <div className="text-xs text-muted-foreground mt-1 font-medium">
            {planStatus === 'completed' ? 'Route complete' : 'Final stop'}
          </div>
        )}

        {/* HOS — always show compact bars (Task 15) */}
        {hosState && (
          <HOSProgressBars
            hosState={hosState}
            segmentType={segment.segmentType}
            isReset={isRest || isBreak}
            showCycle={segment.segmentType === 'rest' || isLast}
          />
        )}

        {/* Decision Reason — for rest/fuel/break/dock-converted segments (Task 16) */}
        {(segment.segmentType === 'rest' ||
          segment.segmentType === 'fuel' ||
          segment.segmentType === 'break' ||
          (segment.segmentType === 'dock' && segment.isDocktimeConverted)) &&
          planId && <DecisionReason segment={segment} planId={planId} />}
      </div>
    </div>
  );
}

export function SegmentTimeline({
  segments,
  planStatus,
  planId,
  selectedSegmentId,
  onSegmentSelect,
  onSegmentHover,
  dailyBreakdown,
}: SegmentTimelineProps) {
  const segmentRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!selectedSegmentId) return;
    const el = segmentRefs.current[selectedSegmentId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedSegmentId]);

  // Build day boundary map for day separators
  const dayBoundaries = new Map<number, DayBreakdown>();
  if (dailyBreakdown && dailyBreakdown.length > 1) {
    // Map segment indices to days by looking at segment dates
    let currentDayIdx = 0;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (!seg.estimatedArrival) continue;

      const segDate = seg.estimatedArrival.split('T')[0];
      while (currentDayIdx < dailyBreakdown.length - 1 && dailyBreakdown[currentDayIdx + 1]?.date <= segDate) {
        currentDayIdx++;
      }

      // Check if this segment crosses into a new day compared to previous
      if (i > 0 && segments[i - 1]?.estimatedArrival) {
        const prevDate = segments[i - 1].estimatedArrival.split('T')[0];
        if (segDate !== prevDate && dailyBreakdown[currentDayIdx]) {
          dayBoundaries.set(i, dailyBreakdown[currentDayIdx]);
        }
      }
    }
  }

  const items: Array<{
    type: 'stop' | 'drive' | 'day-separator';
    segment: RouteSegment;
    isFirst: boolean;
    isLast: boolean;
    isDeadhead?: boolean;
    day?: DayBreakdown;
  }> = [];

  // Build items from non-drive perspective to track first/last stop
  const stopIndices: number[] = [];
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].segmentType !== 'drive') stopIndices.push(i);
  }

  // Deadhead = first drive segment of the plan whose next stop is a pickup.
  // (The simulator inserts the driver's current location → first pickup as the
  // opening drive segment.)
  let firstDriveIdx = -1;
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].segmentType === 'drive') {
      firstDriveIdx = i;
      break;
    }
  }
  const nextStop = firstDriveIdx >= 0 ? segments.slice(firstDriveIdx + 1).find((s) => s.segmentType === 'dock') : null;
  const firstDriveIsDeadhead = firstDriveIdx >= 0 && nextStop?.actionType === 'pickup';

  for (let i = 0; i < segments.length; i++) {
    // Insert day separator if needed
    const daySep = dayBoundaries.get(i);
    if (daySep) {
      items.push({
        type: 'day-separator',
        segment: segments[i],
        isFirst: false,
        isLast: false,
        day: daySep,
      });
    }

    const seg = segments[i];
    const isLastStop = seg.segmentType !== 'drive' && i === stopIndices[stopIndices.length - 1];
    const isFirstStop = seg.segmentType !== 'drive' && i === stopIndices[0];

    if (seg.segmentType === 'drive') {
      items.push({
        type: 'drive',
        segment: seg,
        isFirst: false,
        isLast: false,
        isDeadhead: firstDriveIsDeadhead && i === firstDriveIdx,
      });
    } else {
      items.push({
        type: 'stop',
        segment: seg,
        isFirst: isFirstStop,
        isLast: isLastStop,
      });
    }
  }

  return (
    <Card>
      <CardContent className="py-4 px-2 md:px-4">
        {items.map((item) => {
          if (item.type === 'day-separator' && item.day) {
            return <DaySeparator key={`day-${item.day.day}`} day={item.day} />;
          }

          return item.type === 'drive' ? (
            <div
              key={item.segment.segmentId}
              ref={(el) => {
                segmentRefs.current[item.segment.segmentId] = el;
              }}
              onClick={() => onSegmentSelect?.(item.segment.segmentId)}
              onMouseEnter={() => onSegmentHover?.(item.segment.segmentId)}
              onMouseLeave={() => onSegmentHover?.(null)}
              className={`cursor-pointer rounded transition-colors duration-300 ${
                selectedSegmentId === item.segment.segmentId ? 'bg-accent/50' : 'hover:bg-accent/20'
              }`}
            >
              <DriveConnector segment={item.segment} isDeadhead={item.isDeadhead} />
            </div>
          ) : (
            <div
              key={item.segment.segmentId}
              ref={(el) => {
                segmentRefs.current[item.segment.segmentId] = el;
              }}
              onClick={() => onSegmentSelect?.(item.segment.segmentId)}
              onMouseEnter={() => onSegmentHover?.(item.segment.segmentId)}
              onMouseLeave={() => onSegmentHover?.(null)}
              className={`cursor-pointer rounded-lg transition-colors duration-300 ${
                selectedSegmentId === item.segment.segmentId
                  ? 'bg-accent/50 ring-1 ring-primary/30'
                  : 'hover:bg-accent/20'
              }`}
            >
              <StopSegment
                segment={item.segment}
                isFirst={item.isFirst}
                isLast={item.isLast}
                planStatus={planStatus}
                planId={planId}
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

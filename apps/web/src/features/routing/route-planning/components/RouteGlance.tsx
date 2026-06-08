'use client';

import { useMemo } from 'react';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@sally/ui/components/ui/tooltip';
import type { RouteSegment } from '@/features/routing/route-planning';
import { formatDurationHours as formatDuration } from '@/shared/lib/format-time';

interface RouteGlanceProps {
  segments: RouteSegment[];
  onSegmentSelect?: (segmentId: string) => void;
}

function getSegmentColor(type: string, actionType?: string): string {
  switch (type) {
    case 'drive':
      return 'bg-blue-600 dark:bg-blue-500';
    case 'dock':
      if (actionType === 'pickup') return 'bg-emerald-600 dark:bg-emerald-500';
      if (actionType === 'delivery') return 'bg-red-500 dark:bg-red-400';
      return 'bg-gray-600 dark:bg-gray-400';
    case 'rest':
      return 'bg-violet-600 dark:bg-violet-500';
    case 'fuel':
      return 'bg-amber-500 dark:bg-amber-400';
    case 'break':
      return 'bg-teal-600 dark:bg-teal-500';
    default:
      return 'bg-muted-foreground';
  }
}

function getSegmentLabel(segment: RouteSegment): string {
  switch (segment.segmentType) {
    case 'dock':
      return segment.actionType?.toUpperCase() === 'PICKUP'
        ? 'PU'
        : segment.actionType?.toUpperCase() === 'DELIVERY'
          ? 'DEL'
          : segment.actionType?.toUpperCase() || 'STOP';
    case 'drive':
      return 'DRIVE';
    case 'rest':
      return 'REST';
    case 'fuel':
      return '\u26FD';
    case 'break':
      return 'BRK';
    default:
      return '';
  }
}

function getSegmentDuration(segment: RouteSegment): number {
  switch (segment.segmentType) {
    case 'drive':
      return segment.driveTimeHours || 0;
    case 'rest':
      return segment.restDurationHours || 0;
    case 'dock':
      return segment.dockDurationHours || 0;
    case 'fuel':
      return 0.5; // Typical fuel stop
    case 'break':
      return segment.restDurationHours || 0.5;
    default:
      return 0;
  }
}

function getTooltipContent(segment: RouteSegment): string {
  switch (segment.segmentType) {
    case 'drive':
      return `Drive ${segment.distanceMiles?.toLocaleString(undefined, { maximumFractionDigits: 0 })} mi \u00B7 ${formatDuration(segment.driveTimeHours || 0)}`;
    case 'dock':
      return `${segment.actionType?.toUpperCase() || 'Stop'}: ${segment.toLocation || 'Unknown'} \u00B7 ${formatDuration(segment.dockDurationHours || 0)}`;
    case 'rest':
      return `Rest ${formatDuration(segment.restDurationHours || 0)} \u00B7 ${segment.toLocation || 'Rest Area'}`;
    case 'fuel':
      return `Fuel: ${segment.fuelStationName || segment.toLocation || 'Fuel Stop'} \u00B7 $${segment.fuelCostEstimate?.toFixed(2) || '0'}`;
    case 'break':
      return `30-min Break`;
    default:
      return '';
  }
}

const LEGEND_ITEMS = [
  { label: 'Drive', color: 'bg-blue-600 dark:bg-blue-500' },
  { label: 'Pickup', color: 'bg-emerald-600 dark:bg-emerald-500' },
  { label: 'Delivery', color: 'bg-red-500 dark:bg-red-400' },
  { label: 'Rest', color: 'bg-violet-600 dark:bg-violet-500' },
  { label: 'Fuel', color: 'bg-amber-500 dark:bg-amber-400' },
  { label: 'Break', color: 'bg-teal-600 dark:bg-teal-500' },
];

export function RouteGlance({ segments, onSegmentSelect }: RouteGlanceProps) {
  const totalDuration = useMemo(() => segments.reduce((sum, s) => sum + getSegmentDuration(s), 0), [segments]);

  if (segments.length === 0 || totalDuration === 0) return null;

  return (
    <Card>
      <CardContent className="py-3 px-4">
        <div className="text-2xs uppercase tracking-wider text-muted-foreground font-medium mb-2.5">Route Timeline</div>

        {/* Proportional bar */}
        <div className="flex h-7 rounded overflow-hidden gap-px cursor-pointer">
          {segments.map((segment) => {
            const duration = getSegmentDuration(segment);
            const widthPercent = (duration / totalDuration) * 100;

            // Skip very tiny segments for visual clarity
            if (widthPercent < 0.5) return null;

            return (
              <Tooltip key={segment.segmentId}>
                <TooltipTrigger asChild>
                  <div
                    className={`${getSegmentColor(
                      segment.segmentType,
                      segment.actionType,
                    )} flex items-center justify-center text-[9px] font-medium uppercase tracking-wide text-white dark:text-white/80 hover:opacity-80 transition-opacity overflow-hidden`}
                    style={{ width: `${widthPercent}%`, minWidth: '2px' }}
                    onClick={() => onSegmentSelect?.(segment.segmentId)}
                  >
                    {widthPercent > 4 && <span className="truncate px-0.5">{getSegmentLabel(segment)}</span>}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {getTooltipContent(segment)}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex gap-3.5 mt-2 flex-wrap">
          {LEGEND_ITEMS.map((item) => (
            <div key={item.label} className="flex items-center gap-1.5 text-2xs text-muted-foreground">
              <div className={`w-2 h-2 rounded-sm ${item.color}`} />
              {item.label}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

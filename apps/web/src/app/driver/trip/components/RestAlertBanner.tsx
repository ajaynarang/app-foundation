'use client';

import { useMemo } from 'react';
import { Moon } from 'lucide-react';
import { formatDurationHours } from '@/shared/lib/format-time';
import { SEGMENT_STATUS, SEGMENT_TYPE } from '../lib/constants';
import type { RoutePlanResult, RouteSegment } from '@/features/routing/route-planning';

interface RestAlertBannerProps {
  plan: RoutePlanResult;
  activeSegmentId?: string;
}

export function RestAlertBanner({ plan, activeSegmentId }: RestAlertBannerProps) {
  const alert = useMemo(() => {
    if (!plan?.segments?.length) return null;

    const sorted = [...(plan.segments as RouteSegment[])].sort((a, b) => a.sequenceOrder - b.sequenceOrder);

    // Find active segment index
    const activeIdx = activeSegmentId
      ? sorted.findIndex((s) => s.segmentId === activeSegmentId)
      : sorted.findIndex((s) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const status = (s as any).status;
          return (
            status === SEGMENT_STATUS.IN_PROGRESS ||
            (status !== SEGMENT_STATUS.COMPLETED && status !== SEGMENT_STATUS.SKIPPED)
          );
        });

    if (activeIdx < 0) return null;

    // Walk forward from active segment, accumulating drive hours
    let driveHours = 0;
    let driveMiles = 0;

    for (let i = activeIdx; i < sorted.length; i++) {
      const seg = sorted[i];

      if (seg.segmentType === SEGMENT_TYPE.REST || seg.segmentType === SEGMENT_TYPE.BREAK) {
        // Found the next rest/break — check if within 3h of driving
        if (driveHours <= 3 && driveHours > 0) {
          const label =
            seg.segmentType === SEGMENT_TYPE.BREAK
              ? `${Math.round((seg.restDurationHours ?? 0.5) * 60)}-min Break`
              : 'Rest Stop';
          const location = seg.fuelStationName || seg.toLocation || '';
          return {
            label,
            location,
            driveHours,
            driveMiles: Math.round(driveMiles),
          };
        }
        return null; // Beyond 3h, no need to alert
      }

      if (seg.segmentType === 'drive') {
        driveHours += seg.driveTimeHours ?? 0;
        driveMiles += seg.distanceMiles ?? 0;
      }
      // dock/fuel segments don't add drive time, just skip
    }

    return null;
  }, [plan?.segments, activeSegmentId]);

  if (!alert) return null;

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-violet-500/20 bg-gradient-to-r from-violet-500/5 to-transparent px-3 py-2.5">
      <Moon className="h-4 w-4 text-violet-400 shrink-0" />
      <p className="text-xs text-foreground">
        <span className="font-medium">{alert.label}</span>
        {' in '}
        <span className="font-medium tabular-nums">{formatDurationHours(alert.driveHours)}</span>
        {alert.driveMiles > 0 && <span className="text-muted-foreground"> ({alert.driveMiles} mi)</span>}
        {alert.location && <span className="text-muted-foreground"> at {alert.location}</span>}
      </p>
    </div>
  );
}

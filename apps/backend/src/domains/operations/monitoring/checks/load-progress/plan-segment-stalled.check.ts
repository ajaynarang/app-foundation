import { MonitoringCheck, LoadCheckContext, MonitoringTrigger } from '../../monitoring.types';

export class PlanSegmentStalledCheck implements MonitoringCheck {
  id = 'plan_segment_stalled';
  displayName = 'Plan Segment Stalled';
  category = 'load_progress' as const;
  needs = ['route_plan_data', 'gps_data'];
  scope = 'per-load' as const;
  defaultThresholds = { segmentStalledMultiplier: 2 };
  autoResolve = true;
  severity = 'high' as const;

  run(context: LoadCheckContext, thresholds: Record<string, number>): MonitoringTrigger | null {
    const { activePlan, load, driver } = context;
    if (!activePlan?.currentSegment) return null;

    const seg = activePlan.currentSegment;

    // Skip dock segments (variable duration)
    if (seg.segmentType === 'dock') return null;

    if (!seg.estimatedDeparture) return null;

    // Determine expected duration based on segment type
    let expectedDurationHours: number | null = null;
    if (seg.segmentType === 'drive' && seg.driveTimeHours) {
      expectedDurationHours = seg.driveTimeHours;
    } else if ((seg.segmentType === 'rest' || seg.segmentType === 'break') && seg.restDurationHours) {
      expectedDurationHours = seg.restDurationHours;
    } else if (seg.segmentType === 'fuel') {
      expectedDurationHours = 0.5; // 30 min default for fuel
    }

    if (!expectedDurationHours || expectedDurationHours <= 0) return null;

    const segStartTime = new Date(seg.estimatedDeparture).getTime();
    const elapsedMs = Date.now() - segStartTime;
    const expectedMs = expectedDurationHours * 60 * 60 * 1000;
    const multiplier = thresholds.segmentStalledMultiplier ?? this.defaultThresholds.segmentStalledMultiplier;

    if (elapsedMs > expectedMs * multiplier) {
      const elapsedMinutes = Math.round(elapsedMs / (60 * 1000));
      const expectedMinutes = Math.round(expectedDurationHours * 60);
      const overageMinutes = elapsedMinutes - expectedMinutes;

      return {
        type: 'PLAN_SEGMENT_STALLED',
        severity: this.severity,
        requiresReplan: true,
        etaImpactMinutes: overageMinutes,
        params: {
          loadId: load.loadNumber,
          driverName: driver.name,
          planId: activePlan.planId,
          segmentId: seg.segmentId,
          segmentType: seg.segmentType,
          elapsedMinutes,
          expectedMinutes,
          overageMinutes,
          fromLocation: seg.fromLocation ?? 'unknown',
          toLocation: seg.toLocation ?? 'unknown',
        },
      };
    }

    return null;
  }
}

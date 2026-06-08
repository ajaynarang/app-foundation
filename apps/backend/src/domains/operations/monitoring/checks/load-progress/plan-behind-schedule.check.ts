import { RouteSegmentStatus } from '@prisma/client';
import { MonitoringCheck, LoadCheckContext, MonitoringTrigger } from '../../monitoring.types';

export class PlanBehindScheduleCheck implements MonitoringCheck {
  id = 'plan_behind_schedule';
  displayName = 'Plan Behind Schedule';
  category = 'load_progress' as const;
  needs = ['route_plan_data', 'gps_data'];
  scope = 'per-load' as const;
  defaultThresholds = {
    behindScheduleWarningMinutes: 30,
    behindScheduleCriticalMinutes: 60,
  };
  autoResolve = true;
  severity = 'medium' as const;

  run(context: LoadCheckContext, thresholds: Record<string, number>): MonitoringTrigger | null {
    const { activePlan, load, driver } = context;
    if (!activePlan) return null;

    const currentOrNext = activePlan.currentSegment ?? activePlan.nextSegment;
    if (!currentOrNext?.estimatedArrival) return null;

    const expectedArrival = new Date(currentOrNext.estimatedArrival).getTime();
    const delayMinutes = (Date.now() - expectedArrival) / (60 * 1000);

    const warningThreshold =
      thresholds.behindScheduleWarningMinutes ?? this.defaultThresholds.behindScheduleWarningMinutes;
    const criticalThreshold =
      thresholds.behindScheduleCriticalMinutes ?? this.defaultThresholds.behindScheduleCriticalMinutes;

    if (delayMinutes < warningThreshold) return null;

    // Dedup: suppress if near dock segment (let appointment_at_risk handle)
    const nextDock = activePlan.segments.find(
      (s) =>
        s.segmentType === 'dock' &&
        (s.status === RouteSegmentStatus.PLANNED || s.status === RouteSegmentStatus.IN_PROGRESS),
    );
    if (nextDock?.estimatedArrival) {
      const currentOrNextIndex = activePlan.segments.findIndex((s) => s.segmentId === currentOrNext.segmentId);
      const nextDockIndex = activePlan.segments.findIndex((s) => s.segmentId === nextDock.segmentId);
      const isDelayAboutDock = currentOrNext.segmentType === 'dock' || currentOrNextIndex > nextDockIndex - 2;
      if (isDelayAboutDock) return null;
    }

    return {
      type: 'PLAN_BEHIND_SCHEDULE',
      severity: delayMinutes >= criticalThreshold ? 'critical' : 'medium',
      requiresReplan: delayMinutes >= criticalThreshold,
      etaImpactMinutes: Math.round(delayMinutes),
      params: {
        loadId: load.loadNumber,
        driverName: driver.name,
        planId: activePlan.planId,
        segmentId: currentOrNext.segmentId,
        segmentType: currentOrNext.segmentType,
        delayMinutes: Math.round(delayMinutes),
        expectedArrival: new Date(expectedArrival).toISOString(),
      },
    };
  }
}

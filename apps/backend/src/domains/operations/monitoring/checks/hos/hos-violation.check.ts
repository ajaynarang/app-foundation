import { MonitoringCheck, DriverCheckContext, MonitoringTrigger } from '../../monitoring.types';
import { HOS_CONSTANTS } from '@sally/shared-types';

export class HosViolationCheck implements MonitoringCheck {
  id = 'hos_violation';
  displayName = 'HOS Violation';
  category = 'hos_compliance' as const;
  needs = ['hos_data'];
  scope = 'per-driver' as const;
  defaultThresholds = {};
  autoResolve = false;
  severity = 'critical' as const;

  run(context: DriverCheckContext, _thresholds: Record<string, number>): MonitoringTrigger | null {
    const { hosData, driver } = context;
    if (!hosData) return null;

    // Standard HOS limits (hours)
    const DRIVE_LIMIT = HOS_CONSTANTS.MAX_DRIVE_HOURS;
    const SHIFT_LIMIT = HOS_CONSTANTS.MAX_DUTY_HOURS;
    const CYCLE_LIMIT = HOS_CONSTANTS.MAX_CYCLE_HOURS;

    const violations: string[] = [];
    if (hosData.driveTimeRemainingMs <= 0) violations.push('drive');
    if (hosData.shiftTimeRemainingMs <= 0) violations.push('duty');
    if (hosData.cycleTimeRemainingMs <= 0) violations.push('cycle');

    if (violations.length > 0) {
      // Use the first (most critical) violation for the message
      const primary = violations[0];
      const limitMap: Record<string, { remaining: number; limit: number }> = {
        drive: { remaining: hosData.driveTimeRemainingMs, limit: DRIVE_LIMIT },
        duty: { remaining: hosData.shiftTimeRemainingMs, limit: SHIFT_LIMIT },
        cycle: { remaining: hosData.cycleTimeRemainingMs, limit: CYCLE_LIMIT },
      };
      const info = limitMap[primary];
      const currentHours = (info.limit + info.remaining / 3_600_000).toFixed(1);

      return {
        type: 'HOS_VIOLATION',
        severity: this.severity,
        requiresReplan: true,
        etaImpactMinutes: 600,
        params: {
          driverId: driver.driverId,
          driverName: driver.name,
          violationTypes: violations,
          hoursType: primary === 'drive' ? 'driving' : primary,
          currentHours,
          limitHours: info.limit,
        },
      };
    }

    // Plan-aware: check if remaining drive hours are insufficient for next drive segment
    if (context.driverActivePlan?.nextDriveSegment && hosData) {
      const nextSeg = context.driverActivePlan.nextDriveSegment;
      if (nextSeg.driveTimeHours) {
        const remainingDriveHours = hosData.driveTimeRemainingMs / 3_600_000;
        if (remainingDriveHours > 0 && remainingDriveHours < nextSeg.driveTimeHours) {
          return {
            type: 'HOS_VIOLATION',
            severity: 'high',
            requiresReplan: true,
            etaImpactMinutes: Math.round((nextSeg.driveTimeHours - remainingDriveHours) * 60),
            params: {
              driverId: driver.driverId,
              driverName: driver.name,
              hoursType: 'driving',
              remainingDriveHours: remainingDriveHours.toFixed(1),
              nextSegmentDriveHours: nextSeg.driveTimeHours.toFixed(1),
              nextSegmentDestination: nextSeg.toLocation ?? 'next stop',
              planId: context.driverActivePlan.planId,
              planAware: true,
            },
          };
        }
      }
    }

    return null;
  }
}

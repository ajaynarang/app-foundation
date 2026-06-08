import { MonitoringCheck, LoadCheckContext, MonitoringTrigger } from '../../monitoring.types';
import { parseAppointmentTime } from '../utils';

export class OffPaceCheck implements MonitoringCheck {
  id = 'off_pace';
  displayName = 'Off-Pace';
  category = 'load_progress' as const;
  needs = ['gps_data'];
  scope = 'per-load' as const;
  defaultThresholds = { offPaceBufferMinutes: 30 };
  autoResolve = true;
  severity = 'medium' as const;

  run(context: LoadCheckContext, thresholds: Record<string, number>): MonitoringTrigger | null {
    const { nextPendingStop, estimatedDriveMinutes, load, driver, activePlan } = context;

    // Plan-aware pace comparison
    if (activePlan?.currentSegment) {
      const seg = activePlan.currentSegment;
      if (seg.segmentType === 'drive' && seg.estimatedDeparture && seg.driveTimeHours) {
        const segStartTime = new Date(seg.estimatedDeparture).getTime();
        const segDurationMs = seg.driveTimeHours * 60 * 60 * 1000;
        const elapsed = Date.now() - segStartTime;
        const expectedProgress = Math.min(elapsed / segDurationMs, 1);
        const actualProgress = seg.progress ?? 0;

        if (expectedProgress > 0.1 && actualProgress < expectedProgress * 0.7) {
          const deficitPercent = Math.round((1 - actualProgress / expectedProgress) * 100);
          return {
            type: 'OFF_PACE',
            severity: this.severity,
            requiresReplan: false,
            etaImpactMinutes: Math.round((expectedProgress - actualProgress) * seg.driveTimeHours * 60),
            params: {
              loadId: load.loadNumber,
              driverName: driver.name,
              segmentId: seg.segmentId,
              expectedProgress: Math.round(expectedProgress * 100),
              actualProgress: Math.round(actualProgress * 100),
              deficitPercent,
              planId: activePlan.planId,
              planAware: true,
            },
          };
        }
        return null; // Plan-aware passed, skip basic
      }
    }

    // Basic (non-plan) pace check
    if (!nextPendingStop || estimatedDriveMinutes === null) return null;
    if (!nextPendingStop.latestArrival || !nextPendingStop.appointmentDate) return null;

    const latestArrival = parseAppointmentTime(nextPendingStop.appointmentDate, nextPendingStop.latestArrival);
    if (!latestArrival) return null;

    const minutesUntilDeadline = (latestArrival.getTime() - Date.now()) / (60 * 1000);
    if (minutesUntilDeadline <= 0) return null; // missed_appointment handles this

    const buffer = thresholds.offPaceBufferMinutes ?? this.defaultThresholds.offPaceBufferMinutes;
    const paceDeficit = estimatedDriveMinutes - (minutesUntilDeadline - buffer);

    if (paceDeficit > 0 && minutesUntilDeadline > buffer) {
      return {
        type: 'OFF_PACE',
        severity: this.severity,
        requiresReplan: false,
        etaImpactMinutes: Math.round(paceDeficit),
        params: {
          loadId: load.loadNumber,
          driverName: driver.name,
          stopName: nextPendingStop.stop.name,
          estimatedDriveMinutes: Math.round(estimatedDriveMinutes),
          minutesUntilDeadline: Math.round(minutesUntilDeadline),
        },
      };
    }
    return null;
  }
}

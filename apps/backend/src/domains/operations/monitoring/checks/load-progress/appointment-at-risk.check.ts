import { RouteSegmentStatus } from '@prisma/client';
import { MonitoringCheck, LoadCheckContext, MonitoringTrigger } from '../../monitoring.types';
import { parseAppointmentTime } from '../utils';

export class AppointmentAtRiskCheck implements MonitoringCheck {
  id = 'appointment_at_risk';
  displayName = 'Appointment At Risk';
  category = 'load_progress' as const;
  needs = ['gps_data'];
  scope = 'per-load' as const;
  defaultThresholds = { appointmentAtRiskMinutes: 30 };
  autoResolve = true;
  severity = 'high' as const;

  run(context: LoadCheckContext, thresholds: Record<string, number>): MonitoringTrigger | null {
    const { nextPendingStop, estimatedDriveMinutes, load, driver, activePlan } = context;
    if (!nextPendingStop || estimatedDriveMinutes === null) return null;
    if (!nextPendingStop.latestArrival || !nextPendingStop.appointmentDate) return null;

    const latestArrival = parseAppointmentTime(nextPendingStop.appointmentDate, nextPendingStop.latestArrival);
    if (!latestArrival) return null;

    const minutesUntilDeadline = (latestArrival.getTime() - Date.now()) / (60 * 1000);

    // Plan-aware ETA: sum remaining drive + rest/fuel segments to next dock
    let effectiveEtaMinutes = estimatedDriveMinutes;
    let planAware = false;
    let planId: string | undefined;

    if (activePlan) {
      const remainingSegments = activePlan.segments.filter(
        (s) =>
          (s.status === RouteSegmentStatus.PLANNED || s.status === RouteSegmentStatus.IN_PROGRESS) &&
          (s.segmentType === 'drive' ||
            s.segmentType === 'rest' ||
            s.segmentType === 'fuel' ||
            s.segmentType === 'break'),
      );

      // Find the next dock segment to bound our sum
      const nextDockIndex = activePlan.segments.findIndex(
        (s) =>
          s.segmentType === 'dock' &&
          (s.status === RouteSegmentStatus.PLANNED || s.status === RouteSegmentStatus.IN_PROGRESS),
      );

      const segmentsBeforeNextDock =
        nextDockIndex >= 0
          ? remainingSegments.filter((s) => s.sequenceOrder < activePlan.segments[nextDockIndex].sequenceOrder)
          : remainingSegments;

      if (segmentsBeforeNextDock.length > 0) {
        let totalMinutes = 0;
        for (const seg of segmentsBeforeNextDock) {
          if (seg.segmentType === 'drive' && seg.driveTimeHours) {
            totalMinutes += seg.driveTimeHours * 60;
          } else if ((seg.segmentType === 'rest' || seg.segmentType === 'break') && seg.restDurationHours) {
            totalMinutes += seg.restDurationHours * 60;
          } else if (seg.segmentType === 'fuel') {
            totalMinutes += 30; // default fuel stop duration
          }
        }
        if (totalMinutes > 0) {
          effectiveEtaMinutes = totalMinutes;
          planAware = true;
          planId = activePlan.planId;
        }
      }
    }

    const buffer = thresholds.appointmentAtRiskMinutes ?? this.defaultThresholds.appointmentAtRiskMinutes;

    if (effectiveEtaMinutes > minutesUntilDeadline - buffer && minutesUntilDeadline > 0) {
      return {
        type: 'APPOINTMENT_AT_RISK',
        severity: this.severity,
        requiresReplan: false,
        etaImpactMinutes: Math.round(effectiveEtaMinutes - minutesUntilDeadline),
        params: {
          loadId: load.loadNumber,
          driverName: driver.name,
          stopName: nextPendingStop.stop.name,
          estimatedArrivalMinutes: Math.round(effectiveEtaMinutes),
          appointmentDeadlineMinutes: Math.round(minutesUntilDeadline),
          ...(planAware ? { planId, planAware: true } : {}),
        },
      };
    }
    return null;
  }
}

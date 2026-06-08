import { LoadStopStatusSchema } from '@sally/shared-types';
import { MonitoringCheck, LoadCheckContext, MonitoringTrigger } from '../../monitoring.types';
import { parseAppointmentTime } from '../utils';

const LOAD_STOP_STATUS = LoadStopStatusSchema.enum;

export class MissedAppointmentCheck implements MonitoringCheck {
  id = 'missed_appointment';
  displayName = 'Missed Appointment';
  category = 'load_progress' as const;
  needs = [];
  scope = 'per-load' as const;
  defaultThresholds = {};
  autoResolve = false;
  severity = 'critical' as const;

  run(context: LoadCheckContext, _thresholds: Record<string, number>): MonitoringTrigger | null {
    const { nextPendingStop, load, driver } = context;
    if (!nextPendingStop) return null;
    if (!nextPendingStop.latestArrival || !nextPendingStop.appointmentDate) return null;
    if (nextPendingStop.status === LOAD_STOP_STATUS.COMPLETED) return null;

    const latestArrival = parseAppointmentTime(nextPendingStop.appointmentDate, nextPendingStop.latestArrival);
    if (!latestArrival) return null;

    if (Date.now() > latestArrival.getTime()) {
      return {
        type: 'MISSED_APPOINTMENT',
        severity: this.severity,
        requiresReplan: true,
        etaImpactMinutes: Math.round((Date.now() - latestArrival.getTime()) / (60 * 1000)),
        params: {
          loadId: load.loadNumber,
          driverName: driver.name,
          stopName: nextPendingStop.stop.name,
          actionType: nextPendingStop.actionType,
          appointmentTime: latestArrival.toISOString(),
        },
      };
    }
    return null;
  }
}

import { LoadStopStatusSchema } from '@sally/shared-types';
import { MonitoringCheck, LoadCheckContext, MonitoringTrigger } from '../../monitoring.types';
import { parseAppointmentTime } from '../utils';

const LOAD_STOP_STATUS = LoadStopStatusSchema.enum;

export class UnconfirmedPickupCheck implements MonitoringCheck {
  id = 'unconfirmed_pickup';
  displayName = 'Unconfirmed Pickup';
  category = 'lifecycle' as const;
  needs = [];
  scope = 'per-load' as const;
  defaultThresholds = {};
  autoResolve = true;
  severity = 'medium' as const;

  run(context: LoadCheckContext, _thresholds: Record<string, number>): MonitoringTrigger | null {
    const { load, driver } = context;

    const pickupStops = load.loadStops
      .filter((s) => s.actionType === 'pickup' && s.status !== LOAD_STOP_STATUS.COMPLETED)
      .sort((a, b) => a.sequenceOrder - b.sequenceOrder);

    for (const stop of pickupStops) {
      if (!stop.appointmentDate || !stop.latestArrival) continue;

      const deadline = parseAppointmentTime(stop.appointmentDate, stop.latestArrival);
      if (!deadline) continue;

      const expectedCompletion = new Date(deadline.getTime() + stop.estimatedDockHours * 60 * 60 * 1000);

      if (Date.now() > expectedCompletion.getTime()) {
        return {
          type: 'UNCONFIRMED_PICKUP',
          severity: this.severity,
          requiresReplan: false,
          etaImpactMinutes: 0,
          params: {
            loadId: load.loadNumber,
            driverName: driver.name,
            stopName: stop.stop.name,
            actionType: 'pickup',
          },
        };
      }
    }
    return null;
  }
}

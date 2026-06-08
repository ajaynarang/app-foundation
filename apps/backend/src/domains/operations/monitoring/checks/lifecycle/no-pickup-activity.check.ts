import { MonitoringCheck, LoadCheckContext, MonitoringTrigger } from '../../monitoring.types';

export class NoPickupActivityCheck implements MonitoringCheck {
  id = 'no_pickup_activity';
  displayName = 'No Pickup Activity';
  category = 'lifecycle' as const;
  needs = [];
  scope = 'per-load' as const;
  defaultThresholds = { noPickupActivityHours: 4 };
  autoResolve = true;
  severity = 'medium' as const;

  run(context: LoadCheckContext, thresholds: Record<string, number>): MonitoringTrigger | null {
    const { load, driver } = context;

    if (load.status !== 'ASSIGNED') return null;
    if (!load.assignedAt) return null;

    const hoursSinceAssignment = (Date.now() - new Date(load.assignedAt).getTime()) / (60 * 60 * 1000);
    const threshold = thresholds.noPickupActivityHours ?? this.defaultThresholds.noPickupActivityHours;

    if (hoursSinceAssignment > threshold) {
      return {
        type: 'NO_PICKUP_ACTIVITY',
        severity: this.severity,
        requiresReplan: false,
        etaImpactMinutes: 0,
        params: {
          loadId: load.loadNumber,
          driverName: driver.name,
          hoursSinceAssignment: Math.round(hoursSinceAssignment * 10) / 10,
        },
      };
    }
    return null;
  }
}

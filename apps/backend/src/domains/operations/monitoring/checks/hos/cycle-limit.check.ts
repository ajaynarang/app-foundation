import { MonitoringCheck, DriverCheckContext, MonitoringTrigger } from '../../monitoring.types';

export class CycleLimitCheck implements MonitoringCheck {
  id = 'cycle_limit';
  displayName = 'Cycle Approaching Limit';
  category = 'hos_compliance' as const;
  needs = ['hos_data'];
  scope = 'per-driver' as const;
  defaultThresholds = { cycleApproachingHours: 5 };
  autoResolve = true;
  severity = 'medium' as const;

  run(context: DriverCheckContext, thresholds: Record<string, number>): MonitoringTrigger | null {
    const { hosData, driver } = context;
    if (!hosData) return null;

    const remainingHours = hosData.cycleTimeRemainingMs / (60 * 60 * 1000);
    const threshold = thresholds.cycleApproachingHours ?? this.defaultThresholds.cycleApproachingHours;

    if (remainingHours > 0 && remainingHours < threshold) {
      return {
        type: 'CYCLE_APPROACHING_LIMIT',
        severity: this.severity,
        requiresReplan: false,
        etaImpactMinutes: 0,
        params: {
          driverId: driver.driverId,
          driverName: driver.name,
          remainingHours: Math.round(remainingHours * 10) / 10,
        },
      };
    }
    return null;
  }
}

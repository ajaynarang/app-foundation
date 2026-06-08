import { MonitoringCheck, DriverCheckContext, MonitoringTrigger } from '../../monitoring.types';

export class DutyLimitCheck implements MonitoringCheck {
  id = 'duty_limit';
  displayName = 'Duty Limit Approaching';
  category = 'hos_compliance' as const;
  needs = ['hos_data'];
  scope = 'per-driver' as const;
  defaultThresholds = { hosApproachingMinutes: 60 };
  autoResolve = true;
  severity = 'medium' as const;

  run(context: DriverCheckContext, thresholds: Record<string, number>): MonitoringTrigger | null {
    const { hosData, driver } = context;
    if (!hosData) return null;

    const remainingMinutes = hosData.shiftTimeRemainingMs / (60 * 1000);
    const threshold = thresholds.hosApproachingMinutes ?? this.defaultThresholds.hosApproachingMinutes;

    if (remainingMinutes > 0 && remainingMinutes < threshold) {
      return {
        type: 'HOS_APPROACHING_LIMIT',
        severity: this.severity,
        requiresReplan: false,
        etaImpactMinutes: 0,
        params: {
          driverId: driver.driverId,
          driverName: driver.name,
          remainingMinutes: Math.round(remainingMinutes),
          limitType: 'duty',
        },
      };
    }
    return null;
  }
}

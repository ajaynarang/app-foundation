import { MonitoringCheck, DriverCheckContext, MonitoringTrigger } from '../../monitoring.types';

export class BreakRequiredCheck implements MonitoringCheck {
  id = 'break_required';
  displayName = 'Break Required';
  category = 'hos_compliance' as const;
  needs = ['hos_data'];
  scope = 'per-driver' as const;
  defaultThresholds = { breakRequiredHours: 8 };
  autoResolve = true;
  severity = 'high' as const;

  run(context: DriverCheckContext, _thresholds: Record<string, number>): MonitoringTrigger | null {
    const { hosData, driver } = context;
    if (!hosData) return null;

    const timeUntilBreakMinutes = hosData.timeUntilBreakMs / (60 * 1000);
    if (timeUntilBreakMinutes <= 0) {
      return {
        type: 'BREAK_REQUIRED',
        severity: this.severity,
        requiresReplan: false,
        etaImpactMinutes: 30,
        params: {
          driverId: driver.driverId,
          driverName: driver.name,
          remainingMinutes: Math.round(timeUntilBreakMinutes),
          timeUntilBreakMinutes: Math.round(timeUntilBreakMinutes),
        },
      };
    }
    return null;
  }
}

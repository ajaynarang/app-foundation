import { MonitoringCheck, LoadCheckContext, MonitoringTrigger } from '../../monitoring.types';

export class DockTimeExceededCheck implements MonitoringCheck {
  id = 'dock_time_exceeded';
  displayName = 'Dock Time Exceeded';
  category = 'load_progress' as const;
  needs = [];
  scope = 'per-load' as const;
  defaultThresholds = { dockTimeExceededMinutes: 60 };
  autoResolve = true;
  severity = 'medium' as const;

  run(context: LoadCheckContext, thresholds: Record<string, number>): MonitoringTrigger | null {
    const { nextPendingStop, load, driver } = context;
    if (!nextPendingStop) return null;
    if (!nextPendingStop.arrivedAt && !nextPendingStop.dockInAt) return null;

    const arrivedTime = nextPendingStop.dockInAt || nextPendingStop.arrivedAt;
    if (!arrivedTime) return null;

    const dwellMinutes = (Date.now() - new Date(arrivedTime).getTime()) / (60 * 1000);
    const expectedMinutes = nextPendingStop.estimatedDockHours * 60;
    const threshold = thresholds.dockTimeExceededMinutes ?? this.defaultThresholds.dockTimeExceededMinutes;

    if (dwellMinutes > expectedMinutes + threshold) {
      return {
        type: 'DOCK_TIME_EXCEEDED',
        severity: this.severity,
        requiresReplan: false,
        etaImpactMinutes: Math.round(dwellMinutes - expectedMinutes),
        params: {
          loadId: load.loadNumber,
          driverName: driver.name,
          stopName: nextPendingStop.stop.name,
          dwellMinutes: Math.round(dwellMinutes),
          expectedMinutes: Math.round(expectedMinutes),
        },
      };
    }
    return null;
  }
}

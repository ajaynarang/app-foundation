import { MonitoringCheck, DriverCheckContext, MonitoringTrigger } from '../../monitoring.types';

export class DriverNotMovingCheck implements MonitoringCheck {
  id = 'driver_not_moving';
  displayName = 'Driver Not Moving';
  category = 'driver_behavior' as const;
  needs = ['gps_data'];
  scope = 'per-driver' as const;
  defaultThresholds = { driverNotMovingMinutes: 120 };
  autoResolve = true;
  severity = 'high' as const;

  run(context: DriverCheckContext, thresholds: Record<string, number>): MonitoringTrigger | null {
    const { gpsData, driver, loads } = context;
    if (!gpsData) return null;

    // Only check if driver has in_transit loads
    const inTransitLoads = loads.filter((l) => l.status === 'IN_TRANSIT');
    if (inTransitLoads.length === 0) return null;

    const threshold = thresholds.driverNotMovingMinutes ?? this.defaultThresholds.driverNotMovingMinutes;

    // Engine off during active load — immediate alert (no time threshold)
    if (!gpsData.engineRunning) {
      return {
        type: 'DRIVER_NOT_MOVING',
        severity: 'high',
        requiresReplan: false,
        etaImpactMinutes: 0,
        params: {
          driverId: driver.driverId,
          driverName: driver.name,
          reason: 'engine_off',
          speed: gpsData.speed,
        },
      };
    }

    // Speed 0 — check if driver is at a dock (which is expected)
    if (gpsData.speed === 0) {
      // If any in-transit load has an active dock-in (arrived but not departed), skip
      const atDock = inTransitLoads.some((load) =>
        load.loadStops.some((stop) => (stop.arrivedAt || stop.dockInAt) && !stop.departedAt && !stop.completedAt),
      );
      if (atDock) return null;

      // Not at a dock — calculate idle time since the load went in-transit
      // Use the most recent inTransitAt as the baseline
      const latestInTransit = Math.max(
        ...inTransitLoads.filter((l) => l.inTransitAt).map((l) => new Date(l.inTransitAt).getTime()),
      );

      // Use GPS timestamp to estimate when the driver last moved
      // If GPS is fresh (synced recently) and speed is 0, the driver is stopped NOW
      // We measure idle duration as time since the GPS timestamp (last data point)
      // was received with speed 0. For consecutive cycles, this accumulates.
      const gpsTimestamp = new Date(gpsData.timestamp).getTime();
      const now = Date.now();

      // Idle minutes = time since in-transit or GPS timestamp, whichever is more recent
      // (if GPS shows speed=0, the driver has been stopped since at least gpsTimestamp)
      const idleStartEstimate = Math.max(latestInTransit, gpsTimestamp);
      const idleMinutes = (now - idleStartEstimate) / (60 * 1000);

      if (idleMinutes > threshold) {
        return {
          type: 'DRIVER_NOT_MOVING',
          severity: 'medium',
          requiresReplan: false,
          etaImpactMinutes: Math.round(idleMinutes),
          params: {
            driverId: driver.driverId,
            driverName: driver.name,
            reason: 'stationary',
            stationaryMinutes: Math.round(idleMinutes),
          },
        };
      }
    }

    return null;
  }
}

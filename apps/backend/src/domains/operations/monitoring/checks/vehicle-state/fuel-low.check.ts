import { MonitoringCheck, DriverCheckContext, MonitoringTrigger } from '../../monitoring.types';

export class FuelLowCheck implements MonitoringCheck {
  id = 'fuel_low';
  displayName = 'Fuel Low';
  category = 'vehicle_state' as const;
  needs = ['vehicle_state'];
  scope = 'per-driver' as const;
  defaultThresholds = { fuelLowPercent: 20 };
  autoResolve = true;
  severity = 'medium' as const;

  run(context: DriverCheckContext, thresholds: Record<string, number>): MonitoringTrigger | null {
    const { gpsData, driver, vehicle } = context;
    if (!gpsData || gpsData.fuelLevel === null || !vehicle) return null;

    const threshold = thresholds.fuelLowPercent ?? this.defaultThresholds.fuelLowPercent;

    if (gpsData.fuelLevel < threshold) {
      return {
        type: 'FUEL_LOW',
        severity: this.severity,
        requiresReplan: false,
        etaImpactMinutes: 15,
        params: {
          driverId: driver.driverId,
          driverName: driver.name,
          vehicleId: vehicle.vehicleId,
          fuelLevel: gpsData.fuelLevel,
        },
      };
    }
    return null;
  }
}

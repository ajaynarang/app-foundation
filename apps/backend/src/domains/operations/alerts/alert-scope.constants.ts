/**
 * Alert types grouped by scope (driver vs load).
 * Used by the grouped alerts endpoint and frontend tabs.
 */
export const DRIVER_ALERT_TYPES = [
  'HOS_VIOLATION',
  'HOS_APPROACHING_LIMIT',
  'BREAK_REQUIRED',
  'CYCLE_APPROACHING_LIMIT',
  'DRIVER_NOT_MOVING',
  'FUEL_LOW',
] as const;

export const LOAD_ALERT_TYPES = [
  'APPOINTMENT_AT_RISK',
  'MISSED_APPOINTMENT',
  'DOCK_TIME_EXCEEDED',
  'OFF_PACE',
  'NO_PICKUP_ACTIVITY',
  'UNCONFIRMED_PICKUP',
  'UNCONFIRMED_DELIVERY',
] as const;

export type DriverAlertType = (typeof DRIVER_ALERT_TYPES)[number];
export type LoadAlertType = (typeof LOAD_ALERT_TYPES)[number];

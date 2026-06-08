export enum DutyStatus {
  OFF_DUTY = 'off_duty',
  SLEEPER_BERTH = 'sleeper_berth',
  DRIVING = 'driving',
  ON_DUTY_NOT_DRIVING = 'on_duty_not_driving',
}

export enum RestRecommendation {
  FULL_REST = 'full_rest',
  PARTIAL_REST_7_3 = 'partial_rest_7_3',
  PARTIAL_REST_8_2 = 'partial_rest_8_2',
  BREAK = 'break',
  NO_REST = 'no_rest',
}

export enum ComplianceStatus {
  COMPLIANT = 'compliant',
  NON_COMPLIANT = 'non_compliant',
  WARNING = 'warning',
}

export enum SegmentType {
  DRIVE = 'drive',
  REST = 'rest',
  FUEL = 'fuel',
  DOCK = 'dock',
}

export enum LocationType {
  WAREHOUSE = 'warehouse',
  CUSTOMER = 'customer',
  DISTRIBUTION_CENTER = 'distribution_center',
  TRUCK_STOP = 'truck_stop',
  SERVICE_AREA = 'service_area',
  FUEL_STATION = 'fuel_station',
}

export enum UpdateType {
  TRAFFIC_DELAY = 'traffic_delay',
  DOCK_TIME_CHANGE = 'dock_time_change',
  LOAD_ADDED = 'load_added',
  LOAD_CANCELLED = 'load_cancelled',
  DRIVER_REST_REQUEST = 'driver_rest_request',
  HOS_VIOLATION = 'hos_violation',
}

export enum TriggerPriority {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

// FMCSA HOS Constants
export const HOS_CONSTANTS = {
  MAX_DRIVE_HOURS: 11.0,
  MAX_DUTY_HOURS: 14.0,
  MAX_CYCLE_HOURS: 70.0,
  CYCLE_DAYS: 8,
  RESTART_HOURS: 34.0,
  REQUIRED_BREAK_MINUTES: 30,
  BREAK_TRIGGER_HOURS: 8.0,
  // Schedule the break ~15 min before the legal §395.3 trigger so real-world
  // drift (traffic, idle, accumulated rounding) doesn't push us into violation.
  BREAK_SAFETY_BUFFER_HOURS: 0.25,
  MIN_REST_HOURS: 10.0,
  SLEEPER_BERTH_SPLIT_LONG: 8.0,
  SLEEPER_BERTH_SPLIT_SHORT: 2.0,
  SLEEPER_BERTH_SPLIT_7_3_LONG: 7.0,
  SLEEPER_BERTH_SPLIT_7_3_SHORT: 3.0,
  SLEEPER_BERTH_SPLIT_8_2_LONG: 8.0,
  SLEEPER_BERTH_SPLIT_8_2_SHORT: 2.0,
  WARNING_THRESHOLD_HOURS: 1.0,
  MIN_DOCK_TIME_FOR_FULL_REST: 10.0,
  MIN_DOCK_TIME_FOR_PARTIAL_REST: 7.0,
  MIN_DOCK_TIME_FOR_7H_SPLIT: 7.0,
  MIN_DOCK_TIME_FOR_8H_SPLIT: 8.0,
  LOW_DRIVE_DEMAND_THRESHOLD: 3.0,
  HIGH_DRIVE_DEMAND_THRESHOLD: 8.0,
} as const;

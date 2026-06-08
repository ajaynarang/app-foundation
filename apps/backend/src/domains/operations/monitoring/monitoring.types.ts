export interface MonitoringTrigger {
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  requiresReplan: boolean;
  etaImpactMinutes: number;
  params: Record<string, unknown>;
}

// ---- Data Source Registry Types ----
export type DataSourceType = 'integration' | 'platform_service';
export type FreshnessStrategy = 'schedule' | 'ttl';

export interface DataSourceDefinition {
  id: string;
  displayName: string;
  provides: string[];
  sourceType: DataSourceType;
  freshnessStrategy: FreshnessStrategy;
  ttlSeconds?: number;
  integrationRequirement?: {
    type: 'TMS' | 'ELD';
    status: string;
  };
  platformServiceKey?: string;
}

export type DataSourceStatus = 'healthy' | 'delayed' | 'stale' | 'never' | 'not_configured';

export interface ResolvedDataSource {
  definition: DataSourceDefinition;
  available: boolean;
  status: DataSourceStatus;
  lastSyncAge: number | null; // seconds
}

// ---- Check Registry Types ----
export type CheckCategory = 'hos_compliance' | 'load_progress' | 'driver_behavior' | 'vehicle_state' | 'lifecycle';

export type CheckScope = 'per-driver' | 'per-load';

export interface MonitoringCheck {
  id: string;
  displayName: string;
  category: CheckCategory;
  needs: string[]; // data capabilities required, e.g. ['hos_data']
  scope: CheckScope;
  defaultThresholds: Record<string, number>;
  autoResolve: boolean;
  severity: 'critical' | 'high' | 'medium' | 'low';
  run(context: DriverCheckContext | LoadCheckContext, thresholds: Record<string, number>): MonitoringTrigger | null;
}

// ---- Monitoring Context Types ----
export interface DriverActivePlanContext {
  planId: string;
  nextDriveSegment?: {
    segmentId: string;
    distanceMiles: number | null;
    driveTimeHours: number | null;
    toLocation: string | null;
  };
}

export interface DriverCheckContext {
  driver: {
    id: number;
    driverId: string;
    name: string;
    tenantId: number;
  };
  vehicle: {
    id: number;
    vehicleId: string;
  } | null;
  loads: LoadWithStops[];
  hosData: HOSData | null;
  gpsData: TelematicsData | null;
  driverActivePlan?: DriverActivePlanContext;
}

export interface ActivePlanSegment {
  segmentId: string;
  sequenceOrder: number;
  segmentType: string;
  status: string;
  fromLocation: string | null;
  toLocation: string | null;
  estimatedArrival: Date | null;
  estimatedDeparture: Date | null;
  distanceMiles: number | null;
  driveTimeHours: number | null;
  restDurationHours: number | null;
  progress: number | null;
  toLat: number | null;
  toLon: number | null;
}

export interface ActivePlanContext {
  planId: string;
  segments: ActivePlanSegment[];
  currentSegment?: ActivePlanSegment;
  nextSegment?: ActivePlanSegment;
  departureTime: Date;
  estimatedArrival: Date;
}

export interface LoadCheckContext {
  load: LoadWithStops;
  driver: DriverCheckContext['driver'];
  nextPendingStop: LoadStopWithCoords | null;
  driverPosition: { lat: number; lon: number; speed?: number } | null;
  estimatedDriveMinutes: number | null;
  activePlan?: ActivePlanContext;
}

export interface HOSData {
  currentDutyStatus: string;
  driveTimeRemainingMs: number;
  shiftTimeRemainingMs: number;
  cycleTimeRemainingMs: number;
  timeUntilBreakMs: number;
  lastUpdated: string;
  syncedAt: string;
}

export interface TelematicsData {
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  fuelLevel: number | null;
  engineRunning: boolean;
  odometer: number;
  timestamp: string;
  syncedAt: string;
}

export interface LoadWithStops {
  id: number;
  loadNumber: string;
  status: string;
  driverId: number | null;
  vehicleId: number | null;
  assignedAt: Date | null;
  inTransitAt: Date | null;
  loadStops: LoadStopWithCoords[];
}

export interface LoadStopWithCoords {
  id: number;
  sequenceOrder: number;
  actionType: string; // 'pickup' | 'delivery'
  status: string;
  appointmentDate: Date | null;
  earliestArrival: string | null;
  latestArrival: string | null;
  estimatedDockHours: number;
  arrivedAt: Date | null;
  departedAt: Date | null;
  completedAt: Date | null;
  dockInAt: Date | null;
  stop: {
    lat: number | null;
    lon: number | null;
    name: string;
    city: string | null;
    state: string | null;
  };
}

// ---- Monitoring Engine Types ----
export type MonitoringStatus = 'active' | 'limited' | 'degraded' | 'inactive' | 'unavailable';

export interface MonitoringCycleResult {
  tenantId: number;
  status: MonitoringStatus;
  loadsMonitored: number;
  driversMonitored: number;
  cycleIntervalSeconds: number;
  lastCycleAt: string;
  triggersThisCycle: number;
  dataSources: ResolvedDataSource[];
  checks: {
    active: ActiveCheckResult[];
    inactive: InactiveCheckResult[];
    skipped: SkippedCheckResult[];
  };
}

export interface ActiveCheckResult {
  id: string;
  displayName: string;
  category: CheckCategory;
  status: 'ok' | 'warning' | 'critical';
  issueCount: number;
  summary: string;
}

export interface InactiveCheckResult {
  id: string;
  displayName: string;
  category: CheckCategory;
  reason: string;
}

export interface SkippedCheckResult {
  id: string;
  displayName: string;
  category: CheckCategory;
  reason: string;
}

// ---- Thresholds ----
export const DEFAULT_THRESHOLDS = {
  hosApproachingMinutes: 60,
  breakRequiredHours: 8,
  cycleApproachingHours: 5,
  appointmentAtRiskMinutes: 30,
  dockTimeExceededMinutes: 60,
  driverNotMovingMinutes: 120,
  offPaceBufferMinutes: 30,
  fuelLowPercent: 20,
  noPickupActivityHours: 4,
  behindScheduleWarningMinutes: 30,
  behindScheduleCriticalMinutes: 60,
  missedStopDistanceMiles: 2,
  segmentStalledMultiplier: 2,
} as const;

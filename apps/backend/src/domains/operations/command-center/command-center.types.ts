export type LoadCardTier = 'basic' | 'tracked' | 'planned';

export interface ActiveLoadDto {
  loadNumber: string;
  customerName: string;
  status: string;
  requiredEquipmentType: string | null;
  origin: { city: string | null; state: string | null } | null;
  destination: { city: string | null; state: string | null } | null;
  driver: { driverId: string; name: string } | null;
  vehicle: { vehicleId: string; identifier: string } | null;
  stopProgress: { completed: number; total: number };
  pickupDate: string | null;
  deliveryDate: string | null;
  weightLbs: number;
  rateCents: number | null;
  tier: LoadCardTier;
  hos: {
    driveHoursRemaining: number;
    dutyHoursRemaining: number;
    cycleHoursRemaining: number;
    breakHoursRemaining: number;
    status: 'driving' | 'on_duty' | 'sleeper' | 'off_duty';
  } | null;
  hosDataSyncedAt: string | null;
  route: {
    planId: string;
    eta: string | null;
    etaStatus: 'on_time' | 'at_risk' | 'late';
    nextStop: { name: string; location: string; eta: string } | null;
    milesCompleted: number;
    milesRemaining: number;
    totalDistanceMiles: number;
  } | null;
  activeAlertCount: number;
  monitoringStatus: 'ok' | 'warning' | 'critical' | null;
  updatedAt: string;
}

export interface DriverHOSChipDto {
  driverId: string;
  name: string;
  initials: string;
  driveHoursRemaining: number;
  dutyHoursRemaining: number;
  status: 'driving' | 'on_duty' | 'sleeper' | 'off_duty';
  vehicleId: string | null;
  activeLoadId: string | null;
}

export interface LoadCentricKpis {
  activeLoads: number;
  inTransit: number;
  onTimePercentage: number;
  activeAlerts: number;
  unassigned: number;
}

export interface CommandCenterOverviewDto {
  kpis: LoadCentricKpis;
  activeLoads: ActiveLoadDto[];
  quickActionCounts: {
    unassignedLoads: number;
    availableDrivers: number;
  };
  driverHosStrip: DriverHOSChipDto[];
}

export interface ShiftNoteLinkedEntityDto {
  type: 'driver' | 'load' | 'route' | 'vehicle';
  id: string;
  label: string;
}

export interface ShiftNoteDto {
  noteId: string;
  content: string;
  priority: 'urgent' | 'action_required' | 'info';
  createdBy: {
    userId: string;
    name: string;
  };
  createdAt: string;
  expiresAt: string;
  isPinned: boolean;
  linkedEntities: ShiftNoteLinkedEntityDto[];
  acknowledgedBy: {
    userId: string;
    name: string;
  } | null;
  acknowledgedAt: string | null;
}

export interface ShiftNotesResponseDto {
  notes: ShiftNoteDto[];
  handoffStatus: {
    acknowledged: boolean;
    acknowledgedBy?: {
      userId: string;
      name: string;
    };
    acknowledgedAt?: string;
  };
}

export interface SystemHealthCheckDto {
  name: string;
  type: string;
  enabled: boolean;
  lastFiredAt: string | null;
}

export interface SystemHealthCheckCategoryDto {
  category: string;
  checks: SystemHealthCheckDto[];
}

export interface SystemHealthIntegrationDto {
  name: string;
  type: string;
  source: 'live' | 'mock';
  status: 'connected' | 'disconnected' | 'not_configured';
  lastSuccessAt: string | null;
}

export interface PipelineSyncStatus {
  syncType: string;
  displayName: string;
  expectedIntervalSeconds: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  status: 'active' | 'delayed' | 'stale' | 'never';
  consecutiveFailures: number;
}

export interface SystemHealthDto {
  monitoring: {
    status: 'active' | 'inactive' | 'degraded' | 'limited' | 'unavailable';
    lastCycleAt: string | null;
    loadsMonitored: number;
    driversMonitored: number;
    triggersLastCycle: number;
    cycleIntervalSeconds: number;
  };
  checks: SystemHealthCheckCategoryDto[];
  integrations: SystemHealthIntegrationDto[];
  pipeline: PipelineSyncStatus[];
}

export interface MessageSummaryItemDto {
  loadNumber: string;
  status: string;
  origin: string;
  destination: string;
  driverName: string;
  vehicleUnit: string | null;
  eta: string | null;
  lastMessage: {
    content: string;
    role: 'driver' | 'dispatcher';
    createdAt: string;
  } | null;
  unreadCount: number;
}

export interface MessageSummaryResponseDto {
  items: MessageSummaryItemDto[];
  needsResponseCount: number;
}

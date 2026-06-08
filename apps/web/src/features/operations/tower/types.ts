// Re-exported from @sally/shared-types — do not add local types here
export type {
  LoadCardTier,
  HosStatus,
  ActiveLoad,
  DriverHOSChip,
  LoadCentricKpis,
  CommandCenterOverview,
  ShiftNoteLinkedEntity,
  ShiftNote,
  ShiftNotesResponse,
  SystemHealthCheck,
  SystemHealthCheckCategory,
  SystemHealthIntegration,
  PipelineSyncStatus,
  SystemHealth,
  CreateShiftNoteDto,
  MessageSummaryItem,
  MessageSummaryResponse,
} from '@sally/shared-types';

// ---------------------------------------------------------------------------
// Command Center Map Types (local — not in shared-types yet)
// ---------------------------------------------------------------------------

/** A geocoded waypoint on an active load's route, ordered by sequenceOrder. */
export interface MapRouteStop {
  sequenceOrder: number;
  actionType: 'pickup' | 'delivery' | 'stop';
  lat: number;
  lng: number;
  city: string;
  state: string | null;
}

export interface MapTruckLocation {
  driverId: string;
  driverName: string;
  vehicleId: string;
  vehicleIdentifier: string;
  latitude: number;
  longitude: number;
  heading: number;
  speedMph: number;
  status: 'moving' | 'idle' | 'parked';
  hosDriveRemaining: number; // hours
  hosDutyRemaining: number; // hours
  hosStatus: 'safe' | 'warning' | 'critical' | 'none';
  fuelLevel: number | null; // 0-100
  activeLoad: {
    loadNumber: string;
    referenceNumber?: string | null;
    origin: { lat: number; lng: number; city: string };
    destination: { lat: number; lng: number; city: string };
    /**
     * Full geocoded stop sequence (origin → intermediate → destination).
     * Empty when fewer than two stops are geocoded. The map draws a
     * straight-line connector through these — not a road-snapped polyline.
     */
    stops: MapRouteStop[];
    etaStatus: 'on_time' | 'at_risk' | 'late';
  } | null;
  lastUpdated: string;
}

export interface MapUnassignedLoad {
  loadNumber: string;
  referenceNumber?: string | null;
  origin: { lat: number; lng: number; city: string };
  destination: { lat: number; lng: number; city: string };
  customerName: string;
  pickupDate: string;
}

export interface CommandCenterMapData {
  trucks: MapTruckLocation[];
  unassignedLoads: MapUnassignedLoad[];
  lastUpdated: string;
}

/**
 * DTOs for Command Center map data endpoint.
 * Flat structure aligned with frontend MapTruckLocation / MapUnassignedLoad types.
 *
 * IMPORTANT — Driver assignment:
 *   vehicle.assignedDriver is a PREFERENCE ("this driver usually drives this truck"),
 *   NOT the current assignment. The actual driver is always on the LOAD.
 *   Always resolve driver from: load.driver ?? vehicle.assignedDriver
 *
 * IMPORTANT — Telematics data source:
 *   The map endpoint uses a bulk Prisma query (vehicle + telematics join) for initial load,
 *   cached at the endpoint level (30s TTL). This is the same pattern as getOverview().
 *   The EldDataCacheService (per-vehicle Redis reads) is designed for real-time single-vehicle
 *   checks during monitoring cycles — not for bulk map rendering.
 *   SSE telematics:update events trigger frontend query invalidation for near-real-time updates.
 */

/**
 * A single geocoded stop on an active load's route, ordered by sequenceOrder.
 * Surfaced so the Tower map can draw the selected truck's load route
 * (origin → intermediate stops → destination). Stops without geocoded
 * coordinates are dropped upstream — every entry here has lat/lng.
 */
export interface MapRouteStopDto {
  sequenceOrder: number;
  actionType: 'pickup' | 'delivery' | 'stop';
  lat: number;
  lng: number;
  city: string;
  state: string | null;
}

export interface MapTruckLocationDto {
  /** Driver ID from the active load, NOT vehicle.assignedDriverId */
  driverId: string;
  /** Driver name from the active load. Falls back to vehicle.assignedDriver, then 'Unassigned' */
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
  fuelLevel: number | null;
  activeLoad: {
    loadNumber: string;
    referenceNumber: string | null;
    origin: { lat: number; lng: number; city: string };
    destination: { lat: number; lng: number; city: string };
    /**
     * Full geocoded stop sequence (origin → intermediate → destination).
     * Empty when fewer than two stops are geocoded. The Tower map draws a
     * straight-line connector through these — it is NOT a road-snapped
     * polyline (that would need the routing provider; see route-planning).
     */
    stops: MapRouteStopDto[];
    etaStatus: 'on_time' | 'at_risk' | 'late';
  } | null;
  lastUpdated: string;
}

export interface MapLoadStopDto {
  stopId: string;
  name: string;
  city: string | null;
  state: string | null;
  latitude: number;
  longitude: number;
  actionType: string;
  sequenceOrder: number;
  status: string;
}

export interface MapUnassignedLoadDto {
  loadNumber: string;
  referenceNumber: string | null;
  origin: { lat: number; lng: number; city: string };
  destination: { lat: number; lng: number; city: string };
  customerName: string;
  pickupDate: string;
}

export interface CommandCenterMapDataDto {
  trucks: MapTruckLocationDto[];
  unassignedLoads: MapUnassignedLoadDto[];
  lastUpdated: string;
}

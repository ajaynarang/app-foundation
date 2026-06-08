/**
 * Vehicle data from ELD system
 */
export interface ELDVehicleData {
  id: string; // ELD vendor's vehicle ID
  name?: string; // Display name from ELD vendor (e.g., Samsara vehicle name)
  vin?: string;
  licensePlate?: string;
  serial?: string; // ELD device serial number
  gateway?: {
    serial?: string;
    model?: string;
  };
  esn?: string; // Electronic serial number
  make?: string;
  model?: string;
  year?: string | number; // Samsara returns string, we parse to int for DB
  staticAssignedDriverId?: string; // Samsara staticAssignedDriver.id
  cameraSerial?: string; // Samsara AI dashcam serial
}

/**
 * Driver data from ELD system
 */
export interface ELDDriverData {
  id: string; // ELD vendor's driver ID
  name?: string; // Display name from ELD vendor (e.g., "John Smith")
  username?: string;
  phone?: string;
  licenseNumber?: string;
  licenseState?: string;
  driverActivationStatus?: string; // Samsara: 'active' | 'deactivated'
  eldSettings?: any; // Vendor-specific ELD settings
  carrierSettings?: object; // Samsara carrier-level settings (useful for compliance)
  tags?: Array<{ id: string; name: string }>; // Samsara tags for grouping
  timezone?: string;
}

/**
 * Vehicle location data from ELD system
 *
 * Matches Samsara GET /fleet/vehicles/stats?types=gps response.
 * Fields like odometer, fuelLevel, engineRunning are not available
 * from this endpoint and default to zero/null/false in the DB.
 */
export interface ELDVehicleLocationData {
  vehicleId: string;
  vin?: string;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  timestamp: string;
}

/**
 * DVIR (Driver Vehicle Inspection Report) data from ELD system
 */
export interface ELDDVIRData {
  id: string;
  vehicleId: string;
  vehicleName?: string;
  driverId?: string;
  driverName?: string;
  trailerId?: string;
  trailerName?: string;
  trailerDefects?: {
    description: string;
    severity?: string;
    mechanicNotes?: string;
  }[];
  inspectionType: 'pre_trip' | 'post_trip';
  condition: 'satisfactory' | 'needs_repair';
  defects: { description: string; severity?: string; mechanicNotes?: string }[];
  mechanicSignedOff: boolean;
  inspectedAt: string; // ISO timestamp
}

/**
 * HOS clock data from any ELD system
 */
export interface HOSClockData {
  driverId: string;
  driverName: string;
  currentDutyStatus: 'driving' | 'onDuty' | 'offDuty' | 'sleeperBerth';
  driveTimeRemainingMs: number;
  shiftTimeRemainingMs: number;
  cycleTimeRemainingMs: number;
  timeUntilBreakMs: number;
  lastUpdated: string;
}

/**
 * GPS data point from ELD system
 */
export interface ELDGpsPoint {
  latitude: number;
  longitude: number;
  speedMilesPerHour: number;
  headingDegrees: number;
  time: string;
}

/**
 * Vehicle stat from ELD feed endpoint (cursor-based)
 */
export interface ELDVehicleStat {
  id: string;
  name: string;
  gps?: ELDGpsPoint[];
  engineStates?: { value: 'On' | 'Off' | 'Idle'; time: string }[];
  gpsOdometerMeters?: { value: number; time: string } | { value: number; time: string }[];
  fuelPercents?: { value: number; time: string } | { value: number; time: string }[];
}

/**
 * Result from cursor-based vehicle stats feed
 */
export interface VehicleStatsFeedResult {
  data: ELDVehicleStat[];
  endCursor: string;
  hasNextPage: boolean;
}

/**
 * Trailer data from ELD system
 */
export interface ELDTrailerData {
  id: string;
  name?: string;
  serialNumber?: string;
  licensePlate?: string;
  make?: string;
  model?: string;
  year?: string | number;
  tags?: { id: string; name: string }[];
}

/**
 * Interface that all ELD adapters must implement
 */
export interface IELDAdapter {
  /**
   * Fetch all vehicles from ELD system
   * @param apiToken - API token for authentication
   * @returns Array of ELD vehicle data
   */
  getVehicles(apiToken: string): Promise<ELDVehicleData[]>;

  /**
   * Fetch all drivers from ELD system
   * @param apiToken - API token for authentication
   * @returns Array of ELD driver data
   */
  getDrivers(apiToken: string): Promise<ELDDriverData[]>;

  /**
   * Fetch current vehicle locations from ELD system
   * @param apiToken - API token for authentication
   * @returns Array of vehicle location data
   */
  getVehicleLocations(apiToken: string): Promise<ELDVehicleLocationData[]>;

  /**
   * Test if credentials are valid and connection works
   * @param apiToken - API token for authentication
   * @returns true if connection successful
   */
  testConnection(apiToken: string): Promise<boolean>;

  /**
   * Fetch HOS (Hours of Service) clock data for all drivers.
   * Optional — not all ELD vendors expose HOS clocks via API.
   */
  getHOSClocks?(apiToken: string): Promise<HOSClockData[]>;

  /**
   * Fetch vehicle stats via cursor-based feed (GPS, fuel, engine, odometer).
   * Optional — not all ELD vendors support delta-based feeds.
   */
  getVehicleStatsFeed?(apiToken: string, cursor?: string): Promise<VehicleStatsFeedResult>;

  /**
   * Fetch DVIRs (Driver Vehicle Inspection Reports) from ELD system.
   * Optional — not all ELD vendors support DVIR data.
   */
  getDVIRs?(apiToken: string, startDate: string): Promise<ELDDVIRData[]>;

  /**
   * Fetch all trailers from ELD system.
   * Optional — not all ELD vendors expose trailer data via API.
   */
  getTrailers?(apiToken: string): Promise<ELDTrailerData[]>;
}

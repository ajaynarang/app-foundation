import { SourcedValue, DataSource } from '@sally/shared-types';
import { FuelStop } from '../../providers/fuel/fuel-data-provider.interface';
import { WeatherAlert } from '../../providers/weather/weather-provider.interface';
import { HOSState } from '../../hos-compliance/services/hos-rule-engine.service';

// ─── External Dependency Interfaces ─────────────────────────────────────────

export interface FuelStopFinder {
  findAlongCorridor(
    fromLat: number,
    fromLon: number,
    toLat: number,
    toLon: number,
    maxDetourMiles: number,
    filter?: { acceptedBrands?: string[] },
  ): Promise<FuelStop[]>;

  findTruckStopsNear?(
    lat: number,
    lon: number,
    radiusMiles: number,
    filter?: { acceptedBrands?: string[] },
  ): Promise<FuelStop[]>;
}

export interface FuelPricer {
  getPriceForStop(
    stop: FuelStop,
    cardTypes: string[],
    overrideRetailPrice?: number,
  ): Promise<{ pricePerGallon: number; source?: DataSource }>;
}

export interface WeatherChecker {
  check(
    from: { lat: number; lon: number },
    to: { lat: number; lon: number },
    departureTime: Date,
  ): Promise<WeatherAlert[]>;
}

export interface RouteGeometryFetcher {
  getGeometry(from: { lat: number; lon: number }, to: { lat: number; lon: number }): Promise<string | null>;
}

// ─── Simulation Data Types ──────────────────────────────────────────────────

export interface ResolvedStop {
  id: number;
  stopId: string;
  name: string;
  lat: number;
  lon: number;
  type: 'pickup' | 'delivery' | 'fuel' | 'rest' | 'origin';
  timezone?: string;
  appointmentWindow?: { start: Date; end: Date };
  dockDurationHours?: number;
  customerName?: string;
  loadNumber?: string;
  /** How the facility admits trucks vs its window — drives where an early-wait happens. */
  entryPolicy?: 'FCFS' | 'APPOINTMENT_STRICT' | 'LOOSE';
  /** Median detention beyond scheduled dock time (minutes) from this customer's history. */
  detentionP50Minutes?: number;
}

export type DistanceMatrixEntry = {
  distanceMiles: number;
  driveTimeHours: number;
};
export type DistanceMatrix = Map<string, DistanceMatrixEntry>;

export interface SimulationParams {
  stops: ResolvedStop[];
  distanceMatrix: DistanceMatrix;
  departureTime: Date;
  hosState: HOSState;
  fuelCapacityGallons: number;
  mpg: number;
  currentFuelGallons: number;
  hasSleeperBerth: boolean;
  acceptedBrands: string[];
  maxDetourMiles: number;
  preferredRest: string;
  allowDockRest: boolean;
  costPerMile: number;
  laborCostPerHour: number;
  splitSleeperThresholdHours: number;
  estimatedDieselPrice?: number;
  /** Toll cost (cents) for the route, tagged with provenance. NOT_AVAILABLE when no toll feed is connected — never a fabricated $0. */
  tollEstimate?: SourcedValue;
  dispatcherDockRestStops?: Array<{
    stopId: string;
    truckParkedHours: number;
    convertToRest: boolean;
  }>;
  fuelStopFinder: FuelStopFinder;
  fuelPricer: FuelPricer;
  weatherChecker: WeatherChecker;
  routeGeometryFetcher: RouteGeometryFetcher;
}

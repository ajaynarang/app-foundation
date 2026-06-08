/**
 * Smart Assign types
 *
 * Note: DriverRecommendation is defined here rather than re-exported from
 * @sally/shared-types because the shared-types dist may not be rebuilt.
 * The canonical Zod schema lives in packages/shared-types/src/api/driver-recommendation.types.ts.
 */

export interface DriverHOSState {
  driveHoursRemaining: number;
  shiftHoursRemaining: number;
  cycleHoursRemaining: number;
  breakHoursRemaining: number;
  nextResetAt: string | null;
}

export interface DriverProximity {
  distanceMilesFromPickup: number;
  lastKnownLocation: string;
}

export interface DriverAvailability {
  status: 'available' | 'on_load' | 'resting';
  currentLoadNumber: string | null;
  currentLoadEta: string | null;
  availableAt: string;
}

export interface DriverVehicleInfo {
  vehicleId: string;
  unitNumber: string;
  equipmentType: string;
}

export interface DriverRecommendation {
  driverId: string;
  name: string;
  initials: string;
  matchScore: number;
  matchRationale: string;
  isBestMatch: boolean;
  equipmentMatch: boolean;
  equipmentType: string | null;
  hos: DriverHOSState;
  proximity: DriverProximity;
  availability: DriverAvailability;
  vehicle: DriverVehicleInfo | null;
  activeLoadCount: number;
}

export interface DriverRecommendationsResponse {
  recommendations: DriverRecommendation[];
}

// Frontend-specific types
export type AssignStep = 'select' | 'generating' | 'result';

export interface GenerateRouteParams {
  driverId: string;
  vehicleId: string;
  departureTime: string;
  optimizationPriority: 'minimize_time' | 'minimize_cost' | 'balance';
  restPreference?: string;
  avoidTolls?: boolean;
  maxFuelDetourMiles?: number;
  /** Per-leg driver/vehicle map for relay loads */
  legDriverMap?: Record<string, { driverId: string; vehicleId: string }>;
}

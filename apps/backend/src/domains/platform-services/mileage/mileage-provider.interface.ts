import { Waypoint } from '../shared/types';
import { TruckProfile } from '../routing/routing-provider.interface';

export interface MileageResult {
  origin: string;
  destination: string;
  rated_miles: number;
  practical_miles: number;
  shortest_miles: number;
  toll_miles?: number;
  /** Estimated drive time in hours, from the provider — not derived from speed. */
  duration_hours?: number;
  provider: string;
}

export interface IMileageProvider {
  getRatedMiles(origin: Waypoint, destination: Waypoint): Promise<MileageResult>;
  getTruckMiles(origin: Waypoint, destination: Waypoint, profile?: TruckProfile): Promise<MileageResult>;
}

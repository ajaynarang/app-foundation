import { Waypoint } from '../shared/types';

// Re-export Waypoint so existing consumers of this module are not broken
export { Waypoint } from '../shared/types';

export interface RouteResult {
  distance_miles: number;
  duration_minutes: number;
  polyline: string;
  waypoints: Waypoint[];
  segments: Array<{
    start: Waypoint;
    end: Waypoint;
    distance_miles: number;
    duration_minutes: number;
  }>;
}

export interface TruckProfile {
  height_feet?: number;
  weight_lbs?: number;
  length_feet?: number;
  axle_count?: number;
  hazmat?: boolean;
}

export interface IRoutingProvider {
  getRoute(origin: Waypoint, destination: Waypoint, waypoints?: Waypoint[]): Promise<RouteResult>;

  getTruckRoute(
    origin: Waypoint,
    destination: Waypoint,
    waypoints?: Waypoint[],
    profile?: TruckProfile,
  ): Promise<RouteResult>;
}

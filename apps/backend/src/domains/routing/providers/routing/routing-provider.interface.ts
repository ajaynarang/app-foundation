export interface LatLon {
  lat: number;
  lon: number;
  id?: string;
}

export interface DistanceMatrixEntry {
  distanceMiles: number;
  driveTimeHours: number;
}

export type DistanceMatrix = Map<string, DistanceMatrixEntry>;

export interface RouteResult {
  distanceMiles: number;
  driveTimeHours: number;
  geometry: string; // encoded polyline
  waypoints: LatLon[];
}

export const ROUTING_PROVIDER = 'ROUTING_PROVIDER';

/**
 * Physical truck profile sent to the routing engine so it avoids low bridges,
 * tonnage-restricted roads, and (for placarded loads) hazmat-prohibited segments.
 * Built by the engine from the vehicle spec + the most-restrictive load hazmat.
 */
export interface TruckProfile {
  grossWeightLbs?: number;
  heightInches?: number;
  lengthInches?: number;
  widthInches?: number;
  axleCount?: number;
  /** HERE hazmat categories, e.g. 'explosive' | 'flammable' | 'corrosive' | … */
  hazardousGoods?: string[];
}

export interface RouteOptions {
  /** Route around toll roads (HERE `avoid[features]=tollRoad`). */
  avoidTollRoads?: boolean;
  /** Truck dimensions/weight/hazmat for truck-aware routing. */
  truckProfile?: TruckProfile;
}

export interface RoutingProvider {
  getDistanceMatrix(stops: LatLon[], options?: RouteOptions): Promise<DistanceMatrix>;
  getRoute(origin: LatLon, destination: LatLon, waypoints?: LatLon[], options?: RouteOptions): Promise<RouteResult>;
}

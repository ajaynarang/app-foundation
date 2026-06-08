export interface FuelStop {
  stopId: string;
  name: string;
  lat: number;
  lon: number;
  city: string;
  state: string;
  fuelPricePerGallon: number;
  brand: string;
  amenities: string[];
  distanceFromRoute: number; // miles off-route
}

export const FUEL_DATA_PROVIDER = 'FUEL_DATA_PROVIDER';

export interface FuelStopFilter {
  acceptedBrands?: string[];
}

export interface FuelDataProvider {
  findFuelStopsNearPoint(lat: number, lon: number, radiusMiles: number, filter?: FuelStopFilter): Promise<FuelStop[]>;

  findFuelStopsAlongCorridor(
    fromLat: number,
    fromLon: number,
    toLat: number,
    toLon: number,
    corridorWidthMiles: number,
    filter?: FuelStopFilter,
  ): Promise<FuelStop[]>;

  /** Optional: find truck stops with both fuel and parking. */
  findTruckStopsNearPoint?(lat: number, lon: number, radiusMiles: number, filter?: FuelStopFilter): Promise<FuelStop[]>;
}

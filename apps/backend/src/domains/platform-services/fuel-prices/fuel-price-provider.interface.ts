export interface FuelStation {
  station_id: string;
  name: string;
  brand?: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  latitude: number;
  longitude: number;
  price_per_gallon: number;
  diesel_price?: number;
  distance_miles?: number;
  amenities?: string[];
  last_updated: string;
  data_source: string;
}

export interface FuelStationQuery {
  latitude: number;
  longitude: number;
  radius_miles?: number;
  max_results?: number;
  fuel_type?: 'DIESEL' | 'GASOLINE';
  sort_by?: 'PRICE' | 'DISTANCE';
}

export interface IFuelPriceProvider {
  findStations(query: FuelStationQuery): Promise<FuelStation[]>;
  getStationPrice(stationId: string): Promise<FuelStation>;
}

export interface GeocodingResult {
  latitude: number;
  longitude: number;
  formatted_address: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  confidence: number; // 0-1
}

export interface IGeocodingProvider {
  geocode(address: string): Promise<GeocodingResult[]>;
  reverseGeocode(latitude: number, longitude: number): Promise<GeocodingResult>;
}

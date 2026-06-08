import { LatLon } from '../routing/routing-provider.interface';

export interface WeatherAlert {
  lat: number;
  lon: number;
  condition: string; // 'snow', 'rain', 'ice', 'fog', 'thunderstorm', 'clear'
  severity: 'low' | 'moderate' | 'severe';
  description: string;
  temperatureF: number;
  windSpeedMph: number;
  driveTimeMultiplier: number; // 1.0 = normal, 1.3 = 30% slower
}

export const WEATHER_PROVIDER = 'WEATHER_PROVIDER';

export interface WeatherProvider {
  getWeatherAlongRoute(waypoints: LatLon[], departureTime: Date): Promise<WeatherAlert[]>;
}

import { Waypoint } from '../shared/types';

// Re-export Waypoint so existing consumers of this module are not broken
export { Waypoint } from '../shared/types';

export interface WeatherData {
  location: {
    latitude: number;
    longitude: number;
    city?: string;
    state?: string;
  };
  current: {
    temperature_f: number;
    feels_like_f?: number;
    conditions: string;
    wind_speed_mph: number;
    wind_direction?: string;
    visibility_miles: number;
    precipitation_inches?: number;
    humidity_percent: number;
  };
  forecast?: Array<{
    datetime: string;
    temperature_f: number;
    conditions: string;
    precipitation_chance_percent: number;
  }>;
  alerts?: Array<{
    severity: 'MINOR' | 'MODERATE' | 'SEVERE' | 'EXTREME';
    event: string;
    description: string;
    start_time: string;
    end_time: string;
  }>;
  road_conditions?: 'GOOD' | 'FAIR' | 'POOR' | 'HAZARDOUS';
  last_updated: string;
  data_source: string;
}

export interface IWeatherProvider {
  getCurrentWeather(latitude: number, longitude: number): Promise<WeatherData>;
  getRouteForecast(waypoints: Waypoint[]): Promise<WeatherData[]>;
}

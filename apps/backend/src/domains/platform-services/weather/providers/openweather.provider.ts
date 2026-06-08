import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { PlatformServicesConfig } from '../../platform-services.config';
import { IWeatherProvider, WeatherData, Waypoint } from '../weather-provider.interface';

/**
 * OpenWeather Provider
 *
 * Implements IWeatherProvider for the OpenWeatherMap API.
 * When useMockData is true, returns deterministic mock data for testing.
 * Otherwise makes real API calls using the apiKey from PlatformServicesConfig.
 *
 * Real OpenWeather API: https://openweathermap.org/api
 */
@Injectable()
export class OpenWeatherProvider implements IWeatherProvider {
  private readonly logger = new Logger(OpenWeatherProvider.name);
  private readonly useMockData = false;
  private readonly baseUrl = 'https://api.openweathermap.org/data/2.5';

  constructor(private readonly config: PlatformServicesConfig) {}

  /**
   * Get current weather for a location
   */
  async getCurrentWeather(latitude: number, longitude: number): Promise<WeatherData> {
    if (this.useMockData) {
      return this.getMockWeather(latitude, longitude);
    }

    const apiKey = this.config.weather.apiKey;

    try {
      const response = await fetch(
        `${this.baseUrl}/weather?lat=${latitude}&lon=${longitude}&appid=${apiKey}&units=imperial`,
      );

      if (!response.ok) {
        throw new InternalServerErrorException('Weather data is temporarily unavailable');
      }

      const data = await response.json();

      return {
        location: {
          latitude,
          longitude,
          city: data.name,
        },
        current: {
          temperature_f: data.main.temp,
          feels_like_f: data.main.feels_like,
          conditions: this.mapConditions(data.weather[0].main),
          wind_speed_mph: data.wind.speed,
          wind_direction: this.degreesToDirection(data.wind.deg),
          visibility_miles: data.visibility ? data.visibility / 1609.34 : 10,
          humidity_percent: data.main.humidity,
          precipitation_inches: data.rain?.['1h'] ? data.rain['1h'] / 25.4 : 0,
        },
        road_conditions: this.assessRoadConditions(data.weather[0].main, data.main.temp),
        last_updated: new Date().toISOString(),
        data_source: 'openweather',
      };
    } catch (error) {
      if (error instanceof InternalServerErrorException) throw error;
      throw new InternalServerErrorException('Weather data is temporarily unavailable');
    }
  }

  /**
   * Get weather forecast along a route
   */
  async getRouteForecast(waypoints: Waypoint[]): Promise<WeatherData[]> {
    if (this.useMockData) {
      return waypoints.map((wp) => this.getMockWeather(wp.latitude, wp.longitude));
    }

    try {
      const forecasts = await Promise.all(waypoints.map((wp) => this.getCurrentWeather(wp.latitude, wp.longitude)));
      return forecasts;
    } catch (error) {
      if (error instanceof InternalServerErrorException) throw error;
      throw new InternalServerErrorException('Weather data is temporarily unavailable');
    }
  }

  /**
   * Generate realistic mock weather data for testing
   */
  private getMockWeather(latitude: number, longitude: number): WeatherData {
    const conditions = ['clear', 'cloudy', 'rain', 'fog'];
    const conditionIndex = Math.floor((latitude + longitude) * 10) % conditions.length;
    const condition = conditions[conditionIndex];

    const baseTemp = 72;
    const tempVariation = Math.sin(latitude + longitude) * 15;

    return {
      location: {
        latitude,
        longitude,
        city: this.getCityName(latitude, longitude),
        state: this.getState(latitude, longitude),
      },
      current: {
        temperature_f: Math.round(baseTemp + tempVariation),
        feels_like_f: Math.round(baseTemp + tempVariation - 2),
        conditions: condition,
        wind_speed_mph: condition === 'rain' ? 18 : 8,
        wind_direction: 'SW',
        visibility_miles: condition === 'fog' ? 0.5 : condition === 'rain' ? 3 : 10,
        humidity_percent: condition === 'rain' ? 85 : 55,
        precipitation_inches: condition === 'rain' ? 0.15 : 0,
      },
      forecast: [
        {
          datetime: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
          temperature_f: Math.round(baseTemp + tempVariation + 2),
          conditions: 'clear',
          precipitation_chance_percent: 10,
        },
        {
          datetime: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
          temperature_f: Math.round(baseTemp + tempVariation + 5),
          conditions: 'cloudy',
          precipitation_chance_percent: 30,
        },
      ],
      alerts:
        condition === 'rain'
          ? [
              {
                severity: 'MODERATE',
                event: 'Thunderstorm Warning',
                description: 'Heavy rain and lightning expected',
                start_time: new Date().toISOString(),
                end_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
              },
            ]
          : [],
      road_conditions: this.assessRoadConditions(condition, Math.round(baseTemp + tempVariation)),
      last_updated: new Date().toISOString(),
      data_source: 'mock_openweather',
    };
  }

  /**
   * Map OpenWeather condition codes to SALLY standard conditions
   */
  private mapConditions(owCondition: string): string {
    const mapping: Record<string, string> = {
      Clear: 'clear',
      Clouds: 'cloudy',
      Rain: 'rain',
      Drizzle: 'rain',
      Thunderstorm: 'rain',
      Snow: 'snow',
      Mist: 'fog',
      Fog: 'fog',
    };
    return mapping[owCondition] || 'clear';
  }

  /**
   * Convert wind degrees to cardinal direction
   */
  private degreesToDirection(degrees: number): string {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(degrees / 45) % 8;
    return directions[index];
  }

  /**
   * Assess road conditions based on weather
   */
  private assessRoadConditions(condition: string, temperature: number): 'GOOD' | 'FAIR' | 'POOR' | 'HAZARDOUS' {
    if (condition === 'snow' || (condition === 'rain' && temperature < 35)) {
      return 'HAZARDOUS';
    }
    if (condition === 'rain') {
      return 'POOR';
    }
    if (condition === 'fog') {
      return 'FAIR';
    }
    return 'GOOD';
  }

  /**
   * Get approximate city name from coordinates (mock)
   */
  private getCityName(latitude: number, longitude: number): string {
    if (latitude > 32 && latitude < 33 && longitude > -97 && longitude < -96) {
      return 'Dallas';
    }
    if (latitude > 29 && latitude < 30 && longitude > -96 && longitude < -95) {
      return 'Houston';
    }
    if (latitude > 30 && latitude < 31 && longitude > -98 && longitude < -97) {
      return 'Austin';
    }
    return 'Unknown';
  }

  /**
   * Get approximate state from coordinates (mock)
   */
  private getState(latitude: number, longitude: number): string {
    if (latitude > 25 && latitude < 37 && longitude > -107 && longitude < -93) {
      return 'TX';
    }
    if (latitude > 33 && latitude < 37 && longitude > -103 && longitude < -94) {
      return 'OK';
    }
    return 'Unknown';
  }
}

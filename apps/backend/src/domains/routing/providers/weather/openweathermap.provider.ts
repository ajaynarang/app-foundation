import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Configuration } from '../../../../config/configuration';
import { LatLon } from '../routing/routing-provider.interface';
import { WeatherAlert, WeatherProvider } from './weather-provider.interface';

/** Max hours ahead the free /2.5/weather (current-conditions) fallback is trustworthy. */
const CURRENT_WEATHER_MAX_LOOKAHEAD_HOURS = 3;

@Injectable()
export class OpenWeatherMapProvider implements WeatherProvider {
  private readonly logger = new Logger(OpenWeatherMapProvider.name);
  private readonly oneCallUrl = 'https://api.openweathermap.org/data/3.0/onecall';
  private readonly currentUrl = 'https://api.openweathermap.org/data/2.5/weather';

  constructor(private readonly configService: ConfigService<Configuration>) {}

  /**
   * Sample weather along the route AT the time the truck is expected to be at each
   * point. Previously this ignored departureTime and always used current
   * conditions — so a route departing in 18h got today's storm, not tomorrow's.
   *
   * Uses One Call 3.0 hourly forecast (picks the forecast hour nearest the
   * segment time). If 3.0 isn't available, it falls back to current conditions
   * ONLY when the segment time is within a few hours of now — otherwise it returns
   * nothing rather than present "now" as "then".
   */
  async getWeatherAlongRoute(waypoints: LatLon[], departureTime: Date): Promise<WeatherAlert[]> {
    const apiKey = this.configService.get<string>('openWeatherApiKey');
    if (!apiKey) {
      this.logger.warn('OpenWeather API key not configured; skipping weather lookup');
      return [];
    }

    const targetTime = departureTime ?? new Date();
    const sampled = this.sampleWaypoints(waypoints, 5);
    const alerts: WeatherAlert[] = [];

    for (const wp of sampled) {
      try {
        const alert = await this.fetchWeatherAt(wp, targetTime, apiKey);
        if (alert && alert.severity !== 'low') {
          alerts.push(alert);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to fetch weather for (${wp.lat}, ${wp.lon}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return alerts;
  }

  private sampleWaypoints(waypoints: LatLon[], maxCount: number): LatLon[] {
    if (waypoints.length <= maxCount) {
      return waypoints;
    }

    const sampled: LatLon[] = [];
    const step = (waypoints.length - 1) / (maxCount - 1);

    for (let i = 0; i < maxCount; i++) {
      const index = Math.round(i * step);
      sampled.push(waypoints[index]);
    }

    return sampled;
  }

  /** Fetch the forecast for a point at a specific time (3.0 hourly → nearest hour). */
  private async fetchWeatherAt(wp: LatLon, targetTime: Date, apiKey: string): Promise<WeatherAlert | null> {
    const forecast = await this.fetchHourlyForecast(wp, targetTime, apiKey);
    if (forecast) return this.toAlert(wp, forecast);

    // Fallback: current conditions, but only when the target time is close to now.
    const hoursAhead = (targetTime.getTime() - Date.now()) / 3600000;
    if (hoursAhead > CURRENT_WEATHER_MAX_LOOKAHEAD_HOURS || hoursAhead < -1) {
      // Too far out to honestly use "now" as the forecast — skip rather than mislead.
      return null;
    }
    const current = await this.fetchCurrent(wp, apiKey);
    return current ? this.toAlert(wp, current) : null;
  }

  /** One Call 3.0 hourly forecast → the entry nearest targetTime. Null if 3.0 unavailable. */
  private async fetchHourlyForecast(
    wp: LatLon,
    targetTime: Date,
    apiKey: string,
  ): Promise<{ main: string; description: string; tempF: number; windMph: number } | null> {
    try {
      const url = `${this.oneCallUrl}?lat=${wp.lat}&lon=${wp.lon}&exclude=minutely,daily,alerts&appid=${apiKey}&units=imperial`;
      const response = await axios.get(url, { timeout: 5000 });
      const hourly: Array<{
        dt: number;
        weather?: Array<{ main?: string; description?: string }>;
        temp?: number;
        wind_speed?: number;
      }> = response.data?.hourly ?? [];
      if (hourly.length === 0) return null;

      const targetSec = Math.floor(targetTime.getTime() / 1000);
      const nearest = hourly.reduce((best, cur) =>
        Math.abs(cur.dt - targetSec) < Math.abs(best.dt - targetSec) ? cur : best,
      );

      return {
        main: nearest.weather?.[0]?.main ?? '',
        description: nearest.weather?.[0]?.description ?? '',
        tempF: nearest.temp ?? 70,
        windMph: nearest.wind_speed ?? 0,
      };
    } catch (error) {
      // 401/404 → no 3.0 entitlement on this key; signal "fall back".
      this.logger.debug(
        `One Call 3.0 unavailable, will try current conditions: ${error instanceof Error ? error.message : error}`,
      );
      return null;
    }
  }

  private async fetchCurrent(
    wp: LatLon,
    apiKey: string,
  ): Promise<{ main: string; description: string; tempF: number; windMph: number } | null> {
    const url = `${this.currentUrl}?lat=${wp.lat}&lon=${wp.lon}&appid=${apiKey}&units=imperial`;
    const response = await axios.get(url, { timeout: 5000 });
    const data = response.data;
    return {
      main: data.weather?.[0]?.main ?? '',
      description: data.weather?.[0]?.description ?? '',
      tempF: data.main?.temp ?? 70,
      windMph: data.wind?.speed ?? 0,
    };
  }

  private toAlert(wp: LatLon, f: { main: string; description: string; tempF: number; windMph: number }): WeatherAlert {
    const { condition, severity, driveTimeMultiplier } = this.classifyWeather(f.main, f.tempF, f.windMph);
    return {
      lat: wp.lat,
      lon: wp.lon,
      condition,
      severity,
      description: f.description,
      temperatureF: f.tempF,
      windSpeedMph: f.windMph,
      driveTimeMultiplier,
    };
  }

  private classifyWeather(
    mainCondition: string,
    tempF: number,
    windMph: number,
  ): {
    condition: string;
    severity: 'low' | 'moderate' | 'severe';
    driveTimeMultiplier: number;
  } {
    const lower = mainCondition.toLowerCase();

    let condition = 'clear';
    let severity: 'low' | 'moderate' | 'severe' = 'low';
    let driveTimeMultiplier = 1.0;

    // Snow conditions
    if (lower === 'snow') {
      condition = 'snow';
      severity = 'moderate';
      // Colder temperatures make snow worse
      driveTimeMultiplier = tempF < 20 ? 1.4 : 1.2;
      if (tempF < 20) {
        severity = 'severe';
      }
    }
    // Ice: rain with near-freezing temperatures
    else if ((lower === 'rain' || lower === 'drizzle') && tempF < 35) {
      condition = 'ice';
      severity = 'severe';
      driveTimeMultiplier = 1.5;
    }
    // Thunderstorm
    else if (lower === 'thunderstorm') {
      condition = 'thunderstorm';
      severity = 'moderate';
      driveTimeMultiplier = 1.2;
    }
    // Rain / drizzle (above freezing)
    else if (lower === 'rain' || lower === 'drizzle') {
      condition = 'rain';
      severity = 'low';
      driveTimeMultiplier = 1.1;
    }
    // Fog / mist
    else if (lower === 'mist' || lower === 'fog' || lower === 'haze') {
      condition = 'fog';
      severity = 'low';
      driveTimeMultiplier = 1.15;
    }

    // High wind override -- escalate severity and multiplier
    if (windMph > 40) {
      severity = 'severe';
      if (driveTimeMultiplier < 1.3) {
        driveTimeMultiplier = 1.3;
      }
    }

    return { condition, severity, driveTimeMultiplier };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { PlatformServicesConfig } from '../platform-services.config';
import { PlatformHealthService } from '../platform-health.service';
import { IWeatherProvider, WeatherData, Waypoint } from './weather-provider.interface';
import { OpenWeatherProvider } from './providers/openweather.provider';

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private readonly provider: IWeatherProvider;

  constructor(
    private readonly config: PlatformServicesConfig,
    private readonly health: PlatformHealthService,
    private readonly openWeather: OpenWeatherProvider,
  ) {
    this.provider = this.resolveProvider(config.weather.provider);
  }

  private resolveProvider(name: string): IWeatherProvider {
    const providers: Record<string, IWeatherProvider> = {
      openweather: this.openWeather,
    };
    return providers[name] ?? this.openWeather;
  }

  async getCurrentWeather(latitude: number, longitude: number): Promise<WeatherData> {
    return this.health.withHealthTracking('weather', () => this.provider.getCurrentWeather(latitude, longitude));
  }

  async getRouteForecast(waypoints: Waypoint[]): Promise<WeatherData[]> {
    return this.health.withHealthTracking('weather', () => this.provider.getRouteForecast(waypoints));
  }
}

import { Module } from '@nestjs/common';
import { PlatformServicesCoreModule } from '../shared/platform-services-core.module';
import { WeatherService } from './weather.service';
import { OpenWeatherProvider } from './providers/openweather.provider';

@Module({
  imports: [PlatformServicesCoreModule],
  providers: [WeatherService, OpenWeatherProvider],
  exports: [WeatherService],
})
export class WeatherModule {}

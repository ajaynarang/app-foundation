import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OpenWeatherMapProvider } from './openweathermap.provider';
import { WEATHER_PROVIDER } from './weather-provider.interface';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: WEATHER_PROVIDER,
      useClass: OpenWeatherMapProvider,
    },
  ],
  exports: [WEATHER_PROVIDER],
})
export class WeatherProviderModule {}

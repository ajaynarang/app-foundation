import { Module } from '@nestjs/common';
import { PlatformServicesCoreModule } from './shared/platform-services-core.module';
import { PlatformHealthController } from './platform-health.controller';
import { WeatherModule } from './weather/weather.module';
import { FuelPricesModule } from './fuel-prices/fuel-prices.module';
import { GeocodingModule } from './geocoding/geocoding.module';
import { PlacesModule } from './places/places.module';
import { PlatformRoutingModule } from './routing/routing.module';
import { MileageModule } from './mileage/mileage.module';
import { TrafficModule } from './traffic/traffic.module';
import { TollsModule } from './tolls/tolls.module';
import { FuelCardsModule } from './fuel-cards/fuel-cards.module';

@Module({
  imports: [
    PlatformServicesCoreModule,
    WeatherModule,
    FuelPricesModule,
    FuelCardsModule,
    GeocodingModule,
    PlacesModule,
    PlatformRoutingModule,
    MileageModule,
    TrafficModule,
    TollsModule,
  ],
  controllers: [PlatformHealthController],
  exports: [
    PlatformServicesCoreModule,
    WeatherModule,
    FuelPricesModule,
    FuelCardsModule,
    GeocodingModule,
    PlacesModule,
    PlatformRoutingModule,
    MileageModule,
    TrafficModule,
    TollsModule,
  ],
})
export class PlatformServicesModule {}

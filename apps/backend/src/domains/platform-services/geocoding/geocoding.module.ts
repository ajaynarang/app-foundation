import { Module } from '@nestjs/common';
import { PlatformServicesCoreModule } from '../shared/platform-services-core.module';
import { GeocodingService } from './geocoding.service';
import { HereGeocodingProvider } from './providers/here-geocoding.provider';

@Module({
  imports: [PlatformServicesCoreModule],
  providers: [GeocodingService, HereGeocodingProvider],
  exports: [GeocodingService],
})
export class GeocodingModule {}

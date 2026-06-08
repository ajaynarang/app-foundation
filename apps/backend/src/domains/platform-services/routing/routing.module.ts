import { Module } from '@nestjs/common';
import { PlatformServicesCoreModule } from '../shared/platform-services-core.module';
import { RoutingService } from './routing.service';
import { HereMapsProvider } from './providers/here-maps.provider';

@Module({
  imports: [PlatformServicesCoreModule],
  providers: [RoutingService, HereMapsProvider],
  exports: [RoutingService],
})
export class PlatformRoutingModule {}

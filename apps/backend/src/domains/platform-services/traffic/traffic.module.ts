import { Module } from '@nestjs/common';
import { PlatformServicesCoreModule } from '../shared/platform-services-core.module';
import { TrafficService } from './traffic.service';
import { HereTrafficProvider } from './providers/here-traffic.provider';

@Module({
  imports: [PlatformServicesCoreModule],
  providers: [TrafficService, HereTrafficProvider],
  exports: [TrafficService],
})
export class TrafficModule {}

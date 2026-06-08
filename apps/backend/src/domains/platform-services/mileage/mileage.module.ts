import { Module } from '@nestjs/common';
import { PlatformServicesCoreModule } from '../shared/platform-services-core.module';
import { MileageService } from './mileage.service';
import { HereMileageProvider } from './providers/here-mileage.provider';
import { TrimblePcMilerProvider } from './providers/trimble-pcmiler.provider';

@Module({
  imports: [PlatformServicesCoreModule],
  providers: [MileageService, HereMileageProvider, TrimblePcMilerProvider],
  exports: [MileageService],
})
export class MileageModule {}

import { Module } from '@nestjs/common';
import { PlatformServicesCoreModule } from '../shared/platform-services-core.module';
import { TollService } from './toll.service';
import { HereTollProvider } from './providers/here-toll.provider';

@Module({
  imports: [PlatformServicesCoreModule],
  providers: [TollService, HereTollProvider],
  exports: [TollService],
})
export class TollsModule {}

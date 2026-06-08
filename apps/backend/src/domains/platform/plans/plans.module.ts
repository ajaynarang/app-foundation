import { Module } from '@nestjs/common';
import { PlansService } from './plans.service';
import { PlansController } from './plans.controller';
import { TrialExpiryService } from './trial-expiry.service';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { CacheModule } from '../../../infrastructure/cache/cache.module';

@Module({
  imports: [PrismaModule, CacheModule],
  controllers: [PlansController],
  providers: [PlansService, TrialExpiryService],
  exports: [PlansService, TrialExpiryService],
})
export class PlansModule {}

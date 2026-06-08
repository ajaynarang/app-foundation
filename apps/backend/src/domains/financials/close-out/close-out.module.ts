import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { CacheModule } from '../../../infrastructure/cache/cache.module';
import { LoadsModule } from '../../fleet/loads/loads.module';
import { EventBusModule } from '../../../infrastructure/events/event-bus.module';
import { CloseOutController } from './close-out.controller';
import { CloseOutService } from './close-out.service';
import { BillingReadinessService } from './billing-readiness.service';

@Module({
  imports: [PrismaModule, CacheModule, LoadsModule, EventBusModule],
  controllers: [CloseOutController],
  providers: [CloseOutService, BillingReadinessService],
  exports: [CloseOutService, BillingReadinessService],
})
export class CloseOutModule {}

import { Module } from '@nestjs/common';
import { EventBusModule } from '../../../infrastructure/events/event-bus.module';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { CacheModule } from '../../../infrastructure/cache/cache.module';
import { TripController } from './trip.controller';
import { TripService } from './trip.service';
import { TripStatusListener } from './trip-status.listener';

@Module({
  imports: [PrismaModule, EventBusModule, CacheModule],
  controllers: [TripController],
  providers: [TripService, TripStatusListener],
  exports: [TripService],
})
export class TripModule {}

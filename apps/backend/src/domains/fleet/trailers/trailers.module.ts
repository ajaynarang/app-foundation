import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { EventBusModule } from '../../../infrastructure/events/event-bus.module';
import { TrailersController } from './controllers/trailers.controller';
import { TrailersService } from './services/trailers.service';

/**
 * TrailersModule encapsulates all trailer-related functionality.
 * Part of the Fleet domain.
 */
@Module({
  imports: [PrismaModule, EventBusModule],
  controllers: [TrailersController],
  providers: [TrailersService],
  exports: [TrailersService],
})
export class TrailersModule {}

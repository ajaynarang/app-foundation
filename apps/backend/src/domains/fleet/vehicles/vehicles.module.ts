import { Module } from '@nestjs/common';
import { VehiclesController } from './controllers/vehicles.controller';
import { VehiclesService } from './services/vehicles.service';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { EventBusModule } from '../../../infrastructure/events/event-bus.module';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';

/**
 * VehiclesModule encapsulates all vehicle-related functionality.
 * Part of the Fleet domain.
 */
@Module({
  imports: [PrismaModule, EventBusModule, CustomFieldsModule],
  controllers: [VehiclesController],
  providers: [VehiclesService],
  exports: [VehiclesService],
})
export class VehiclesModule {}

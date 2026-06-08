import { Module } from '@nestjs/common';
import { CustomersController } from './controllers/customers.controller';
import { CustomersService } from './services/customers.service';
import { CustomerContactsService } from './services/customer-contacts.service';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { CacheModule } from '../../../infrastructure/cache/cache.module';
import { EventBusModule } from '../../../infrastructure/events/event-bus.module';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';

@Module({
  imports: [PrismaModule, CacheModule, EventBusModule, CustomFieldsModule],
  controllers: [CustomersController],
  providers: [CustomersService, CustomerContactsService],
  exports: [CustomersService, CustomerContactsService],
})
export class CustomersModule {}

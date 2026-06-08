import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { NotificationModule } from '../../../infrastructure/notification/notification.module';
import { CacheModule } from '../../../infrastructure/cache/cache.module';
import { EventBusModule } from '../../../infrastructure/events/event-bus.module';
import { DeskResponsibilityModule } from '../../desk/responsibilities/desk-responsibility.module';

@Module({
  imports: [PrismaModule, NotificationModule, CacheModule, EventBusModule, DeskResponsibilityModule],
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}

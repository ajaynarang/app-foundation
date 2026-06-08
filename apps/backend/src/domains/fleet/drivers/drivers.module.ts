import { Module } from '@nestjs/common';
import { DriversController } from './controllers/drivers.controller';
import { DriverTimelineController } from './controllers/driver-timeline.controller';
import { DriverMessagesController } from './controllers/driver-messages.controller';
import { DriversService } from './services/drivers.service';
import { DriversActivationService } from './services/drivers-activation.service';
import { DispatchBoardService } from './services/dispatch-board.service';
import { DriverTimelineService } from './services/driver-timeline.service';
import { DriverConversationsService } from './services/driver-conversations.service';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { CacheModule } from '../../../infrastructure/cache/cache.module';
import { EventBusModule } from '../../../infrastructure/events/event-bus.module';
import { PushModule } from '../../../infrastructure/push/push.module';
import { IntegrationsModule } from '../../integrations/integrations.module';
import { UserInvitationsModule } from '../../platform/user-invitations/user-invitations.module';
import { InAppNotificationsModule } from '../../operations/notifications/notifications.module';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';

/**
 * DriversModule encapsulates all driver-related functionality.
 * Part of the Fleet domain.
 */
@Module({
  imports: [
    PrismaModule,
    CacheModule,
    EventBusModule,
    PushModule,
    IntegrationsModule,
    UserInvitationsModule,
    InAppNotificationsModule,
    CustomFieldsModule,
  ],
  controllers: [DriversController, DriverTimelineController, DriverMessagesController],
  providers: [
    DriversService,
    DriversActivationService,
    DispatchBoardService,
    DriverTimelineService,
    DriverConversationsService,
  ],
  // DriverConversationsService is exported so LoadsModule's LoadMessagesController
  // can delegate load-scoped messaging onto the driver-keyed conversation model.
  exports: [DriversService, DriversActivationService, DispatchBoardService, DriverConversationsService],
})
export class DriversModule {}

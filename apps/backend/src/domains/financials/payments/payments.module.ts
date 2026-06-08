import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { QueueModule } from '../../../infrastructure/queue/queue.module';
import { InAppNotificationsModule } from '../../../domains/operations/notifications/notifications.module';
import { PaymentsService } from './services/payments.service';

@Module({
  imports: [PrismaModule, QueueModule, InAppNotificationsModule],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}

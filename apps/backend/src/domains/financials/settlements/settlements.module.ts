import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { QueueModule } from '../../../infrastructure/queue/queue.module';
import { InAppNotificationsModule } from '../../../domains/operations/notifications/notifications.module';
import { PayStructureService } from './services/pay-structure.service';
import { SettlementsService } from './services/settlements.service';
import { SettlementPdfService } from './services/settlement-pdf.service';
import { PayStructureController } from './controllers/pay-structure.controller';
import { SettlementsController } from './controllers/settlements.controller';

@Module({
  imports: [PrismaModule, QueueModule, InAppNotificationsModule],
  controllers: [PayStructureController, SettlementsController],
  providers: [PayStructureService, SettlementsService, SettlementPdfService],
  exports: [PayStructureService, SettlementsService, SettlementPdfService],
})
export class SettlementsModule {}

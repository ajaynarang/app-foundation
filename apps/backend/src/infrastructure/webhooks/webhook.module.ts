import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { SamsaraWebhookService } from './samsara-webhook.service';
import { PrismaModule } from '../database/prisma.module';
import { AlertsModule } from '../../domains/operations/alerts/alerts.module';

@Module({
  imports: [PrismaModule, AlertsModule],
  controllers: [WebhookController],
  providers: [SamsaraWebhookService],
})
export class WebhookModule {}

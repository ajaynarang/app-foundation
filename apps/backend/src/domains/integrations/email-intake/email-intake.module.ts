import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { StorageModule } from '../../../infrastructure/storage/storage.module';
import { QueueModule } from '../../../infrastructure/queue/queue.module';
import { LoadsModule } from '../../fleet/loads/loads.module';
import { DocumentIntelligenceModule } from '../../ai/document-intelligence/document-intelligence.module';
import { EmailIntakeWebhookController } from './controllers/email-intake-webhook.controller';
import { EmailIntakeController } from './controllers/email-intake.controller';
import { EmailIntakeSettingsController } from './controllers/email-intake-settings.controller';
import { EmailIntakeService } from './services/email-intake.service';
import { EmailFilterService } from './services/email-filter.service';
import { EmailThreadTrackerService } from './services/email-thread-tracker.service';
import { ResendInboundService } from './services/resend-inbound.service';
import { EmailIntakeJobHandler } from './processors/email-intake-job.handler';

@Module({
  imports: [
    PrismaModule,
    StorageModule,
    QueueModule,
    forwardRef(() => LoadsModule),
    forwardRef(() => DocumentIntelligenceModule),
  ],
  controllers: [EmailIntakeWebhookController, EmailIntakeController, EmailIntakeSettingsController],
  providers: [
    EmailIntakeService,
    EmailFilterService,
    EmailThreadTrackerService,
    ResendInboundService,
    EmailIntakeJobHandler,
  ],
  exports: [EmailIntakeService, EmailIntakeJobHandler],
})
export class EmailIntakeModule {}

import { Module } from '@nestjs/common';
import { PrismaModule } from '@appshore/platform/infrastructure/database/prisma.module';
import { CacheModule } from '../../../../platform-glue/cache/cache.module';
import { QueueModule } from '../../../../platform-glue/queue/queue.module';
import { InAppNotificationsModule } from '../../../notifications/notifications.module';
import { AiRoutingModule } from '../ai-routing.module';
import { AiCredentialController } from './ai-credential.controller';
import { AiCredentialConnectService } from './ai-credential-connect.service';
import { AiCredentialProbeService } from './ai-credential-probe.service';
import { AiCredentialRevalidationHandler } from './ai-credential-revalidation.handler';
import { AiCredentialRevalidationJob } from './ai-credential-revalidation.job';

/**
 * Bring-your-own-key: the `/ai-settings` routes and a credential's life (connect, test, the daily sweep, remove).
 * Routing itself is `AiRoutingModule`'s; this module is the management side on top of it. The sweep's handler is
 * exported for the `bulk-ops` dispatcher.
 */
@Module({
  imports: [PrismaModule, CacheModule, QueueModule, InAppNotificationsModule, AiRoutingModule],
  controllers: [AiCredentialController],
  providers: [
    AiCredentialConnectService,
    AiCredentialProbeService,
    AiCredentialRevalidationJob,
    AiCredentialRevalidationHandler,
  ],
  exports: [AiCredentialConnectService, AiCredentialRevalidationHandler],
})
export class AiConnectModule {}

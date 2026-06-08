import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { QueueModule } from '../../../infrastructure/queue/queue.module';
import { CacheModule } from '../../../infrastructure/cache/cache.module';
import { QuickBooksApiClient } from './vendors/quickbooks/quickbooks-api.client';
import { QuickBooksAdapter } from './vendors/quickbooks/quickbooks.adapter';
import { AccountingSyncService } from './services/accounting-sync.service';
import { AccountingMappingService } from './services/accounting-mapping.service';
import { AccountingSyncJobHandler } from './processors/accounting-sync-job.handler';
import { AccountingController } from './controllers/accounting.controller';
import { AccountingWebhookController } from './controllers/accounting-webhook.controller';
import { OAuthModule } from '../oauth/oauth.module';

@Module({
  imports: [PrismaModule, ConfigModule, QueueModule, CacheModule, OAuthModule],
  providers: [
    QuickBooksApiClient,
    QuickBooksAdapter,
    AccountingSyncService,
    AccountingMappingService,
    AccountingSyncJobHandler,
  ],
  controllers: [AccountingController, AccountingWebhookController],
  exports: [AccountingSyncService, AccountingMappingService, AccountingSyncJobHandler],
})
export class AccountingModule {}

import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { SyncModule } from './sync/sync.module';
import { CredentialsService } from './credentials/credentials.service';
import { IntegrationDataService } from './services/integration-data.service';
import { AdaptersModule } from './adapters/adapters.module';
import { QueueModule } from '../../infrastructure/queue/queue.module';
import { TelemetryProcessor } from '../../infrastructure/sync/telemetry.processor';
import { VendorDataJobHandler } from '../../infrastructure/sync/vendor-data.processor';
import { SyncQueueModule } from '../../infrastructure/sync/sync-queue.module';
import { AccountingModule } from './accounting/accounting.module';
import { OAuthModule } from './oauth/oauth.module';
import { EDIModule } from './edi/edi.module';
import { EmailIntakeModule } from './email-intake/email-intake.module';
import { EldLinkingService } from './services/eld-linking.service';
import { EldLinkingController } from './services/eld-linking.controller';

/**
 * IntegrationsModule handles external system integrations
 *
 * TelemetryProcessor + VendorDataProcessor are registered here because they
 * depend on services from SyncModule (TmsSyncService, EldSyncService). They
 * replace the old single SyncProcessor as part of the 2026-05-27 queue
 * topology redesign — ELD ingest runs on the `telemetry` queue, TMS data
 * sync runs on the rate-limited `vendor-data` queue.
 *
 * SyncQueueModule handles Bull repeatable job registration.
 * IntegrationDataService provides runtime data access (HOS, GPS, connection testing).
 * EldDataCacheService is provided by SyncModule (single instance, exported).
 */
@Module({
  imports: [
    PrismaModule,
    AdaptersModule,
    SyncModule,
    QueueModule,
    SyncQueueModule,
    AccountingModule,
    OAuthModule,
    EDIModule,
    EmailIntakeModule,
  ],
  controllers: [IntegrationsController, EldLinkingController],
  providers: [
    IntegrationsService,
    IntegrationDataService,
    CredentialsService,
    TelemetryProcessor,
    VendorDataJobHandler,
    EldLinkingService,
  ],
  exports: [IntegrationsService, IntegrationDataService, VendorDataJobHandler],
})
export class IntegrationsModule {}

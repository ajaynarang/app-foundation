import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { CredentialsService } from './credentials/credentials.service';
import { IntegrationDataService } from './services/integration-data.service';
import { AdaptersModule } from './adapters/adapters.module';
import { QueueModule } from '../../infrastructure/queue/queue.module';
import { OAuthModule } from './oauth/oauth.module';

/**
 * IntegrationsModule handles external system integrations.
 *
 * This is the integration *framework*: the controller/service CRUD surface,
 * credential encryption (AES-256), the OAuth connect/callback/refresh flow, and
 * the pluggable adapter factory. No concrete vendor connectors ship with the
 * starter — register your adapters in `AdaptersModule` and your vendor metadata
 * in `VENDOR_REGISTRY`.
 *
 * IntegrationDataService provides runtime data access and connection testing.
 */
@Module({
  imports: [PrismaModule, AdaptersModule, QueueModule, OAuthModule],
  controllers: [IntegrationsController],
  providers: [IntegrationsService, IntegrationDataService, CredentialsService],
  exports: [IntegrationsService, IntegrationDataService],
})
export class IntegrationsModule {}

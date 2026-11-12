import { Logger, Module, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaModule } from '@appshore/platform/infrastructure/database/prisma.module';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { CacheModule } from '../../../platform-glue/cache/cache.module';
import { EventBusModule } from '../../../platform-glue/events/event-bus.module';
import { InAppNotificationsModule } from '../../notifications/notifications.module';

import { AI_CREDIT_REFUSAL_SINK, AiRouteResolver } from './ai-route-resolver.service';
import { AiCredentialRefusalRecorder } from './ai-credential-refusal.recorder';
import { CredentialCryptoService } from './credential-crypto.service';

/**
 * AI routing: the route resolver. Everything that talks to a model imports this module; there is no other way to
 * obtain a provider. Platform keys come from the zod config schema (`ConfigService`, global), never `process.env`.
 * Workspace credentials (bring-your-own-key) are read from Postgres on every resolve and decrypted with
 * `CredentialCryptoService`; a credit refusal on one is recorded by `AiCredentialRefusalRecorder`.
 *
 * At boot it logs one line per need naming the platform route that serves it (`language: platform-openrouter`,
 * `embedding: none`). A missing key never stops the app. It also warns once for each retired AI variable still set
 * (`AI_PROVIDER`, `AI_GATEWAY_API_KEY`, `ANTHROPIC_API_KEY`): nothing reads them any more. And when
 * `AI_CREDENTIALS_KEY` is unset while workspaces still hold stored keys, it logs an error with their count: those
 * workspaces are refused until the key is restored or they remove the credentials.
 */
@Module({
  imports: [PrismaModule, CacheModule, EventBusModule, InAppNotificationsModule],
  providers: [
    AiRouteResolver,
    CredentialCryptoService,
    AiCredentialRefusalRecorder,
    { provide: AI_CREDIT_REFUSAL_SINK, useExisting: AiCredentialRefusalRecorder },
  ],
  exports: [AiRouteResolver, CredentialCryptoService],
})
export class AiRoutingModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(AiRoutingModule.name);

  constructor(
    private readonly resolver: AiRouteResolver,
    private readonly config: ConfigService,
    private readonly credentialCrypto: CredentialCryptoService,
    private readonly prisma: PrismaService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.resolver.logPlatformRoutes();
    for (const name of this.config.get<string[]>('retiredAiEnvVars') ?? []) {
      this.logger.warn(`${name} is set but no longer read: AI routes come from the route resolver. Remove it.`);
    }
    await this.reportUnreadableCredentials();
  }

  private async reportUnreadableCredentials(): Promise<void> {
    if (this.credentialCrypto.isConfigured()) return;
    try {
      const stranded = await this.prisma.aiCredential.count({ where: { encryptedSecret: { not: null } } });
      if (stranded > 0) {
        this.logger.error(
          `AI_CREDENTIALS_KEY is not set but ${stranded} workspace AI credential(s) are stored: those workspaces' AI ` +
            'calls are refused (never moved to the platform key) until the key is restored or the credentials removed',
        );
      }
    } catch (err) {
      this.logger.warn(`Could not count stored AI credentials at boot: ${(err as Error).message}`);
    }
  }
}

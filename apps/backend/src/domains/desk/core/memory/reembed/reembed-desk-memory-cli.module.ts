import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@appshore/platform/infrastructure/database/prisma.module';
import { OutboxService } from '@appshore/platform/infrastructure/events/outbox.service';

import configuration from '../../../../../config/configuration';
import { EmbeddingService } from '../../../../ai/infrastructure/providers/embedding.service';
import { AiTelemetryService } from '../../../../ai/infrastructure/telemetry/ai-telemetry.service';
import { AiRoutingStandaloneModule } from '../../../../ai/routing/ai-routing-standalone.module';
import { DeskMemoryReembedService } from './desk-memory-reembed.service';

/**
 * The module of `pnpm ai:reembed-desk-memory`: only what the re-embed needs, without the full `AppModule`.
 *
 * - The app's `configuration` factory, so the platform embedding key is read through the zod schema.
 * - The route resolver in its command-line form (`AiRoutingStandaloneModule`), so each tenant embeds on its own
 *   route under its own retention policy.
 * - The real `AiTelemetryService` with the real `OutboxService`: tenant content is billed to the tenant's ledger,
 *   one row per batch. Their `AI_INVOCATION_RECORDED` events stay in the outbox (a command does not publish) and the
 *   app's relay publishes them.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env.local', '.env'],
    }),
    PrismaModule,
    AiRoutingStandaloneModule,
  ],
  providers: [OutboxService, AiTelemetryService, EmbeddingService, DeskMemoryReembedService],
})
export class ReembedDeskMemoryCliModule {}

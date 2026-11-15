import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@appshore/platform/infrastructure/database/prisma.module';

import configuration from '../../../config/configuration';
import { EmbeddingService } from '../infrastructure/providers/embedding.service';
import { AiTelemetryService } from '../infrastructure/telemetry/ai-telemetry.service';
import { AiRoutingStandaloneModule } from '../routing/ai-routing-standalone.module';
import { IngestionService } from './ingestion.service';

/**
 * The ingestion CLI's module (`pnpm seed:knowledge`): only what `IngestionService` needs, without the full
 * `AppModule` (MCP, Mastra, queues).
 *
 * - The app's `configuration` factory, so the platform embedding key (`COHERE_API_KEY`) is read through the zod
 *   schema exactly as the app reads it.
 * - The route resolver (`AiRoutingStandaloneModule`, the command-line form of `AiRoutingModule`), because
 *   `EmbeddingService` takes its model from it.
 * - A no-op `AiTelemetryService`: the global knowledge base has no tenant, so ingest embeds through
 *   `embedForPlatform`, which writes no ledger row. The stub keeps the CLI's graph small.
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
  providers: [
    { provide: AiTelemetryService, useValue: { record: () => Promise.resolve(undefined) } },
    EmbeddingService,
    IngestionService,
  ],
})
export class IngestionCliModule {}

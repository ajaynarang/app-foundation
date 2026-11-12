import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@appshore/platform/infrastructure/database/prisma.module';

import configuration from '../../../../config/configuration';
import { EmbeddingService } from '../../infrastructure/providers/embedding.service';
import { AiTelemetryService } from '../../infrastructure/telemetry/ai-telemetry.service';
import { AiRoutingStandaloneModule } from '../../routing/ai-routing-standalone.module';
import { KnowledgeBaseService } from '../knowledge-base.service';

/**
 * The `pnpm kb:eval` module: only what the search path needs, without the full `AppModule`. Queries embed on the
 * platform route (`platformQuery`), which writes no ledger row, so the telemetry service is a no-op stub, as in
 * `IngestionCliModule`.
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
    KnowledgeBaseService,
  ],
})
export class KbEvalCliModule {}

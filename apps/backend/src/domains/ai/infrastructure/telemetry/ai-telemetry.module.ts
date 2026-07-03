import { Module } from '@nestjs/common';

import { PrismaModule } from '@appshore/platform/infrastructure/database/prisma.module';
import { CacheModule } from '../../../../platform-glue/cache/cache.module';
import { EventBusModule } from '../../../../platform-glue/events/event-bus.module';

import { AiTelemetryService } from './ai-telemetry.service';

/**
 * AiTelemetryModule — provides `AiTelemetryService`, the single write path
 * for the AI cost ledger. Wired into `AiInfrastructureModule` (and from
 * there into every AI surface) so callers can record token + cost
 * telemetry against the same backing table.
 *
 * Sprint 1 PR 1 introduces the module + service standalone. Callers
 * (StructuredOutputService, Mastra runner, EmbeddingService, alert
 * briefing) are wired in PR 2-4.
 */
@Module({
  imports: [PrismaModule, CacheModule, EventBusModule],
  providers: [AiTelemetryService],
  exports: [AiTelemetryService],
})
export class AiTelemetryModule {}

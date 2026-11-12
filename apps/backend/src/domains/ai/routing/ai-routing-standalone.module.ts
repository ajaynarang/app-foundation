import { Module } from '@nestjs/common';

import { PrismaModule } from '@appshore/platform/infrastructure/database/prisma.module';
import { DomainEventService } from '@appshore/kernel/infrastructure/events/domain-event.service';
import { CacheModule } from '../../../platform-glue/cache/cache.module';

import { AiRouteResolver } from './ai-route-resolver.service';

/**
 * The route resolver for a command-line process (`pnpm seed:knowledge`, `pnpm ai:reembed-desk-memory`), which boots
 * a small module of its own instead of the app. The resolver is the same class with the same rules; only its
 * signal bus differs.
 *
 * `AiRoutingModule` imports the app's event bus, which brings the outbound-webhook queues and the queue board, and
 * those do not start outside the app. The resolver uses the bus for one thing: the `AI_ZERO_RETENTION_UNAVAILABLE`
 * signal, which has no write behind it. A command gets a bus that drops it; the refusal itself
 * (`ZeroRetentionUnavailable`) is thrown exactly as in the app, and the command reports it.
 *
 * It needs the configuration factory loaded globally (`ConfigModule.forRoot({ load: [configuration] })`) by the
 * command's root module, plus `DATABASE_URL` and `REDIS_URL`.
 */
@Module({
  imports: [PrismaModule, CacheModule],
  providers: [AiRouteResolver, { provide: DomainEventService, useValue: { emit: () => Promise.resolve(undefined) } }],
  exports: [AiRouteResolver],
})
export class AiRoutingStandaloneModule {}

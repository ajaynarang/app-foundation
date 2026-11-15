import { Module } from '@nestjs/common';

import { PrismaModule } from '@appshore/platform/infrastructure/database/prisma.module';
import { DomainEventService } from '@appshore/kernel/infrastructure/events/domain-event.service';
import { CacheModule } from '../../../platform-glue/cache/cache.module';

import { AiRouteResolver } from './ai-route-resolver.service';
import { CredentialCryptoService } from './credential-crypto.service';
import { TenantSubKeyReader } from './provisioning/tenant-sub-key.reader';

/** The event bus of a command-line process; see `AiRoutingStandaloneModule`. */
export const COMMAND_EVENT_BUS = {
  emit: (): Promise<undefined> => Promise.resolve(undefined),
  publish: (): Promise<never> => Promise.reject(new Error('a command does not publish; the outbox relay will')),
};

/**
 * The route resolver for a command-line process (`pnpm seed:knowledge`, `pnpm ai:reembed-desk-memory`), which boots
 * a small module of its own instead of the app. The resolver is the same class with the same rules; only its
 * signal bus differs.
 *
 * `AiRoutingModule` imports the app's event bus, which brings the outbound-webhook queues and the queue board, and
 * those do not start outside the app. A command gets `COMMAND_EVENT_BUS` instead, exported as `DomainEventService`:
 * - `emit` (signals with no write behind them, such as the resolver's `AI_ZERO_RETENTION_UNAVAILABLE`) is dropped.
 *   The refusal itself (`ZeroRetentionUnavailable`) is thrown exactly as in the app, and the command reports it.
 * - `publish` refuses, so an event a command stages in the outbox (a ledger row's `AI_INVOCATION_RECORDED`) stays
 *   unpublished and the app's outbox relay publishes it. Nothing is lost; it is only late.
 *
 * A workspace credential's credit refusal is not recorded here (no notification pipeline in a command); the command's
 * call still fails with the refusal.
 *
 * It needs the configuration factory loaded globally (`ConfigModule.forRoot({ load: [configuration] })`) by the
 * command's root module, plus `DATABASE_URL` and `REDIS_URL`.
 */
@Module({
  imports: [PrismaModule, CacheModule],
  providers: [
    AiRouteResolver,
    CredentialCryptoService,
    TenantSubKeyReader,
    { provide: DomainEventService, useValue: COMMAND_EVENT_BUS },
  ],
  exports: [AiRouteResolver, DomainEventService],
})
export class AiRoutingStandaloneModule {}

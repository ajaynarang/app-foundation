import { Module, type OnApplicationBootstrap } from '@nestjs/common';

import { PrismaModule } from '@appshore/platform/infrastructure/database/prisma.module';
import { CacheModule } from '../../../platform-glue/cache/cache.module';
import { EventBusModule } from '../../../platform-glue/events/event-bus.module';

import { AiRouteResolver } from './ai-route-resolver.service';

/**
 * AI routing: the route resolver. Everything that talks to a model imports this module; there is no other way to
 * obtain a provider. Platform keys come from the zod config schema (`ConfigService`, global), never `process.env`.
 *
 * At boot it logs one line per need naming the platform route that serves it (`language: platform-openrouter`,
 * `embedding: none`). A missing key never stops the app.
 */
@Module({
  imports: [PrismaModule, CacheModule, EventBusModule],
  providers: [AiRouteResolver],
  exports: [AiRouteResolver],
})
export class AiRoutingModule implements OnApplicationBootstrap {
  constructor(private readonly resolver: AiRouteResolver) {}

  onApplicationBootstrap(): void {
    this.resolver.logPlatformRoutes();
  }
}

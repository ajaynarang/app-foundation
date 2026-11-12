import { Logger, Module, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaModule } from '@appshore/platform/infrastructure/database/prisma.module';
import { CacheModule } from '../../../platform-glue/cache/cache.module';
import { EventBusModule } from '../../../platform-glue/events/event-bus.module';

import { AiRouteResolver } from './ai-route-resolver.service';

/**
 * AI routing: the route resolver. Everything that talks to a model imports this module; there is no other way to
 * obtain a provider. Platform keys come from the zod config schema (`ConfigService`, global), never `process.env`.
 *
 * At boot it logs one line per need naming the platform route that serves it (`language: platform-openrouter`,
 * `embedding: none`). A missing key never stops the app. It also warns once for each retired AI variable still set
 * (`AI_PROVIDER`, `AI_GATEWAY_API_KEY`, `ANTHROPIC_API_KEY`): nothing reads them any more.
 */
@Module({
  imports: [PrismaModule, CacheModule, EventBusModule],
  providers: [AiRouteResolver],
  exports: [AiRouteResolver],
})
export class AiRoutingModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(AiRoutingModule.name);

  constructor(
    private readonly resolver: AiRouteResolver,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    this.resolver.logPlatformRoutes();
    for (const name of this.config.get<string[]>('retiredAiEnvVars') ?? []) {
      this.logger.warn(`${name} is set but no longer read: AI routes come from the route resolver. Remove it.`);
    }
  }
}

import { Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { AppCacheService } from '@appshore/platform/infrastructure/cache/app-cache.service';
import { DomainEventService } from '@appshore/kernel/infrastructure/events/domain-event.service';
import { AiRouteResolver } from '../ai-route-resolver.service';
import { AiRoutingModule } from '../ai-routing.module';

describe('AiRoutingModule', () => {
  afterEach(() => jest.restoreAllMocks());

  it('exports the resolver, which Nest can build with platform keys from the config schema', async () => {
    expect(Reflect.getMetadata('exports', AiRoutingModule)).toEqual([AiRouteResolver]);
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ ignoreEnvFile: true, load: [() => ({ openRouterApiKey: 'sk-or-test' })] })],
      providers: [
        AiRouteResolver,
        { provide: PrismaService, useValue: {} },
        { provide: AppCacheService, useValue: {} },
        { provide: DomainEventService, useValue: {} },
      ],
    }).compile();
    const resolver = moduleRef.get(AiRouteResolver);
    expect(resolver.describePlatformRoutes()).toEqual({ language: 'platform-openrouter', embedding: 'none' });
    expect(resolver.resolvePlatform('language').routeId).toBe('platform-openrouter');
  });

  it('logs the platform routes once at boot', () => {
    const resolver = { logPlatformRoutes: jest.fn() } as unknown as AiRouteResolver;
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    new AiRoutingModule(resolver).onApplicationBootstrap();
    expect(resolver.logPlatformRoutes).toHaveBeenCalledTimes(1);
  });
});

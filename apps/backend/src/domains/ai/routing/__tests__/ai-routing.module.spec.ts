import { Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { AppCacheService } from '@appshore/platform/infrastructure/cache/app-cache.service';
import { DomainEventService } from '@appshore/kernel/infrastructure/events/domain-event.service';
import { AiRouteResolver } from '../ai-route-resolver.service';
import { AiRoutingModule } from '../ai-routing.module';
import { CredentialCryptoService } from '../credential-crypto.service';
import { TEST_CREDENTIALS_KEY } from './resolver-fixtures';

describe('AiRoutingModule', () => {
  afterEach(() => jest.restoreAllMocks());

  const boot = (config: Record<string, unknown>, count = jest.fn().mockResolvedValue(0)) => {
    const resolver = { logPlatformRoutes: jest.fn() } as unknown as AiRouteResolver;
    const configService = new ConfigService(config);
    const prisma = { aiCredential: { count } } as unknown as PrismaService;
    return {
      resolver,
      count,
      run: () =>
        new AiRoutingModule(
          resolver,
          configService,
          new CredentialCryptoService(configService),
          prisma,
        ).onApplicationBootstrap(),
    };
  };

  it('exports the resolver and the credential cipher; Nest builds the resolver with platform keys from the config schema', async () => {
    expect(Reflect.getMetadata('exports', AiRoutingModule)).toEqual([AiRouteResolver, CredentialCryptoService]);
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ ignoreEnvFile: true, load: [() => ({ openRouterApiKey: 'sk-or-test' })] })],
      providers: [
        AiRouteResolver,
        CredentialCryptoService,
        { provide: PrismaService, useValue: {} },
        { provide: AppCacheService, useValue: {} },
        { provide: DomainEventService, useValue: {} },
      ],
    }).compile();
    const resolver = moduleRef.get(AiRouteResolver);
    expect(resolver.describePlatformRoutes()).toEqual({ language: 'platform-openrouter', embedding: 'none' });
    expect(resolver.resolvePlatform('language').routeId).toBe('platform-openrouter');
  });

  it('logs the platform routes once at boot', async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const { resolver, run } = boot({});
    await run();
    expect(resolver.logPlatformRoutes).toHaveBeenCalledTimes(1);
  });

  it('warns once at boot for each retired AI variable still set, naming it and never its value', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    await boot({ retiredAiEnvVars: ['AI_PROVIDER', 'ANTHROPIC_API_KEY'] }).run();
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0][0]).toContain('AI_PROVIDER');
    expect(warn.mock.calls[1][0]).toContain('ANTHROPIC_API_KEY');
  });

  it('warns about nothing when no retired variable is set', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    await boot({ retiredAiEnvVars: [] }).run();
    expect(warn).not.toHaveBeenCalled();
  });

  describe('AI_CREDENTIALS_KEY removed while workspaces hold stored keys', () => {
    it('logs an error with the count of credentials that can no longer be read', async () => {
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const { run, count } = boot({}, jest.fn().mockResolvedValue(3));
      await run();
      expect(count).toHaveBeenCalledWith({ where: { encryptedSecret: { not: null } } });
      expect(error).toHaveBeenCalledWith(expect.stringContaining('3 workspace AI credential(s)'));
    });

    it('says nothing when the key is set, or when no credential is stored', async () => {
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const withKey = boot({ aiCredentialsKey: TEST_CREDENTIALS_KEY }, jest.fn().mockResolvedValue(3));
      await withKey.run();
      expect(withKey.count).not.toHaveBeenCalled();
      await boot({}).run();
      expect(error).not.toHaveBeenCalled();
    });

    it('a database error at boot is a warning, never a failed boot', async () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      await expect(boot({}, jest.fn().mockRejectedValue(new Error('db down'))).run()).resolves.toBeUndefined();
    });
  });
});

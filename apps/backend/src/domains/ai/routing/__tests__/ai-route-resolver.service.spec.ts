import { Logger } from '@nestjs/common';
import { DOMAIN_EVENTS } from '../../../../platform-glue/events/domain-events.constants';
import { AiNotConfigured } from '../ai-not-configured.error';
import { ZeroRetentionUnavailable } from '../../infrastructure/redaction/zero-retention-unavailable.error';
import { EMBEDDING_CATALOG, MODEL_CATALOG } from '../model-catalog';
import { PLATFORM_ROUTES, type PlatformRoute } from '../route-registry';
import { retentionPolicyCacheKey } from '../ai-route-resolver.service';
import { makeResolver, TENANT } from './resolver-fixtures';

jest.mock('@appshore/kernel/shared/utils/env-type', () => ({ getEnvType: jest.fn(() => 'development') }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getEnvType } = require('@appshore/kernel/shared/utils/env-type') as { getEnvType: jest.Mock };

const OPENROUTER = { openRouterApiKey: 'sk-or-test' };
const COHERE = { cohereApiKey: 'co-test' };
const BOTH = { ...OPENROUTER, ...COHERE };

describe('AiRouteResolver (platform pool)', () => {
  let errorLog: jest.SpyInstance;
  let warnLog: jest.SpyInstance;
  let infoLog: jest.SpyInstance;

  beforeEach(() => {
    getEnvType.mockReturnValue('development');
    errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    warnLog = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    infoLog = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('keyless dev: no platform key → AiNotConfigured for both needs (graceful degrade)', async () => {
    const { resolver } = makeResolver();
    await expect(resolver.resolve(TENANT, 'language')).rejects.toThrow(AiNotConfigured);
    await expect(resolver.resolve(TENANT, 'embedding')).rejects.toThrow(AiNotConfigured);
  });

  it('standard tenant + OPENROUTER_API_KEY → platform-openrouter, payer PLATFORM, catalog slug', async () => {
    const route = await makeResolver({ config: OPENROUTER }).resolver.resolve(TENANT, 'language');
    expect(route).toMatchObject({
      routeId: 'platform-openrouter',
      credentialType: 'PLATFORM_OPENROUTER',
      payer: 'PLATFORM',
      retention: 'STANDARD',
      providerLabel: 'openrouter',
    });
    expect(route.modelIdFor('standard')).toBe(MODEL_CATALOG.standard.openrouterId);
    expect(route.languageModel('fast')).toMatchObject({ modelId: MODEL_CATALOG.fast.openrouterId });
  });

  it('standard tenant + COHERE_API_KEY → platform-cohere for embeddings', async () => {
    const route = await makeResolver({ config: COHERE }).resolver.resolve(TENANT, 'embedding');
    expect(route).toMatchObject({
      routeId: 'platform-cohere',
      credentialType: 'PLATFORM_COHERE',
      payer: 'PLATFORM',
      providerLabel: 'cohere',
    });
    expect(route.embeddingModelId()).toBe(EMBEDDING_CATALOG.cohereDirectId);
    expect(route.embeddingModel()).toBeDefined();
  });

  it('the pool is decided per need: a key for one need does not serve the other', async () => {
    const { resolver } = makeResolver({ config: OPENROUTER });
    await expect(resolver.resolve(TENANT, 'embedding')).rejects.toThrow(AiNotConfigured);
  });

  it('a language route refuses embeddingModel(), an embedding route refuses languageModel()', async () => {
    const { resolver } = makeResolver({ config: BOTH });
    const language = await resolver.resolve(TENANT, 'language');
    expect(() => language.embeddingModel()).toThrow(AiNotConfigured);
    expect(() => language.embeddingModelId()).toThrow(AiNotConfigured);
    const embedding = await resolver.resolve(TENANT, 'embedding');
    expect(() => embedding.languageModel('fast')).toThrow(AiNotConfigured);
    expect(() => embedding.modelIdFor('fast')).toThrow(AiNotConfigured);
  });

  describe('zero-retention tenant', () => {
    it('is refused on language and embedding when only standard routes exist, and the provider is never built', async () => {
      const builds = PLATFORM_ROUTES.map((r) => jest.spyOn(r, 'buildProvider'));
      const { resolver, events } = makeResolver({ aiZeroRetention: true, config: BOTH });
      await expect(resolver.resolve(TENANT, 'language')).rejects.toThrow(ZeroRetentionUnavailable);
      await expect(resolver.resolve(TENANT, 'embedding')).rejects.toThrow(ZeroRetentionUnavailable);
      for (const build of builds) expect(build).not.toHaveBeenCalled();
      expect(events.emit).toHaveBeenCalledWith(DOMAIN_EVENTS.AI_ZERO_RETENTION_UNAVAILABLE, TENANT, {
        need: 'language',
      });
      expect(events.emit).toHaveBeenCalledWith(DOMAIN_EVENTS.AI_ZERO_RETENTION_UNAVAILABLE, TENANT, {
        need: 'embedding',
      });
    });

    it('a need NOTHING serves is AiNotConfigured, not a retention block (no misleading event)', async () => {
      const { resolver, events } = makeResolver({ aiZeroRetention: true, config: OPENROUTER });
      await expect(resolver.resolve(TENANT, 'embedding')).rejects.toThrow(AiNotConfigured);
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('a failing event emit never changes the refusal', async () => {
      const { resolver, events } = makeResolver({ aiZeroRetention: true, config: BOTH });
      events.emit.mockRejectedValue(new Error('redis down'));
      await expect(resolver.resolve(TENANT, 'language')).rejects.toThrow(ZeroRetentionUnavailable);
    });

    it('a zero-retention route refuses an alias that is not zdrCapable, at the model getter', async () => {
      // No zero-retention platform route is registered yet, so the spec adds one for its duration.
      const zdrRoute: PlatformRoute = {
        ...PLATFORM_ROUTES[0],
        retention: 'ZDR',
        isConfigured: () => true,
      };
      const registry = PLATFORM_ROUTES as PlatformRoute[];
      registry.push(zdrRoute);
      const original = MODEL_CATALOG.fast.zdrCapable;
      MODEL_CATALOG.fast.zdrCapable = false;
      try {
        const route = await makeResolver({ aiZeroRetention: true }).resolver.resolve(TENANT, 'language');
        expect(route.retention).toBe('ZDR');
        expect(() => route.languageModel('fast')).toThrow(ZeroRetentionUnavailable);
        expect(() => route.languageModel('standard')).not.toThrow();
      } finally {
        MODEL_CATALOG.fast.zdrCapable = original;
        registry.splice(registry.indexOf(zdrRoute), 1);
      }
    });
  });

  it('reads the retention policy through the hot cache under the key a policy change deletes', async () => {
    const { resolver, cache, prisma } = makeResolver({ aiZeroRetention: true });
    expect(await resolver.isZeroRetention(TENANT)).toBe(true);
    expect(cache.getOrSet).toHaveBeenCalledWith(retentionPolicyCacheKey(TENANT), expect.any(Function), 60_000);
    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
      where: { id: TENANT },
      select: { aiZeroRetention: true },
    });
  });

  it('builds a platform bundle once and reuses it across resolves', async () => {
    const build = jest.spyOn(PLATFORM_ROUTES[0], 'buildProvider');
    const { resolver } = makeResolver({ config: OPENROUTER });
    await resolver.resolve(TENANT, 'language');
    await resolver.resolve(TENANT + 1, 'language');
    expect(build).toHaveBeenCalledTimes(1);
    expect(build).toHaveBeenCalledWith(OPENROUTER);
  });

  describe('resolvePlatform (platform-owned content, no tenant)', () => {
    it('returns a standard platform route and never reads a tenant', () => {
      const { resolver, prisma } = makeResolver({ config: COHERE });
      const route = resolver.resolvePlatform('embedding');
      expect(route).toMatchObject({ routeId: 'platform-cohere', payer: 'PLATFORM', retention: 'STANDARD' });
      expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
    });

    it('nothing configured → AiNotConfigured', () => {
      expect(() => makeResolver().resolver.resolvePlatform('embedding')).toThrow(AiNotConfigured);
    });
  });

  describe('logging', () => {
    it('logs AiNotConfigured at error level in production only', async () => {
      await expect(makeResolver().resolver.resolve(TENANT, 'language')).rejects.toThrow(AiNotConfigured);
      expect(errorLog).not.toHaveBeenCalled();

      getEnvType.mockReturnValue('production');
      await expect(makeResolver().resolver.resolve(TENANT, 'language')).rejects.toThrow(AiNotConfigured);
      expect(() => makeResolver().resolver.resolvePlatform('embedding')).toThrow(AiNotConfigured);
      expect(errorLog).toHaveBeenCalledTimes(2);
    });

    it('treats an unset ENV_TYPE as not production', async () => {
      getEnvType.mockImplementation(() => {
        throw new Error('ENV_TYPE is required');
      });
      await expect(makeResolver().resolver.resolve(TENANT, 'language')).rejects.toThrow(AiNotConfigured);
      expect(errorLog).not.toHaveBeenCalled();
    });

    it('describes the platform route per need, "none" where nothing is configured', () => {
      expect(makeResolver({ config: OPENROUTER }).resolver.describePlatformRoutes()).toEqual({
        language: 'platform-openrouter',
        embedding: 'none',
      });
      expect(makeResolver({ config: BOTH }).resolver.describePlatformRoutes()).toEqual({
        language: 'platform-openrouter',
        embedding: 'platform-cohere',
      });
    });

    it('boot logs one line per need: info normally, warn in production for a need with no route', () => {
      makeResolver({ config: OPENROUTER }).resolver.logPlatformRoutes();
      expect(infoLog.mock.calls.map((c) => c[0])).toEqual(['language: platform-openrouter', 'embedding: none']);
      expect(warnLog).not.toHaveBeenCalled();

      infoLog.mockClear();
      getEnvType.mockReturnValue('production');
      makeResolver({ config: OPENROUTER }).resolver.logPlatformRoutes();
      expect(infoLog.mock.calls.map((c) => c[0])).toEqual(['language: platform-openrouter']);
      expect(warnLog.mock.calls.map((c) => c[0])).toEqual(['embedding: none']);
    });
  });
});

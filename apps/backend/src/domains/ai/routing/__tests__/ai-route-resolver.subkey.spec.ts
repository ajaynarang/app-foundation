import { Logger } from '@nestjs/common';
import { PLATFORM_ROUTES } from '../route-registry';
import { credentialRow, makeResolver, subKeyRow, TENANT, TEST_CREDENTIALS_KEY } from './resolver-fixtures';

const MASTER = 'sk-or-master-env-key';
const SUB_KEY = 'sk-or-v1-subkey-t7-fake';
const CONFIG = { openRouterApiKey: MASTER, aiCredentialsKey: TEST_CREDENTIALS_KEY };

const openrouterRoute = () => PLATFORM_ROUTES.find((r) => r.routeId === 'platform-openrouter');

/** The OpenRouter key each bundle the resolver built was created with, in build order. */
function builtWithKeys(spy: jest.SpyInstance): (string | undefined)[] {
  return spy.mock.calls.map(([config]) => config.openRouterApiKey);
}

describe('platform-openrouter per-workspace sub-keys', () => {
  let build: jest.SpyInstance;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    build = jest.spyOn(openrouterRoute(), 'buildProvider');
  });
  afterEach(() => jest.restoreAllMocks());

  it('calls with the workspace sub-key when one is stored; payer and route id stay the platform', async () => {
    const { resolver } = makeResolver({ config: CONFIG, subKeyRow: subKeyRow(SUB_KEY) });
    const route = await resolver.resolve(TENANT, 'language');
    expect(route).toMatchObject({
      routeId: 'platform-openrouter',
      payer: 'PLATFORM',
      credentialType: 'PLATFORM_OPENROUTER',
    });
    expect(route.languageModel('fast')).toBeDefined();
    expect(builtWithKeys(build)).toEqual([SUB_KEY]);
  });

  it('falls back to the master key without a sub-key', async () => {
    const { resolver } = makeResolver({ config: CONFIG, subKeyRow: null });
    await resolver.resolve(TENANT, 'language');
    expect(builtWithKeys(build)).toEqual([MASTER]);
    expect(resolver.cachedBundleKeys()).toEqual(['platform:platform-openrouter']);
  });

  it('a sub-key that will not decrypt falls back to the master key, and the resolve does not fail', async () => {
    const tampered = { ...subKeyRow(SUB_KEY), encryptedKey: subKeyRow(SUB_KEY, undefined, TENANT + 1).encryptedKey };
    const { resolver } = makeResolver({ config: CONFIG, subKeyRow: tampered });
    const route = await resolver.resolve(TENANT, 'language');
    expect(route.routeId).toBe('platform-openrouter');
    expect(builtWithKeys(build)).toEqual([MASTER]);
  });

  it('with the credentials key removed, a stored sub-key falls back to the master key', async () => {
    const { resolver } = makeResolver({ config: { openRouterApiKey: MASTER }, subKeyRow: subKeyRow(SUB_KEY) });
    await resolver.resolve(TENANT, 'language');
    expect(builtWithKeys(build)).toEqual([MASTER]);
  });

  it('a failed sub-key read falls back to the master key', async () => {
    const { resolver, prisma } = makeResolver({ config: CONFIG });
    prisma.tenantAiSubKey.findUnique.mockRejectedValue(new Error('pool exhausted'));
    await expect(resolver.resolve(TENANT, 'language')).resolves.toMatchObject({ routeId: 'platform-openrouter' });
    expect(builtWithKeys(build)).toEqual([MASTER]);
  });

  it('gives the workspace its own cached bundle, and a rotated key evicts the old one', async () => {
    const { resolver, prisma } = makeResolver({
      config: CONFIG,
      subKeyRow: subKeyRow('k1', new Date('2026-11-01T00:00:00Z')),
    });
    await resolver.resolve(TENANT, 'language');
    await resolver.resolve(TENANT, 'language');
    const first = `platform:platform-openrouter:${TENANT}:${new Date('2026-11-01T00:00:00Z').getTime()}`;
    expect(resolver.cachedBundleKeys()).toEqual([first]);
    expect(build).toHaveBeenCalledTimes(1);

    prisma.tenantAiSubKey.findUnique.mockResolvedValue(subKeyRow('k2', new Date('2026-11-02T00:00:00Z')));
    await resolver.resolve(TENANT, 'language');
    const second = `platform:platform-openrouter:${TENANT}:${new Date('2026-11-02T00:00:00Z').getTime()}`;
    // The old bundle (and the old key inside its closure) is gone; only the new one is held.
    expect(resolver.cachedBundleKeys()).toEqual([second]);
    expect(builtWithKeys(build)).toEqual(['k1', 'k2']);
  });

  it('two workspaces never share a sub-key bundle, and neither shares the master bundle', async () => {
    const { resolver, prisma } = makeResolver({ config: CONFIG });
    prisma.tenantAiSubKey.findUnique.mockImplementation(async ({ where }: { where: { tenantId: number } }) =>
      where.tenantId === 7
        ? subKeyRow('sk-or-tenant7', undefined, 7)
        : where.tenantId === 8
          ? subKeyRow('sk-or-tenant8', undefined, 8)
          : null,
    );
    const pools7 = await resolver.candidatePools(7, 'language');
    const pools8 = await resolver.candidatePools(8, 'language');
    const pools9 = await resolver.candidatePools(9, 'language');
    const key7 = pools7.candidates[0].cacheKey;
    const key8 = pools8.candidates[0].cacheKey;
    expect(key7).toContain(':7:');
    expect(key8).toContain(':8:');
    expect(key7).not.toBe(key8);
    expect(pools7.candidates[0].evictPrefix).toBe('platform:platform-openrouter:7:');
    expect(pools9.candidates[0].cacheKey).toBe('platform:platform-openrouter');
  });

  it('is never read for embeddings: other platform routes stay shared', async () => {
    const { resolver, prisma } = makeResolver({
      config: { ...CONFIG, cohereApiKey: 'co-test' },
      subKeyRow: subKeyRow(SUB_KEY),
    });
    const pools = await resolver.candidatePools(TENANT, 'embedding');
    expect(pools.candidates[0]).toMatchObject({ routeId: 'platform-cohere', cacheKey: 'platform:platform-cohere' });
    expect(pools.candidates[0].evictPrefix).toBeUndefined();
    expect(prisma.tenantAiSubKey.findUnique).not.toHaveBeenCalled();
  });

  it('is never read when the workspace pays with its own credential', async () => {
    const { resolver, prisma } = makeResolver({
      config: CONFIG,
      credentials: [credentialRow()],
      subKeyRow: subKeyRow(SUB_KEY),
    });
    const route = await resolver.resolve(TENANT, 'language');
    expect(route.payer).toBe('TENANT');
    expect(prisma.tenantAiSubKey.findUnique).not.toHaveBeenCalled();
  });

  it('is not used without the master key: platform-openrouter stays off', async () => {
    const { resolver } = makeResolver({
      config: { aiCredentialsKey: TEST_CREDENTIALS_KEY },
      subKeyRow: subKeyRow(SUB_KEY),
    });
    await expect(resolver.resolve(TENANT, 'language')).rejects.toThrow();
    expect(build).not.toHaveBeenCalled();
  });

  it('resolvePlatform (no tenant, global knowledge base) never reads a sub-key', () => {
    const { resolver, prisma } = makeResolver({ config: CONFIG, subKeyRow: subKeyRow(SUB_KEY) });
    expect(resolver.resolvePlatform('language').routeId).toBe('platform-openrouter');
    expect(prisma.tenantAiSubKey.findUnique).not.toHaveBeenCalled();
    expect(builtWithKeys(build)).toEqual([MASTER]);
  });
});

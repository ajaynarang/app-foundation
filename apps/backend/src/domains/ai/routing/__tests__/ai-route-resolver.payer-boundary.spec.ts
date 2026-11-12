import { Logger } from '@nestjs/common';
import { AiCredentialStatus, AiCredentialType } from '@appshore/db';
import { AiCredentialFailing } from '../ai-credential-failing.error';
import { ZeroRetentionUnavailable } from '../../infrastructure/redaction/zero-retention-unavailable.error';
import { MODEL_CATALOG } from '../model-catalog';
import { PLATFORM_ROUTES } from '../route-registry';
import { MAX_AI_CREDENTIALS_PER_WORKSPACE } from '../ai-route-resolver.service';
import { credentialRow, makeResolver, TENANT, TEST_CREDENTIALS_KEY } from './resolver-fixtures';

const PLATFORM_KEYS = { openRouterApiKey: 'sk-or-test', cohereApiKey: 'co-test' };
const BYOK_ON = { ...PLATFORM_KEYS, aiCredentialsKey: TEST_CREDENTIALS_KEY };

/** A pool is the workspace's credentials or the platform's routes, never both; a failing workspace key never falls through. */
describe('AiRouteResolver: the payer boundary', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('workspace credentials present: the pool is TENANT-only even with every platform route configured', async () => {
    const pools = await makeResolver({ config: BYOK_ON, credentials: [credentialRow()] }).resolver.candidatePools(
      TENANT,
      'language',
    );
    expect(pools.payer).toBe('TENANT');
    expect(pools.candidates.every((c) => c.payer === 'TENANT')).toBe(true);
    expect(pools.candidates.some((c) => c.routeId.startsWith('platform-'))).toBe(false);
  });

  it('a resolved workspace key carries its public id as the route, its type, payer TENANT and the anthropic pair', async () => {
    const route = await makeResolver({ config: BYOK_ON, credentials: [credentialRow()] }).resolver.resolve(
      TENANT,
      'language',
    );
    expect(route).toMatchObject({
      routeId: 'aicred_test000001',
      credentialType: 'ANTHROPIC_KEY',
      payer: 'TENANT',
      retention: 'STANDARD',
      providerLabel: 'anthropic',
      promptCache: 'anthropic',
    });
    expect(route.modelIdFor('standard')).toBe(MODEL_CATALOG.standard.anthropicId);
    expect(route.languageModel('fast')).toBeDefined();
  });

  it('no workspace credentials: the pool is PLATFORM-only', async () => {
    const pools = await makeResolver({ config: BYOK_ON }).resolver.candidatePools(TENANT, 'language');
    expect(pools.payer).toBe('PLATFORM');
    expect(pools.candidates.length).toBeGreaterThan(0);
    expect(pools.candidates.every((c) => c.payer === 'PLATFORM')).toBe(true);
  });

  it('the first ACTIVE credential by priority serves (rows arrive ordered by priority)', async () => {
    const { resolver, prisma } = makeResolver({
      config: BYOK_ON,
      credentials: [
        credentialRow({ id: 1, publicId: 'aicred_first00001', priority: 0, status: AiCredentialStatus.FAILING }),
        credentialRow({ id: 2, publicId: 'aicred_second0002', priority: 1, type: AiCredentialType.OPENROUTER_KEY }),
        credentialRow({ id: 3, publicId: 'aicred_third00003', priority: 2 }),
      ],
    });
    const route = await resolver.resolve(TENANT, 'language');
    expect(route.routeId).toBe('aicred_second0002');
    expect(route.providerLabel).toBe('openrouter');
    expect(prisma.aiCredential.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT },
      orderBy: { priority: 'asc' },
      take: MAX_AI_CREDENTIALS_PER_WORKSPACE,
    });
  });

  it('a credential inert under zero retention is absent: the pool flips to the platform, still single-payer', async () => {
    const pools = await makeResolver({
      aiZeroRetention: true,
      config: BYOK_ON,
      credentials: [credentialRow()], // unattested: standard retention, inert under the policy
    }).resolver.candidatePools(TENANT, 'language');
    expect(pools.payer).toBe('PLATFORM');
    expect(new Set(pools.candidates.map((c) => c.payer)).size).toBeLessThanOrEqual(1);
    expect(pools.hadRetentionInert).toBe(true);
  });

  it('zero retention with only an inert credential and no zero-retention platform route is refused, not downgraded', async () => {
    const { resolver } = makeResolver({ aiZeroRetention: true, config: BYOK_ON, credentials: [credentialRow()] });
    await expect(resolver.resolve(TENANT, 'language')).rejects.toThrow(ZeroRetentionUnavailable);
  });

  it('an attested Anthropic key serves a zero-retention workspace, as a zero-retention route', async () => {
    const route = await makeResolver({
      aiZeroRetention: true,
      config: BYOK_ON,
      credentials: [credentialRow({ zdrAttested: true })],
    }).resolver.resolve(TENANT, 'language');
    expect(route).toMatchObject({ payer: 'TENANT', retention: 'ZDR', routeId: 'aicred_test000001' });
  });

  it('a workspace whose only serving credential is FAILING fails closed: never the platform key', async () => {
    const builds = PLATFORM_ROUTES.map((r) => jest.spyOn(r, 'buildProvider'));
    const { resolver } = makeResolver({
      config: BYOK_ON,
      credentials: [credentialRow({ status: AiCredentialStatus.FAILING })],
    });
    await expect(resolver.resolve(TENANT, 'language')).rejects.toThrow(AiCredentialFailing);
    for (const build of builds) expect(build).not.toHaveBeenCalled();
  });

  it('a DISABLED credential is the owner choosing it off: absent, so the platform serves', async () => {
    const pools = await makeResolver({
      config: BYOK_ON,
      credentials: [credentialRow({ status: AiCredentialStatus.DISABLED })],
    }).resolver.candidatePools(TENANT, 'language');
    expect(pools.payer).toBe('PLATFORM');
  });

  it('the pool is per need: a language-only workspace key leaves embeddings on the platform', async () => {
    const pools = await makeResolver({ config: BYOK_ON, credentials: [credentialRow()] }).resolver.candidatePools(
      TENANT,
      'embedding',
    );
    expect(pools.payer).toBe('PLATFORM');
    expect(pools.candidates.every((c) => c.payer === 'PLATFORM')).toBe(true);
  });

  const roleRow = (overrides: Record<string, unknown> = {}) =>
    credentialRow({
      type: AiCredentialType.BEDROCK_ROLE,
      publicId: 'aicred_role00001',
      encryptedSecret: null,
      lastFour: null,
      roleArn: 'arn:aws:iam::123456789012:role/app-bedrock-access',
      externalId: 'app-ws_test01',
      awsRegion: 'eu-west-1',
      ...overrides,
    });

  it('a BEDROCK_ROLE serves both needs on the workspace AWS account: payer TENANT, zero retention, labelled aws', async () => {
    const { resolver } = makeResolver({ config: BYOK_ON, credentials: [roleRow()] });
    for (const need of ['language', 'embedding'] as const) {
      const route = await resolver.resolve(TENANT, need);
      expect(route).toMatchObject({
        routeId: 'aicred_role00001',
        credentialType: 'BEDROCK_ROLE',
        payer: 'TENANT',
        retention: 'ZDR',
        providerLabel: 'aws',
      });
    }
  });

  it('a zero-retention workspace with its own role is served by it, never by platform-bedrock', async () => {
    const { resolver } = makeResolver({
      aiZeroRetention: true,
      config: { ...BYOK_ON, platformBedrockRegion: 'us-east-1' },
      credentials: [roleRow()],
    });
    const route = await resolver.resolve(TENANT, 'embedding');
    expect(route.routeId).toBe('aicred_role00001');
    expect(route.payer).toBe('TENANT');
  });

  it('a FAILING role blocks both needs with AiCredentialFailing, even with platform-bedrock configured', async () => {
    const { resolver } = makeResolver({
      aiZeroRetention: true,
      config: { ...BYOK_ON, platformBedrockRegion: 'us-east-1' },
      credentials: [roleRow({ status: AiCredentialStatus.FAILING })],
    });
    await expect(resolver.resolve(TENANT, 'language')).rejects.toThrow(AiCredentialFailing);
    await expect(resolver.resolve(TENANT, 'embedding')).rejects.toThrow(AiCredentialFailing);
  });

  it('a role stores no secret, so it keeps serving when AI_CREDENTIALS_KEY is unset', async () => {
    const { resolver } = makeResolver({ config: PLATFORM_KEYS, credentials: [roleRow()] });
    expect((await resolver.resolve(TENANT, 'language')).routeId).toBe('aicred_role00001');
    expect((await resolver.describePayers(TENANT)).embedding).toBe('aicred_role00001');
  });

  describe('the operator removed AI_CREDENTIALS_KEY while workspaces still hold keys', () => {
    it('the workspace is refused with AiCredentialFailing, and no platform route is built or used', async () => {
      const builds = PLATFORM_ROUTES.map((r) => jest.spyOn(r, 'buildProvider'));
      const { resolver } = makeResolver({ config: PLATFORM_KEYS, credentials: [credentialRow()] });
      await expect(resolver.resolve(TENANT, 'language')).rejects.toThrow(AiCredentialFailing);
      for (const build of builds) expect(build).not.toHaveBeenCalled();
    });

    it('a changed key is the same: the envelope does not open, the workspace is refused', async () => {
      const { resolver } = makeResolver({
        config: { ...PLATFORM_KEYS, aiCredentialsKey: 'b'.repeat(64) },
        credentials: [credentialRow()],
      });
      await expect(resolver.resolve(TENANT, 'language')).rejects.toThrow(AiCredentialFailing);
    });

    it('the reason is logged without the secret', async () => {
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const { resolver } = makeResolver({ config: PLATFORM_KEYS, credentials: [credentialRow()] });
      await expect(resolver.resolve(TENANT, 'language')).rejects.toThrow(AiCredentialFailing);
      const logged = JSON.stringify([...error.mock.calls, ...warn.mock.calls]);
      expect(logged).toContain('aicred_test000001');
      expect(logged).not.toContain('sk-ant-test-secret');
    });
  });

  describe('the cached provider bundle of a workspace credential', () => {
    it('is reused while the row is unchanged, rebuilt when the row changes, and the old one is evicted', async () => {
      const first = credentialRow({ updatedAt: new Date('2026-11-12T00:00:00Z') });
      const fixture = makeResolver({ config: BYOK_ON, credentials: [first] });
      const a = await fixture.resolver.resolve(TENANT, 'language');
      const b = await fixture.resolver.resolve(TENANT, 'language');
      expect(fixture.resolver.cachedBundleKeys()).toEqual([expect.stringMatching(/^cred:1:1:/)]);
      expect(a.languageModel).toBeDefined();
      expect(b.routeId).toBe(a.routeId);

      fixture.prisma.aiCredential.findMany.mockResolvedValue([
        credentialRow({ secret: 'sk-ant-rotated-key', updatedAt: new Date('2026-11-13T00:00:00Z') }),
      ]);
      await fixture.resolver.resolve(TENANT, 'language');
      expect(fixture.resolver.cachedBundleKeys()).toEqual([`cred:1:1:${new Date('2026-11-13T00:00:00Z').getTime()}`]);
    });

    it('evictCredential drops every bundle of that credential', async () => {
      const fixture = makeResolver({ config: BYOK_ON, credentials: [credentialRow()] });
      await fixture.resolver.resolve(TENANT, 'language');
      fixture.resolver.evictCredential(1);
      expect(fixture.resolver.cachedBundleKeys().filter((k) => k.startsWith('cred:'))).toEqual([]);
    });
  });

  describe('who pays now, per need (the settings page)', () => {
    it('names the credential that serves, the platform, or none', async () => {
      const { resolver } = makeResolver({
        config: { openRouterApiKey: 'sk-or', aiCredentialsKey: TEST_CREDENTIALS_KEY },
        credentials: [credentialRow()],
      });
      expect(await resolver.describePayers(TENANT)).toEqual({ language: 'aicred_test000001', embedding: 'none' });
    });

    it('says platform when no credential serves the need and a platform route does', async () => {
      const { resolver } = makeResolver({ config: BYOK_ON });
      expect(await resolver.describePayers(TENANT)).toEqual({ language: 'platform', embedding: 'platform' });
    });

    it('says none when the workspace is blocked (failing key, or zero retention with no compliant route)', async () => {
      const failing = makeResolver({
        config: BYOK_ON,
        credentials: [credentialRow({ status: AiCredentialStatus.FAILING })],
      });
      expect((await failing.resolver.describePayers(TENANT)).language).toBe('none');
      const zdr = makeResolver({ aiZeroRetention: true, config: BYOK_ON });
      expect(await zdr.resolver.describePayers(TENANT)).toEqual({ language: 'none', embedding: 'none' });
    });
  });

  describe('a provider credit refusal on a workspace key', () => {
    it('a tenant route hands the refusal to the sink with its tenant and credential', async () => {
      const sink = { recordCreditRefusal: jest.fn().mockResolvedValue(undefined) };
      const route = await makeResolver({
        config: BYOK_ON,
        credentials: [credentialRow()],
        refusalSink: sink,
      }).resolver.resolve(TENANT, 'language');
      route.reportCreditRefusal?.('credit balance is too low');
      expect(sink.recordCreditRefusal).toHaveBeenCalledWith(TENANT, 'aicred_test000001', 'credit balance is too low');
    });

    it('a platform route has nothing to report to', async () => {
      const sink = { recordCreditRefusal: jest.fn() };
      const route = await makeResolver({ config: BYOK_ON, refusalSink: sink }).resolver.resolve(TENANT, 'language');
      expect(route.reportCreditRefusal).toBeUndefined();
    });
  });
});

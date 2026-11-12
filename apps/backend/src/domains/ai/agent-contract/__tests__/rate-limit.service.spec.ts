import { Test } from '@nestjs/testing';
import { RateLimitService, rateLimitSubject } from '../rate-limit.service';
import { ConfigService } from '@nestjs/config';
import { AppCacheService } from '@appshore/platform/infrastructure/cache/app-cache.service';
import { fromUser, fromOAuthUser, fromApiKey, fromDeskResponsibility } from '@appshore/platform/auth/agent-principal';

describe('RateLimitService', () => {
  const cache = { increment: jest.fn() };
  const config = { getOrThrow: jest.fn() };
  let svc: RateLimitService;

  beforeEach(async () => {
    jest.resetAllMocks();
    config.getOrThrow.mockReturnValue(600);
    const mod = await Test.createTestingModule({
      providers: [
        RateLimitService,
        { provide: AppCacheService, useValue: cache },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    svc = mod.get(RateLimitService);
  });

  it('uses user=600 default for user principals', async () => {
    cache.increment.mockResolvedValue(10);
    const r = await svc.consume(fromUser({ userId: 1, tenantId: 7, role: 'MEMBER' }));
    expect(r.allowed).toBe(true);
    expect(r.limit).toBe(600);
    expect(r.remaining).toBe(590);
  });

  it('uses desk_responsibility=300 default for desk principals', async () => {
    cache.increment.mockResolvedValue(50);
    const r = await svc.consume(
      fromDeskResponsibility({
        responsibilityId: 1,
        tenantId: 7,
        scopes: [],
        enabledByUserId: 1,
      }),
    );
    expect(r.limit).toBe(300);
  });

  it('uses oauth_client=120 default for oauth principals', async () => {
    cache.increment.mockResolvedValue(50);
    const r = await svc.consume(
      fromOAuthUser({
        onBehalfOfUserDbId: Number('1'),
        tenantDbId: 7,
        role: 'ADMIN',
        scopes: [],
        clientId: 'c',
      }),
    );
    expect(r.limit).toBe(120);
  });

  it('uses api_key=300 default for api_key principals', async () => {
    cache.increment.mockResolvedValue(50);
    const r = await svc.consume(fromApiKey({ apiKeyId: 1, tenantId: 7, userId: 1, scopes: [] }));
    expect(r.limit).toBe(300);
  });

  it('honors a per-api-key override from ApiKey.rateLimitPerMinute', async () => {
    cache.increment.mockResolvedValue(199);
    const r = await svc.consume(fromApiKey({ apiKeyId: 1, tenantId: 7, userId: 1, scopes: [] }), 1, {
      rateLimitPerMinute: 200,
    });
    expect(r.limit).toBe(200);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(1);
  });

  it('rejects when count > limit', async () => {
    cache.increment.mockResolvedValue(121);
    const r = await svc.consume(
      fromOAuthUser({
        onBehalfOfUserDbId: Number('1'),
        tenantDbId: 7,
        role: 'ADMIN',
        scopes: [],
        clientId: 'c',
      }),
    );
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it('allows exactly at the limit boundary (count === limit)', async () => {
    cache.increment.mockResolvedValue(120);
    const r = await svc.consume(
      fromOAuthUser({
        onBehalfOfUserDbId: Number('1'),
        tenantDbId: 7,
        role: 'ADMIN',
        scopes: [],
        clientId: 'c',
      }),
    );
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(0);
  });

  it('scopes an OAuth budget by client AND the human it acts for', async () => {
    cache.increment.mockResolvedValue(5);
    await svc.consume(
      fromOAuthUser({
        onBehalfOfUserDbId: Number('1'),
        tenantDbId: 7,
        role: 'ADMIN',
        scopes: [],
        clientId: 'gpt-abc',
      }),
    );
    const call = cache.increment.mock.calls[0];
    expect(call[0]).toMatch(/^app:agent:rate:oauth:gpt-abc:1:\d+$/);
    expect(call[1]).toBe(1);
    expect(call[2]).toBe(60);
  });

  describe('workspace ceiling for third-party agents', () => {
    const oauth = (userId: number) =>
      fromOAuthUser({ onBehalfOfUserDbId: userId, tenantDbId: 7, role: 'ADMIN', scopes: [], clientId: 'claude' });

    it('two humans on one connector get separate budgets', () => {
      expect(rateLimitSubject(oauth(1))).toBe('oauth:claude:1');
      expect(rateLimitSubject(oauth(2))).toBe('oauth:claude:2');
      expect(rateLimitSubject(fromApiKey({ apiKeyId: 3, tenantId: 7, userId: 1, scopes: [] }))).toBe('apikey:3');
    });

    it('two people on one connector spend separate buckets, so one cannot exhaust the other', async () => {
      cache.increment.mockResolvedValue(1);
      await svc.consume(oauth(1));
      await svc.consume(oauth(2));
      const ownKeys = cache.increment.mock.calls.map((c) => c[0] as string).filter((k) => !k.includes(':tenant:'));
      expect(ownKeys).toHaveLength(2);
      expect(ownKeys[0]).toMatch(/^app:agent:rate:oauth:claude:1:\d+$/);
      expect(ownKeys[1]).toMatch(/^app:agent:rate:oauth:claude:2:\d+$/);
    });

    it('spends the workspace counter too, and denies once the ceiling (default 600) is passed', async () => {
      cache.increment.mockResolvedValueOnce(5).mockResolvedValueOnce(601);
      const r = await svc.consume(oauth(1));
      expect(cache.increment.mock.calls[1][0]).toMatch(/^app:agent:rate:tenant:7:\d+$/);
      expect(r).toMatchObject({ allowed: false, limit: 600, budget: 'workspace' });
    });

    it('reads the ceiling from config', async () => {
      config.getOrThrow.mockReturnValue(50);
      cache.increment.mockResolvedValueOnce(1).mockResolvedValueOnce(51);
      const r = await svc.consume(fromApiKey({ apiKeyId: 1, tenantId: 7, userId: 1, scopes: [] }));
      expect(config.getOrThrow).toHaveBeenCalledWith('edge.agentTenantCeilingPerMinute');
      expect(r).toMatchObject({ allowed: false, limit: 50, budget: 'workspace' });
    });

    it('reports the tighter budget when both allow', async () => {
      cache.increment.mockResolvedValueOnce(10).mockResolvedValueOnce(595);
      expect(await svc.consume(oauth(1))).toMatchObject({ allowed: true, remaining: 5, budget: 'workspace' });
      cache.increment.mockResolvedValueOnce(119).mockResolvedValueOnce(20);
      expect(await svc.consume(oauth(1))).toMatchObject({ allowed: true, remaining: 1, budget: 'principal' });
    });

    it('a principal over its own budget does not spend the workspace budget', async () => {
      cache.increment.mockResolvedValueOnce(121);
      const r = await svc.consume(oauth(1));
      expect(r).toMatchObject({ allowed: false, budget: 'principal' });
      expect(cache.increment).toHaveBeenCalledTimes(1);
    });

    it('first-party principals (users, Desk) are not held to the agent ceiling', async () => {
      cache.increment.mockResolvedValue(10);
      await svc.consume(fromUser({ userId: 1, tenantId: 7, role: 'MEMBER' }));
      expect(cache.increment).toHaveBeenCalledTimes(1);
    });
  });
});

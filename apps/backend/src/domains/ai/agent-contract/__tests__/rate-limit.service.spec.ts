import { Test } from '@nestjs/testing';
import { RateLimitService } from '../rate-limit.service';
import { AppCacheService } from '../../../../infrastructure/cache/app-cache.service';
import { fromUser, fromOAuthUser, fromApiKey, fromDeskResponsibility } from '../agent-principal';

describe('RateLimitService', () => {
  const cache = { increment: jest.fn() };
  let svc: RateLimitService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [RateLimitService, { provide: AppCacheService, useValue: cache }],
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

  it('scopes the Redis key by principal auditId', async () => {
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
    expect(call[0]).toMatch(/^app:agent:rate:oauth:gpt-abc:/);
    expect(call[1]).toBe(1);
    expect(call[2]).toBe(60);
  });
});

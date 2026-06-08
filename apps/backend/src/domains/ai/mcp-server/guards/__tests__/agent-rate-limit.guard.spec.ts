import { Test } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { AgentRateLimitGuard } from '../agent-rate-limit.guard';
import { RateLimitService } from '../../../agent-contract/rate-limit.service';
import { fromOAuthUser, fromApiKey } from '../../../agent-contract/agent-principal';

function execCtx(req: any, res: any = { setHeader: jest.fn() }) {
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as any;
}

describe('AgentRateLimitGuard', () => {
  const service = { consume: jest.fn() };
  let guard: AgentRateLimitGuard;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [AgentRateLimitGuard, { provide: RateLimitService, useValue: service }],
    }).compile();
    guard = mod.get(AgentRateLimitGuard);
  });

  it('passes when no principal is attached to the request', async () => {
    const ok = await guard.canActivate(execCtx({}));
    expect(ok).toBe(true);
    expect(service.consume).not.toHaveBeenCalled();
  });

  it('allows + sets X-RateLimit-* headers when consume returns allowed=true', async () => {
    const resetAt = new Date(Date.now() + 30_000);
    service.consume.mockResolvedValue({
      allowed: true,
      limit: 120,
      remaining: 118,
      resetAt,
    });
    const res = { setHeader: jest.fn() };
    const req = {
      agentPrincipal: fromOAuthUser({
        onBehalfOfUserDbId: Number('1'),
        tenantDbId: 7,
        role: 'ADMIN',
        scopes: [],
        clientId: 'c',
      }),
    };
    const ok = await guard.canActivate(execCtx(req, res));
    expect(ok).toBe(true);
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '120');
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '118');
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
  });

  it('throws 429 with Retry-After when consume returns allowed=false', async () => {
    const resetAt = new Date(Date.now() + 15_000);
    service.consume.mockResolvedValue({
      allowed: false,
      limit: 120,
      remaining: 0,
      resetAt,
    });
    const res = { setHeader: jest.fn() };
    const req = {
      agentPrincipal: fromOAuthUser({
        onBehalfOfUserDbId: Number('1'),
        tenantDbId: 7,
        role: 'ADMIN',
        scopes: [],
        clientId: 'c',
      }),
    };
    try {
      await guard.canActivate(execCtx(req, res));
      throw new Error('expected 429');
    } catch (e: any) {
      expect(e).toBeInstanceOf(HttpException);
      expect(e.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    }
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });

  it('passes through req.apiKey.rateLimitPerMinute as override for api_key principals', async () => {
    service.consume.mockResolvedValue({
      allowed: true,
      limit: 200,
      remaining: 150,
      resetAt: new Date(),
    });
    const req = {
      agentPrincipal: fromApiKey({
        apiKeyId: 1,
        tenantId: 7,
        userId: 1,
        scopes: [],
      }),
      apiKey: { rateLimitPerMinute: 200 },
    };
    await guard.canActivate(execCtx(req));
    expect(service.consume).toHaveBeenCalledWith(expect.objectContaining({ kind: 'api_key' }), 1, {
      rateLimitPerMinute: 200,
    });
  });
});

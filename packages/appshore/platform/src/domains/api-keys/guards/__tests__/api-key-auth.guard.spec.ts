import { currentRls, rlsStorage } from '@appshore/kernel/infrastructure/rls/rls-context';
import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ApiKeyAuthGuard } from '../api-key-auth.guard';
import { ApiKeysService } from '../../api-keys.service';

function execCtx(req: any) {
  return { switchToHttp: () => ({ getRequest: () => req }) } as any;
}

describe('ApiKeyAuthGuard', () => {
  const service = { validateKey: jest.fn() };
  let guard: ApiKeyAuthGuard;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [ApiKeyAuthGuard, { provide: ApiKeysService, useValue: service }],
    }).compile();
    guard = mod.get(ApiKeyAuthGuard);
  });

  it('throws Unauthorized when Authorization header is missing', async () => {
    await expect(guard.canActivate(execCtx({ headers: {}, ip: '1.2.3.4' }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(service.validateKey).not.toHaveBeenCalled();
  });

  it('throws Unauthorized when header does not start with Bearer', async () => {
    await expect(
      guard.canActivate(execCtx({ headers: { authorization: 'Basic xyz' }, ip: '1.2.3.4' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws Unauthorized when validateKey returns null (invalid, expired, or IP-blocked)', async () => {
    service.validateKey.mockResolvedValue(null);
    await expect(
      guard.canActivate(
        execCtx({
          headers: { authorization: 'Bearer sk_live_x' },
          ip: '1.2.3.4',
        }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(service.validateKey).toHaveBeenCalledWith('sk_live_x', {
      ip: '1.2.3.4',
    });
  });

  it('attaches api_key AgentPrincipal + legacy req.apiKey on success', async () => {
    service.validateKey.mockResolvedValue({
      id: 1,
      userId: 42,
      scopes: ['platform:read'],
      ipAllowlist: ['1.2.3.4'],
      user: { id: 42, tenantId: 7 },
    });
    const req: any = {
      headers: { authorization: 'Bearer sk_live_x' },
      ip: '1.2.3.4',
    };
    const ok = await guard.canActivate(execCtx(req));
    expect(ok).toBe(true);
    expect(req.agentPrincipal).toEqual(
      expect.objectContaining({
        kind: 'api_key',
        apiKeyId: 1,
        tenantId: 7,
        userId: 42,
        scopes: ['platform:read'],
        ipAllowlist: ['1.2.3.4'],
        auditId: 'apikey:1',
      }),
    );
    // Legacy code may still read req.apiKey — preserve it
    expect(req.apiKey).toBeDefined();
    expect(req.apiKey.id).toBe(1);
    // After the int migration, auditId is the stringified DB id.
  });

  it.each([
    ['::ffff:10.0.0.1', '10.0.0.1'],
    ['10.0.0.1', '10.0.0.1'],
    ['2001:db8::1', '2001:db8::1'],
    // No address at all is sent as 'unknown', which matches no allowlist entry (the service skips the check on a missing ip).
    [undefined, 'unknown'],
  ])('checks the allowlist against %s as %s (IPv4-mapped IPv6 folded to IPv4)', async (reqIp, expected) => {
    service.validateKey.mockResolvedValue(null);
    await expect(
      guard.canActivate(execCtx({ headers: { authorization: 'Bearer sk_live_x' }, ip: reqIp })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(service.validateKey).toHaveBeenCalledWith('sk_live_x', { ip: expected });
  });

  it('when ipAllowlist is empty, principal has ipAllowlist=undefined (not []) per AgentPrincipal type', async () => {
    service.validateKey.mockResolvedValue({
      id: 2,
      userId: 42,
      scopes: ['platform:read'],
      ipAllowlist: [],
      user: { id: 42, tenantId: 7 },
    });
    const req: any = {
      headers: { authorization: 'Bearer sk_live_y' },
      ip: '1.2.3.4',
    };
    await guard.canActivate(execCtx(req));
    expect(req.agentPrincipal.ipAllowlist).toBeUndefined();
  });

  it("pins the request to the key owner's tenant, sourced api-key", async () => {
    service.validateKey.mockResolvedValue({
      id: 1,
      userId: 42,
      scopes: ['platform:read'],
      ipAllowlist: [],
      user: { id: 42, tenantId: 7 },
    });
    const req: any = { headers: { authorization: 'Bearer sk_live_x' }, ip: '1.2.3.4' };

    const seen = await rlsStorage.run({}, async () => {
      await guard.canActivate(execCtx(req));
      return currentRls();
    });

    expect(seen).toEqual({ kind: 'tenant', tenantId: 7, source: 'api-key' });
  });
});

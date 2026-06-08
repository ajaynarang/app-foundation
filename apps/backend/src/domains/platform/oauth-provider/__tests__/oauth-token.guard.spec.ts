import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OAuthTokenGuard } from '../oauth-token.guard';
import { OAuthProviderService } from '../oauth-provider.service';

describe('OAuthTokenGuard', () => {
  let guard: OAuthTokenGuard;
  let oauthService: Record<string, jest.Mock>;

  const createMockContext = (headers: Record<string, string> = {}) => {
    const request: Record<string, any> = {
      headers,
      method: 'GET',
      url: '/api/test',
    };
    return {
      ctx: {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext,
      request,
    };
  };

  beforeEach(async () => {
    oauthService = {
      validateAccessToken: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [OAuthTokenGuard, { provide: OAuthProviderService, useValue: oauthService }],
    }).compile();

    guard = module.get(OAuthTokenGuard);
  });

  it('should throw UnauthorizedException when no Bearer token', async () => {
    const { ctx } = createMockContext({});

    try {
      await guard.canActivate(ctx);
      fail('Expected UnauthorizedException');
    } catch (e: any) {
      expect(e).toBeInstanceOf(UnauthorizedException);
      expect(e.getResponse()).toMatchObject({
        error: 'invalid_token',
        error_description: 'Bearer token required',
      });
    }
  });

  it('should throw when Authorization header is not Bearer scheme', async () => {
    const { ctx } = createMockContext({ authorization: 'Basic abc123' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw when token validation fails', async () => {
    oauthService.validateAccessToken.mockResolvedValue(null);
    const { ctx } = createMockContext({
      authorization: 'Bearer invalid-token',
    });

    try {
      await guard.canActivate(ctx);
      fail('Expected UnauthorizedException');
    } catch (e: any) {
      expect(e).toBeInstanceOf(UnauthorizedException);
      expect(e.getResponse()).toMatchObject({
        error: 'invalid_token',
        error_description: 'Token is invalid or expired',
      });
    }
  });

  it('should attach oauthUser with scopes on success', async () => {
    const payload = {
      sub: '1',
      tenantId: 1,
      role: 'DISPATCHER',
      scopes: ['loads:read', 'loads:write'],
      clientId: 'client-abc',
    };
    oauthService.validateAccessToken.mockResolvedValue(payload);
    const { ctx, request } = createMockContext({
      authorization: 'Bearer valid-token',
    });

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(request.oauthUser).toEqual({
      userId: '1',
      tenantDbId: 1,
      role: 'DISPATCHER',
      scopes: ['loads:read', 'loads:write'],
      clientId: 'client-abc',
    });
  });

  it('should attach agentPrincipal (oauth_client kind) alongside oauthUser', async () => {
    const payload = {
      sub: '99',
      tenantId: 7,
      role: 'DISPATCHER',
      scopes: ['fleet:read', 'invoices:read'],
      clientId: 'gpt-abc',
    };
    oauthService.validateAccessToken.mockResolvedValue(payload);
    const { ctx, request } = createMockContext({
      authorization: 'Bearer valid-token',
    });

    await guard.canActivate(ctx);

    expect(request.agentPrincipal).toEqual(
      expect.objectContaining({
        kind: 'oauth_client',
        clientId: 'gpt-abc',
        tenantId: 7,
        onBehalfOfUserId: 99,
        scopes: ['fleet:read', 'invoices:read'],
        auditId: 'oauth:gpt-abc',
      }),
    );
  });

  it('should format error as OAuth error response', async () => {
    const { ctx } = createMockContext({});

    try {
      await guard.canActivate(ctx);
    } catch (e: any) {
      const response = e.getResponse();
      expect(response).toHaveProperty('error');
      expect(response).toHaveProperty('error_description');
    }
  });
});

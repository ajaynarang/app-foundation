import { BadRequestException } from '@nestjs/common';
import { OAuthProviderController } from '../oauth-provider.controller';

describe('OAuthProviderController', () => {
  let controller: OAuthProviderController;
  let oauthService: any;
  let oauthClientsService: any;
  let prismaService: any;

  // Minimal `Request` stub — the controller only reads `req.hostname` in
  // /oauth/register for the subdomain→tenant lookup.
  const mockReq = { hostname: 'localhost' } as any;

  beforeEach(() => {
    oauthService = {
      authorize: jest.fn().mockResolvedValue('challenge_token_123'),
      approveConsent: jest.fn().mockResolvedValue({ redirectUri: 'http://localhost:3000?code=abc' }),
      exchangeCode: jest.fn().mockResolvedValue({ access_token: 'at_123' }),
      refreshToken: jest.fn().mockResolvedValue({ access_token: 'at_456' }),
      revokeToken: jest.fn().mockResolvedValue(undefined),
    };

    oauthClientsService = {
      create: jest.fn().mockResolvedValue({
        clientId: 'sally_new',
        clientSecret: 'raw_secret',
        name: 'TestClient',
        description: null,
        redirectUris: ['http://localhost:3000'],
        scopes: ['read:fleet'],
        clientType: 'confidential',
        isActive: true,
        createdAt: new Date().toISOString(),
      }),
    };

    // `localhost` never resolves to a tenant (subdomain helper returns null),
    // so Prisma is not actually called — but construct still needs it.
    prismaService = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    controller = new OAuthProviderController(oauthService, oauthClientsService, prismaService);
  });

  describe('authorize', () => {
    it('should redirect on valid request', async () => {
      const res = { redirect: jest.fn() } as any;
      await controller.authorize('code', 'cid', 'http://localhost:3000', 'read', 'state1', 'chall', 'S256', res);
      expect(oauthService.authorize).toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(302, expect.stringContaining('challenge='));
    });

    it('should throw if response_type is not code', async () => {
      const res = { redirect: jest.fn() } as any;
      await expect(
        controller.authorize('token', 'cid', 'http://localhost:3000', 'read', 'state1', 'chall', 'S256', res),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if missing required params', async () => {
      const res = { redirect: jest.fn() } as any;
      await expect(
        controller.authorize('code', '', 'http://localhost:3000', 'read', 'state1', 'chall', 'S256', res),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if PKCE not S256', async () => {
      const res = { redirect: jest.fn() } as any;
      await expect(
        controller.authorize('code', 'cid', 'http://localhost:3000', 'read', 'state1', 'chall', 'plain', res),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('approveConsent', () => {
    it('should approve consent with challenge and user', async () => {
      const req = { user: { dbId: 1, tenantDbId: 7 } } as any;
      await controller.approveConsent('challenge_token', undefined, req);
      expect(oauthService.approveConsent).toHaveBeenCalledWith('challenge_token', 1, 7, undefined);
    });

    it('should forward selectedScopes when provided', async () => {
      const req = { user: { dbId: 1, tenantDbId: 7 } } as any;
      await controller.approveConsent('challenge_token', ['fleet:read', 'invoices:read'], req);
      expect(oauthService.approveConsent).toHaveBeenCalledWith('challenge_token', 1, 7, [
        'fleet:read',
        'invoices:read',
      ]);
    });

    it('should throw if selectedScopes is not an array of strings', async () => {
      const req = { user: { dbId: 1, tenantDbId: 7 } } as any;
      await expect(controller.approveConsent('challenge_token', [1, 2] as any, req)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw if challenge missing', async () => {
      const req = { user: { dbId: 1, tenantDbId: 7 } } as any;
      await expect(controller.approveConsent('', undefined, req)).rejects.toThrow(BadRequestException);
    });
  });

  describe('token', () => {
    it('should exchange authorization_code', async () => {
      const result = await controller.token(
        'authorization_code',
        'code1',
        'http://localhost',
        'cid',
        'secret',
        'verifier',
        undefined as any,
      );
      expect(oauthService.exchangeCode).toHaveBeenCalledWith('code1', 'verifier', 'cid', 'secret', 'http://localhost');
      expect(result.access_token).toBe('at_123');
    });

    it('should throw if missing params for authorization_code', async () => {
      await expect(
        controller.token('authorization_code', '', 'http://localhost', 'cid', 'secret', 'verifier', undefined as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should refresh token', async () => {
      const result = await controller.token(
        'refresh_token',
        undefined as any,
        undefined as any,
        'cid',
        'secret',
        undefined as any,
        'rt_abc',
      );
      expect(oauthService.refreshToken).toHaveBeenCalledWith('rt_abc', 'cid', 'secret');
      expect(result.access_token).toBe('at_456');
    });

    it('should throw if missing params for refresh_token', async () => {
      await expect(
        controller.token('refresh_token', undefined as any, undefined as any, '', 'secret', undefined as any, 'rt_abc'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw on unsupported grant_type', async () => {
      await expect(
        controller.token(
          'client_credentials',
          undefined as any,
          undefined as any,
          'cid',
          'secret',
          undefined as any,
          undefined as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('revoke', () => {
    it('should revoke a token', async () => {
      const result = await controller.revoke('token_abc');
      expect(oauthService.revokeToken).toHaveBeenCalledWith('token_abc');
      expect(result).toEqual({});
    });

    it('should throw if token missing', async () => {
      await expect(controller.revoke('')).rejects.toThrow(BadRequestException);
    });
  });

  describe('register (DCR)', () => {
    it('should register a public client', async () => {
      oauthClientsService.create.mockResolvedValue({
        clientId: 'sally_new',
        clientSecret: null,
        name: 'Claude Desktop',
        description: null,
        redirectUris: ['http://localhost:3000'],
        scopes: ['read:fleet'],
        clientType: 'public',
        isActive: true,
        createdAt: new Date().toISOString(),
      });

      const result = await controller.register(
        {
          client_name: 'Claude Desktop',
          redirect_uris: ['http://localhost:3000'],
          token_endpoint_auth_method: 'none',
        },
        mockReq,
      );

      expect(result.client_id).toBe('sally_new');
      expect(result.client_secret).toBeUndefined();
      expect(result.token_endpoint_auth_method).toBe('none');
    });

    it('should register a confidential client with secret', async () => {
      const result = await controller.register(
        {
          client_name: 'Backend App',
          redirect_uris: ['https://example.com/callback'],
          token_endpoint_auth_method: 'client_secret_post',
        },
        mockReq,
      );

      expect(result.client_id).toBe('sally_new');
      expect(result.client_secret).toBe('raw_secret');
      expect(result.client_secret_expires_at).toBe(0);
    });

    it('should throw if client_name missing', async () => {
      await expect(controller.register({ redirect_uris: ['http://localhost:3000'] }, mockReq)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw if redirect_uris missing or empty', async () => {
      await expect(controller.register({ client_name: 'Test', redirect_uris: [] }, mockReq)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw for non-HTTPS non-localhost redirect_uri', async () => {
      await expect(
        controller.register(
          {
            client_name: 'Test',
            redirect_uris: ['http://evil.com/callback'],
          },
          mockReq,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw for invalid redirect_uri format', async () => {
      await expect(
        controller.register(
          {
            client_name: 'Test',
            redirect_uris: ['not-a-url'],
          },
          mockReq,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});

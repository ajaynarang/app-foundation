import { BadRequestException } from '@nestjs/common';
import { fieldErrorsOf, readBodyDto } from '../../../test/helpers/field-errors.helpers';
import { ApproveOAuthConsentDto, OAuthRevokeRequestDto, OAuthTokenRequestDto } from '../dto/oauth-protocol.dto';
import { RegisterOAuthClientDto } from '../dto/register-oauth-client.dto';
import { OAuthProviderController } from '../oauth-provider.controller';
import { OAuthErrorFilter } from '../oauth-error.filter';
import { GENEROUS_THROTTLE } from '../../../shared/http/edge-throttle';

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
        clientId: 'app_new',
        clientSecret: 'raw_secret',
        name: 'TestClient',
        description: null,
        redirectUris: ['http://localhost:3000'],
        scopes: ['platform:read'],
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
      await controller.approveConsent({ challenge: 'challenge_token' }, req);
      expect(oauthService.approveConsent).toHaveBeenCalledWith('challenge_token', 1, 7, undefined);
    });

    it('should forward selectedScopes when provided', async () => {
      const req = { user: { dbId: 1, tenantDbId: 7 } } as any;
      await controller.approveConsent(
        { challenge: 'challenge_token', selectedScopes: ['platform:read', 'documents:read'] },
        req,
      );
      expect(oauthService.approveConsent).toHaveBeenCalledWith('challenge_token', 1, 7, [
        'platform:read',
        'documents:read',
      ]);
    });

    it('answers 400 naming selectedScopes when it is not an array of strings', async () => {
      const fields = await fieldErrorsOf(
        readBodyDto(ApproveOAuthConsentDto, { challenge: 'challenge_token', selectedScopes: [1, 2] }),
      );
      expect(Object.keys(fields).some((field) => field.startsWith('selectedScopes'))).toBe(true);
      expect(
        await fieldErrorsOf(readBodyDto(ApproveOAuthConsentDto, { challenge: 'c', selectedScopes: 'a' })),
      ).toHaveProperty('selectedScopes');
    });

    it('answers 400 naming challenge when it is missing or empty', async () => {
      expect(await fieldErrorsOf(readBodyDto(ApproveOAuthConsentDto, {}))).toEqual({
        challenge: 'Missing challenge token',
      });
      expect(await fieldErrorsOf(readBodyDto(ApproveOAuthConsentDto, { challenge: '' }))).toHaveProperty('challenge');
    });
  });

  describe('token', () => {
    it('should exchange authorization_code', async () => {
      const result = await controller.token({
        grant_type: 'authorization_code',
        code: 'code1',
        redirect_uri: 'http://localhost',
        client_id: 'cid',
        client_secret: 'secret',
        code_verifier: 'verifier',
      });
      expect(oauthService.exchangeCode).toHaveBeenCalledWith('code1', 'verifier', 'cid', 'secret', 'http://localhost');
      expect(result.access_token).toBe('at_123');
    });

    it('should throw if missing params for authorization_code', async () => {
      await expect(
        controller.token({
          grant_type: 'authorization_code',
          code: '',
          redirect_uri: 'http://localhost',
          client_id: 'cid',
          client_secret: 'secret',
          code_verifier: 'verifier',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should refresh token', async () => {
      const result = await controller.token({
        grant_type: 'refresh_token',
        client_id: 'cid',
        client_secret: 'secret',
        refresh_token: 'rt_abc',
      });
      expect(oauthService.refreshToken).toHaveBeenCalledWith('rt_abc', 'cid', 'secret');
      expect(result.access_token).toBe('at_456');
    });

    it('should throw if missing params for refresh_token', async () => {
      await expect(
        controller.token({
          grant_type: 'refresh_token',
          client_id: '',
          client_secret: 'secret',
          refresh_token: 'rt_abc',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw on unsupported grant_type', async () => {
      await expect(
        controller.token({ grant_type: 'client_credentials', client_id: 'cid', client_secret: 'secret' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('revoke', () => {
    it('should revoke a token', async () => {
      const result = await controller.revoke({ token: 'token_abc' });
      expect(oauthService.revokeToken).toHaveBeenCalledWith('token_abc');
      expect(result).toEqual({});
    });

    it('should throw if token missing', async () => {
      await expect(controller.revoke({ token: '' })).rejects.toThrow(BadRequestException);
      await expect(controller.revoke({})).rejects.toThrow(BadRequestException);
    });
  });

  describe('register (DCR)', () => {
    it('should register a public client', async () => {
      oauthClientsService.create.mockResolvedValue({
        clientId: 'app_new',
        clientSecret: null,
        name: 'Claude Desktop',
        description: null,
        redirectUris: ['http://localhost:3000'],
        scopes: ['platform:read'],
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

      expect(result.client_id).toBe('app_new');
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

      expect(result.client_id).toBe('app_new');
      expect(result.client_secret).toBe('raw_secret');
      expect(result.client_secret_expires_at).toBe(0);
    });

    it('should throw if client_name missing', async () => {
      await expect(readBodyDto(RegisterOAuthClientDto, { redirect_uris: ['http://localhost:3000'] })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw if redirect_uris missing or empty', async () => {
      await expect(readBodyDto(RegisterOAuthClientDto, { client_name: 'Test', redirect_uris: [] })).rejects.toThrow(
        BadRequestException,
      );
      await expect(readBodyDto(RegisterOAuthClientDto, { client_name: 'Test' })).rejects.toThrow(BadRequestException);
    });

    it('should throw for non-HTTPS non-localhost redirect_uri', async () => {
      await expect(
        readBodyDto(RegisterOAuthClientDto, { client_name: 'Test', redirect_uris: ['http://evil.com/callback'] }),
      ).rejects.toThrow(BadRequestException);
    });

    // The tenant-subdomain helper once skipped `console`, the host of an app
    // this repo no longer has. No rule reserves that name at sign-up, so a
    // tenant can hold it, and its clients must bind to it like any other.
    it.each(['console', 'acme'])('binds the client to the tenant whose subdomain is the host (%s)', async (sub) => {
      prismaService.tenant.findUnique.mockResolvedValue({ id: 42, status: 'ACTIVE' });

      await controller.register({ client_name: 'Agent', redirect_uris: ['https://agent.example.com/cb'] }, {
        hostname: `${sub}.example.com`,
      } as any);

      expect(prismaService.tenant.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { subdomain: sub } }),
      );
      expect(oauthClientsService.create).toHaveBeenCalledWith(expect.anything(), null, 42);
    });

    it.each(['www', 'api', 'app'])('treats the system host %s as no tenant', async (sub) => {
      await controller.register({ client_name: 'Agent', redirect_uris: ['https://agent.example.com/cb'] }, {
        hostname: `${sub}.example.com`,
      } as any);

      expect(prismaService.tenant.findUnique).not.toHaveBeenCalled();
      expect(oauthClientsService.create).toHaveBeenCalledWith(expect.anything(), null, null);
    });

    it('should throw for invalid redirect_uri format', async () => {
      await expect(
        readBodyDto(RegisterOAuthClientDto, { client_name: 'Test', redirect_uris: ['not-a-url'] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('drops metadata it does not use instead of refusing it (RFC 7591 section 2)', async () => {
      const dto = await readBodyDto(RegisterOAuthClientDto, {
        client_name: 'Claude',
        redirect_uris: ['https://claude.ai/api/mcp/auth_callback', 'http://127.0.0.1:8123/cb'],
        logo_uri: 'https://claude.ai/logo.png',
        software_id: 'abc',
      });
      expect(dto).toEqual({
        client_name: 'Claude',
        redirect_uris: ['https://claude.ai/api/mcp/auth_callback', 'http://127.0.0.1:8123/cb'],
      });
    });
  });

  describe('protocol errors (RFC 6749 section 5.2, RFC 7591 section 3.2.2)', () => {
    const filtersOf = (method: keyof OAuthProviderController) =>
      (Reflect.getMetadata('__exceptionFilters__', OAuthProviderController.prototype[method]) as unknown[]) ?? [];

    it.each(['authorize', 'token', 'revoke', 'register'] as const)(
      '%s answers errors through OAuthErrorFilter',
      (method) => {
        expect(filtersOf(method)).toEqual([OAuthErrorFilter]);
      },
    );

    it('the consent route, which the web app calls, keeps the usual error envelope', () => {
      expect(filtersOf('approveConsent')).toEqual([]);
    });

    const errorOf = async (call: Promise<unknown>) => {
      try {
        await call;
      } catch (e) {
        return (e as BadRequestException).getResponse() as Record<string, unknown>;
      }
      throw new Error('expected a throw');
    };

    it('names the RFC code on each refusal the controller makes itself', async () => {
      const res = { redirect: jest.fn() } as any;
      expect(await errorOf(controller.authorize('token', 'c', 'r', 's', 'st', 'ch', 'S256', res))).toMatchObject({
        error: 'unsupported_response_type',
      });
      expect(await errorOf(controller.token({ grant_type: 'password' }))).toMatchObject({
        error: 'unsupported_grant_type',
        error_description: 'Only authorization_code and refresh_token are supported',
      });
      expect(await errorOf(controller.token({ grant_type: 'refresh_token' }))).toMatchObject({
        error: 'invalid_request',
      });
      expect(await errorOf(controller.revoke({}))).toMatchObject({ error: 'invalid_request' });
      expect(
        await errorOf(readBodyDto(RegisterOAuthClientDto, { redirect_uris: ['https://a.example.com/cb'] })),
      ).toMatchObject({
        error: 'invalid_client_metadata',
      });
      expect(
        await errorOf(readBodyDto(RegisterOAuthClientDto, { client_name: 'T', redirect_uris: ['http://evil.com/cb'] })),
      ).toMatchObject({ error: 'invalid_redirect_uri' });
    });

    it('a token or revoke body of the wrong shape is invalid_request, and an unknown parameter is ignored', async () => {
      // A repeated form key arrives as an array.
      expect(await errorOf(readBodyDto(OAuthTokenRequestDto, { grant_type: ['a', 'b'] }))).toMatchObject({
        error: 'invalid_request',
      });
      expect(await errorOf(readBodyDto(OAuthRevokeRequestDto, { token: { nested: true } }))).toMatchObject({
        error: 'invalid_request',
      });
      expect(
        await readBodyDto(OAuthTokenRequestDto, { grant_type: 'refresh_token', refresh_token: 'rt', resource: 'x' }),
      ).toEqual({ grant_type: 'refresh_token', refresh_token: 'rt' });
    });
  });

  describe('edge throttle', () => {
    const throttle = (handler: (...args: any[]) => unknown) => ({
      skipped: Reflect.getMetadata('THROTTLER:SKIPdefault', handler) === true,
      limit: Reflect.getMetadata('THROTTLER:LIMITdefault', handler),
      ttl: Reflect.getMetadata('THROTTLER:TTLdefault', handler),
    });

    it('client registration is limited to 5 a minute: a skip beside the limit used to switch it off', () => {
      expect(throttle(controller.register)).toEqual({ skipped: false, limit: 5, ttl: 60000 });
    });

    it('the authorization endpoint has a ceiling instead of no throttle at all', () => {
      expect(throttle(controller.authorize)).toEqual({ skipped: false, ...GENEROUS_THROTTLE.default });
    });
  });
});

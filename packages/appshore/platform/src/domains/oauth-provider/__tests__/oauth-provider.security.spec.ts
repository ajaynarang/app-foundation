import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import crypto from 'crypto';
import { OAuthProviderService } from '../oauth-provider.service';
import { resolveOAuthAccessTokenSecret, resolveOAuthConsentSecret, resolveOAuthIssuer } from '../oauth-settings';

/**
 * The four provider guarantees, exercised with a REAL JwtService so signatures, secrets and `iss` are the ones
 * production code computes: the issuer is required config, consent challenges have their own secret, refresh
 * rotation is atomic, and a client only ever acts for the one tenant it belongs to.
 */
describe('OAuthProviderService security', () => {
  const ISSUER = 'https://api.acme.io';
  const settings: Record<string, string | undefined> = {
    secretKey: 'unit-test-secret-key-0123456789abcdef',
    oauthJwtSecret: 'unit-test-oauth-access-secret-0123456789',
    oauthConsentSecret: 'unit-test-oauth-consent-secret-012345678',
    oauthIssuer: ISSUER,
  };
  const configWith = (overrides: Record<string, string | undefined> = {}) => ({
    get: (key: string) => ({ ...settings, ...overrides })[key],
  });

  const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
  const jwt = new JwtService();

  let prisma: any;
  let service: OAuthProviderService;

  const client = (overrides: Record<string, unknown> = {}) => ({
    id: 10,
    clientId: 'client-1',
    name: 'Test App',
    description: null,
    isActive: true,
    clientType: 'public',
    clientSecret: null,
    redirectUris: ['https://app.example.org/callback'],
    scopes: ['platform:read'],
    tenantId: 7,
    ...overrides,
  });

  const authorizeParams = {
    responseType: 'code',
    clientId: 'client-1',
    redirectUri: 'https://app.example.org/callback',
    scope: 'platform:read',
    state: 'state-abc',
    codeChallenge: 'challenge',
    codeChallengeMethod: 'S256',
  };

  beforeEach(() => {
    prisma = {
      oAuthClient: { findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
      workspaceMember: { findUnique: jest.fn().mockResolvedValue({ role: 'ADMIN' }) },
      oAuthAuthorizationCode: { create: jest.fn().mockResolvedValue({}), findUnique: jest.fn(), updateMany: jest.fn() },
      oAuthAccessToken: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      oAuthRefreshToken: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn((arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
    };
    service = new OAuthProviderService(prisma, jwt, configWith() as never);
  });

  describe('issuer', () => {
    it('refuses to start without an issuer: there is no built-in fallback', () => {
      expect(() => new OAuthProviderService(prisma, jwt, configWith({ oauthIssuer: undefined }) as never)).toThrow(
        /oauthIssuer config is required/,
      );
      expect(() => resolveOAuthIssuer(() => '   ')).toThrow(/oauthIssuer config is required/);
    });

    it('reads the issuer from config and drops a trailing slash', () => {
      expect(resolveOAuthIssuer((key) => (key === 'oauthIssuer' ? 'https://api.acme.io/' : undefined))).toBe(ISSUER);
    });

    it('signs the configured issuer into access tokens and rejects a token from any other issuer', async () => {
      prisma.oAuthAuthorizationCode.updateMany.mockResolvedValue({ count: 1 });
      const verifier = 'verifier-123';
      prisma.oAuthAuthorizationCode.findUnique.mockResolvedValue({
        expiresAt: new Date(Date.now() + 60_000),
        redirectUri: 'https://app.example.org/callback',
        codeChallenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
        scopes: ['platform:read'],
        client: client(),
        user: { id: 42, tenantId: 7, role: 'ADMIN' },
      });

      const tokens = await service.exchangeCode('code', verifier, 'client-1', undefined, authorizeParams.redirectUri);

      expect(jwt.decode(tokens.access_token)).toMatchObject({ iss: ISSUER, sub: '42', clientId: 'client-1' });

      prisma.oAuthAccessToken.findUnique.mockResolvedValue({ revokedAt: null });
      await expect(service.validateAccessToken(tokens.access_token)).resolves.toMatchObject({ sub: '42' });

      const claims = { sub: '42', tenantId: 7, role: 'ADMIN', scopes: ['platform:read'], clientId: 'client-1' };
      const sign = (issuer?: string) =>
        jwt.sign(claims, { secret: settings.oauthJwtSecret, expiresIn: 60, ...(issuer ? { issuer } : {}) });
      await expect(service.validateAccessToken(sign('https://api.example.com'))).resolves.toBeNull();
      await expect(service.validateAccessToken(sign())).resolves.toBeNull();
    });
  });

  describe('consent challenge secret', () => {
    it('derives two different secrets from secretKey when neither is set', () => {
      const read = (key: string) => (key === 'secretKey' ? 'base' : undefined);
      expect(resolveOAuthAccessTokenSecret(read)).toBe('base-oauth');
      expect(resolveOAuthConsentSecret(read)).toBe('base-oauth-consent');
    });

    it('signs the challenge with the consent secret, not the access-token secret', async () => {
      prisma.oAuthClient.findUnique.mockResolvedValue(client());

      const challenge = await service.authorize(authorizeParams as never);

      expect(() => jwt.verify(challenge, { secret: settings.oauthConsentSecret })).not.toThrow();
      expect(() => jwt.verify(challenge, { secret: settings.oauthJwtSecret })).toThrow();
    });

    it('rejects a challenge signed with the access-token secret', async () => {
      prisma.oAuthClient.findUnique.mockResolvedValue(client());
      const forged = jwt.sign(
        { clientId: 'client-1', requestedScopes: ['platform:read'], redirectUri: authorizeParams.redirectUri },
        { secret: settings.oauthJwtSecret, expiresIn: '10m' },
      );

      await expect(service.approveConsent(forged, 42, 7)).rejects.toThrow('Invalid or expired consent challenge');
      expect(prisma.oAuthAuthorizationCode.create).not.toHaveBeenCalled();
    });

    it('never accepts a consent challenge as an access token', async () => {
      prisma.oAuthClient.findUnique.mockResolvedValue(client());
      const challenge = await service.authorize(authorizeParams as never);

      await expect(service.validateAccessToken(challenge)).resolves.toBeNull();
      expect(prisma.oAuthAccessToken.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('atomic refresh rotation', () => {
    const stored = (overrides: Record<string, unknown> = {}) => ({
      rotatedAt: null,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      originalIssuedAt: new Date(),
      scopes: ['platform:read'],
      userId: 42,
      clientId: 10,
      client: client(),
      user: { id: 42, tenantId: 7, role: 'ADMIN' },
      ...overrides,
    });

    it('claims the token conditionally and issues the new pair in the same transaction', async () => {
      prisma.oAuthRefreshToken.findUnique.mockResolvedValue(stored());
      const order: string[] = [];
      prisma.$transaction.mockImplementation(async (run: any) => {
        order.push('begin');
        const result = await run(prisma);
        order.push('commit');
        return result;
      });
      prisma.oAuthRefreshToken.updateMany.mockImplementation(() => {
        order.push('claim');
        return { count: 1 };
      });
      prisma.oAuthAccessToken.create.mockImplementation(() => order.push('access'));
      prisma.oAuthRefreshToken.create.mockImplementation(() => order.push('refresh'));
      prisma.oAuthRefreshToken.update.mockImplementation(() => order.push('link'));

      const tokens = await service.refreshToken('old-refresh', 'client-1', undefined);

      expect(order).toEqual(['begin', 'claim', 'access', 'refresh', 'link', 'commit']);
      expect(prisma.oAuthRefreshToken.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: sha256('old-refresh'), rotatedAt: null, revokedAt: null },
        data: { rotatedAt: expect.any(Date) },
      });
      expect(prisma.oAuthRefreshToken.update).toHaveBeenCalledWith({
        where: { tokenHash: sha256('old-refresh') },
        data: { replacedByHash: sha256(tokens.refresh_token) },
      });
    });

    it('a refresh that loses the race issues nothing and revokes the chain', async () => {
      // Both requests read the token before either rotated it; this one's conditional claim matches no row.
      prisma.oAuthRefreshToken.findUnique.mockResolvedValue(stored());
      prisma.oAuthRefreshToken.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.refreshToken('old-refresh', 'client-1', undefined)).rejects.toThrow(
        'Refresh token reuse detected',
      );

      expect(prisma.oAuthAccessToken.create).not.toHaveBeenCalled();
      expect(prisma.oAuthRefreshToken.create).not.toHaveBeenCalled();
      expect(prisma.oAuthAccessToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 42, clientId: 10, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('of two concurrent refreshes with one token, exactly one gets tokens', async () => {
      prisma.oAuthRefreshToken.findUnique.mockResolvedValue(stored());
      let rotated = false;
      prisma.oAuthRefreshToken.updateMany.mockImplementation(({ where }: any) => {
        if (!('rotatedAt' in where)) return { count: 1 }; // the chain revocation
        if (rotated) return { count: 0 };
        rotated = true;
        return { count: 1 };
      });

      const results = await Promise.allSettled([
        service.refreshToken('old-refresh', 'client-1', undefined),
        service.refreshToken('old-refresh', 'client-1', undefined),
      ]);

      expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
      expect(prisma.oAuthRefreshToken.create).toHaveBeenCalledTimes(1);
    });

    it('a failure while issuing propagates from the transaction, so the claim rolls back with it', async () => {
      prisma.oAuthRefreshToken.findUnique.mockResolvedValue(stored());
      prisma.oAuthAccessToken.create.mockRejectedValue(new Error('db down'));

      await expect(service.refreshToken('old-refresh', 'client-1', undefined)).rejects.toThrow('db down');

      const claimedInsideTransaction = prisma.$transaction.mock.calls.length === 1;
      expect(claimedInsideTransaction).toBe(true);
      expect(prisma.oAuthRefreshToken.update).not.toHaveBeenCalled();
    });

    it('still treats an already rotated token as reuse', async () => {
      prisma.oAuthRefreshToken.findUnique.mockResolvedValue(stored({ rotatedAt: new Date() }));

      await expect(service.refreshToken('old-refresh', 'client-1', undefined)).rejects.toThrow(UnauthorizedException);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1); // only the chain revocation
      expect(prisma.oAuthRefreshToken.create).not.toHaveBeenCalled();
    });
  });

  describe('client tenant binding', () => {
    const challengeFor = async () => {
      prisma.oAuthClient.findUnique.mockResolvedValueOnce(client());
      return service.authorize(authorizeParams as never);
    };

    it('refuses consent from a user with no tenant: the client would stay tenantless', async () => {
      const challenge = await challengeFor();
      prisma.oAuthClient.findUnique.mockResolvedValue(client({ tenantId: null }));

      await expect(service.approveConsent(challenge, 42, null)).rejects.toThrow(BadRequestException);

      expect(prisma.oAuthClient.updateMany).not.toHaveBeenCalled();
      expect(prisma.oAuthAuthorizationCode.create).not.toHaveBeenCalled();
    });

    it("refuses consent in another tenant than the client's", async () => {
      const challenge = await challengeFor();
      prisma.oAuthClient.findUnique.mockResolvedValue(client({ tenantId: 7 }));

      await expect(service.approveConsent(challenge, 42, 8)).rejects.toThrow(
        'This app is connected to a different workspace',
      );

      expect(prisma.oAuthClient.updateMany).not.toHaveBeenCalled();
      expect(prisma.oAuthAuthorizationCode.create).not.toHaveBeenCalled();
    });

    it('binds a tenantless (dynamically registered) client to the consenting tenant with a compare-and-set', async () => {
      const challenge = await challengeFor();
      prisma.oAuthClient.findUnique.mockResolvedValue(client({ tenantId: null }));
      prisma.oAuthClient.updateMany.mockResolvedValue({ count: 1 });

      await service.approveConsent(challenge, 42, 7);

      expect(prisma.oAuthClient.updateMany).toHaveBeenCalledWith({
        where: { id: 10, tenantId: null },
        data: { tenantId: 7 },
      });
      expect(prisma.oAuthAuthorizationCode.create).toHaveBeenCalled();
    });

    it('refuses the tenant that loses the race to bind a tenantless client', async () => {
      const challenge = await challengeFor();
      prisma.oAuthClient.findUnique
        .mockResolvedValueOnce(client({ tenantId: null })) // read before the other tenant bound it
        .mockResolvedValueOnce({ tenantId: 7 }); // re-read after the lost compare-and-set
      prisma.oAuthClient.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.approveConsent(challenge, 43, 8)).rejects.toThrow(
        'This app is connected to a different workspace',
      );
      expect(prisma.oAuthAuthorizationCode.create).not.toHaveBeenCalled();
    });

    describe("tokens are for the client's tenant, not the workspace the user has open", () => {
      const verifier = 'verifier-123';
      // The client belongs to tenant 7; the user row points at tenant 3 (they switched workspace) as OWNER.
      const elsewhere = { id: 42, tenantId: 3, role: 'OWNER' };
      const code = () => ({
        expiresAt: new Date(Date.now() + 60_000),
        redirectUri: authorizeParams.redirectUri,
        codeChallenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
        scopes: ['platform:read'],
        client: client({ tenantId: 7 }),
        user: elsewhere,
      });
      const refresh = () => ({
        rotatedAt: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        originalIssuedAt: new Date(),
        scopes: ['platform:read'],
        userId: 42,
        clientId: 10,
        client: client({ tenantId: 7 }),
        user: elsewhere,
      });
      const exchange = () => service.exchangeCode('code', verifier, 'client-1', undefined, authorizeParams.redirectUri);

      beforeEach(() => {
        prisma.oAuthAuthorizationCode.updateMany.mockResolvedValue({ count: 1 });
        prisma.oAuthAuthorizationCode.findUnique.mockResolvedValue(code());
        prisma.oAuthRefreshToken.findUnique.mockResolvedValue(refresh());
      });

      it("code exchange signs the client's tenant and the user's role there", async () => {
        prisma.workspaceMember.findUnique.mockResolvedValue({ role: 'MEMBER' });

        const tokens = await exchange();

        expect(prisma.workspaceMember.findUnique).toHaveBeenCalledWith({
          where: { userId_tenantId: { userId: 42, tenantId: 7 } },
          select: { role: true },
        });
        expect(jwt.decode(tokens.access_token)).toMatchObject({ sub: '42', tenantId: 7, role: 'MEMBER' });
      });

      it("refresh signs the client's tenant and the user's role there", async () => {
        prisma.workspaceMember.findUnique.mockResolvedValue({ role: 'MEMBER' });

        const tokens = await service.refreshToken('old-refresh', 'client-1', undefined);

        expect(jwt.decode(tokens.access_token)).toMatchObject({ sub: '42', tenantId: 7, role: 'MEMBER' });
      });

      it("code exchange issues nothing when the user is not a member of the client's tenant", async () => {
        prisma.workspaceMember.findUnique.mockResolvedValue(null);

        await expect(exchange()).rejects.toThrow(BadRequestException);
        expect(prisma.oAuthAccessToken.create).not.toHaveBeenCalled();
        expect(prisma.oAuthRefreshToken.create).not.toHaveBeenCalled();
      });

      it("refresh issues nothing, and leaves the token unrotated, when the user is not a member of the client's tenant", async () => {
        prisma.workspaceMember.findUnique.mockResolvedValue(null);

        await expect(service.refreshToken('old-refresh', 'client-1', undefined)).rejects.toThrow(UnauthorizedException);
        expect(prisma.oAuthRefreshToken.updateMany).not.toHaveBeenCalled();
        expect(prisma.oAuthAccessToken.create).not.toHaveBeenCalled();
      });

      it("without a membership row, a user whose own workspace is the client's tenant keeps the role on the user row", async () => {
        prisma.workspaceMember.findUnique.mockResolvedValue(null);
        prisma.oAuthAuthorizationCode.findUnique.mockResolvedValue({
          ...code(),
          user: { id: 42, tenantId: 7, role: 'ADMIN' },
        });

        expect(jwt.decode((await exchange()).access_token)).toMatchObject({ tenantId: 7, role: 'ADMIN' });
      });

      it('in single-tenant mode a user with no tenant on the row gets the implicit tenant, and only that one', async () => {
        prisma.workspaceMember.findUnique.mockResolvedValue(null);
        const single = {
          get: (key: string) => (key === 'multiTenancy' ? { enabled: false, implicitTenantId: 7 } : settings[key]),
        };
        service = new OAuthProviderService(prisma, jwt, single as never);
        prisma.oAuthAuthorizationCode.findUnique.mockResolvedValue({
          ...code(),
          user: { id: 42, tenantId: null, role: 'MEMBER' },
        });
        expect(jwt.decode((await exchange()).access_token)).toMatchObject({ tenantId: 7, role: 'MEMBER' });

        prisma.oAuthAuthorizationCode.findUnique.mockResolvedValue({
          ...code(),
          client: client({ tenantId: 8 }),
          user: { id: 42, tenantId: null, role: 'MEMBER' },
        });
        await expect(exchange()).rejects.toThrow(BadRequestException);
      });
    });

    it('issues no tokens on code exchange for a client that belongs to no tenant', async () => {
      const verifier = 'verifier-123';
      prisma.oAuthAuthorizationCode.updateMany.mockResolvedValue({ count: 1 });
      prisma.oAuthAuthorizationCode.findUnique.mockResolvedValue({
        expiresAt: new Date(Date.now() + 60_000),
        redirectUri: authorizeParams.redirectUri,
        codeChallenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
        scopes: ['platform:read'],
        client: client({ tenantId: null }),
        user: { id: 42, tenantId: 7, role: 'ADMIN' },
      });

      await expect(
        service.exchangeCode('code', verifier, 'client-1', undefined, authorizeParams.redirectUri),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.oAuthAccessToken.create).not.toHaveBeenCalled();
    });

    it('issues no tokens on refresh for a client that belongs to no tenant', async () => {
      prisma.oAuthRefreshToken.findUnique.mockResolvedValue({
        rotatedAt: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        originalIssuedAt: new Date(),
        scopes: ['platform:read'],
        userId: 42,
        clientId: 10,
        client: client({ tenantId: null }),
        user: { id: 42, tenantId: 7, role: 'ADMIN' },
      });

      await expect(service.refreshToken('old-refresh', 'client-1', undefined)).rejects.toThrow(BadRequestException);
      expect(prisma.oAuthRefreshToken.updateMany).not.toHaveBeenCalled();
      expect(prisma.oAuthAccessToken.create).not.toHaveBeenCalled();
    });
  });
});

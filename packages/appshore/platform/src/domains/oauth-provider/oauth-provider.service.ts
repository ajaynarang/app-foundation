import { Injectable, BadRequestException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import { OAUTH_CONFIG } from './constants/oauth.constants';
import type { AuthorizationRequest, ConsentChallenge } from '@app/shared-types';
import { oauthError, OAUTH_ERROR } from './oauth-error.filter';
import { resolveOAuthAccessTokenSecret, resolveOAuthConsentSecret, resolveOAuthIssuer } from './oauth-settings';

/** The Prisma delegates token issuance writes through: the client itself, or a transaction. */
type TokenStore = Pick<PrismaService, 'oAuthAccessToken' | 'oAuthRefreshToken'>;

/** The tenant and role an access token is issued for. */
interface TokenGrant {
  tenantId: number;
  role: string;
}

/** RFC 6749 Section 5.1 token response (snake_case per spec). */
export interface OAuthTokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export interface OAuthAccessTokenPayload {
  sub: string;
  tenantId: number;
  role: string;
  scopes: string[];
  clientId: string;
  jti: string;
  iat: number;
  exp: number;
}

@Injectable()
export class OAuthProviderService {
  private readonly logger = new Logger(OAuthProviderService.name);
  private readonly oauthSecret: string;
  /** Consent challenges get their own secret so a challenge can never pass as an access token. */
  private readonly consentSecret: string;
  /** `iss` of every access token; checked again when a token is validated. */
  private readonly issuer: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    const read = (key: string) => this.configService.get<string>(key);
    this.oauthSecret = resolveOAuthAccessTokenSecret(read);
    this.consentSecret = resolveOAuthConsentSecret(read);
    this.issuer = resolveOAuthIssuer(read);
  }

  /**
   * Validate authorization request and return consent challenge.
   */
  async authorize(params: AuthorizationRequest): Promise<string> {
    const client = await this.prisma.oAuthClient.findUnique({
      where: { clientId: params.clientId },
    });

    if (!client || !client.isActive) {
      throw oauthError(OAUTH_ERROR.INVALID_REQUEST, 'Invalid client_id');
    }

    // Exact-match redirect URI validation
    if (!client.redirectUris.includes(params.redirectUri)) {
      throw oauthError(OAUTH_ERROR.INVALID_REQUEST, 'Invalid redirect_uri');
    }

    // Validate requested scopes are allowed for this client
    const requestedScopes = params.scope.split(' ').filter(Boolean);
    const invalidScopes = requestedScopes.filter((s) => !client.scopes.includes(s));
    if (invalidScopes.length > 0) {
      throw oauthError(OAUTH_ERROR.INVALID_SCOPE, `Invalid scopes: ${invalidScopes.join(', ')}`);
    }

    // Create consent challenge JWT
    const challenge: ConsentChallenge = {
      clientId: client.clientId,
      clientName: client.name,
      clientDescription: client.description,
      requestedScopes,
      redirectUri: params.redirectUri,
      state: params.state,
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: params.codeChallengeMethod,
    };

    return this.jwtService.sign(challenge, {
      secret: this.consentSecret,
      expiresIn: '10m',
    } as any);
  }

  /**
   * User approved consent — generate authorization code.
   */
  async approveConsent(
    challengeToken: string,
    userId: number,
    userTenantDbId: number | null,
    selectedScopes?: string[],
  ): Promise<{ redirectUrl: string }> {
    if (userTenantDbId === null) {
      throw new BadRequestException('Open a workspace before connecting an app to it');
    }

    let challenge: ConsentChallenge;
    try {
      challenge = this.jwtService.verify(challengeToken, {
        secret: this.consentSecret,
      });
    } catch {
      throw new BadRequestException('Invalid or expired consent challenge');
    }

    const client = await this.prisma.oAuthClient.findUnique({
      where: { clientId: challenge.clientId },
    });

    if (!client || !client.isActive) {
      throw new BadRequestException('Client no longer available');
    }

    await this.bindClientToTenant(client, userTenantDbId);

    // The user may have unchecked some scopes on the consent screen. Intersect
    // their selection with what was actually requested — never widen, only
    // narrow. If the client omitted `selectedScopes` (older flow), fall back
    // to the full requested set.
    const requestedSet = new Set(challenge.requestedScopes);
    const grantedScopes =
      selectedScopes && selectedScopes.length > 0
        ? selectedScopes.filter((s) => requestedSet.has(s))
        : challenge.requestedScopes;

    if (grantedScopes.length === 0) {
      throw new BadRequestException('Cannot approve with zero scopes — deny instead.');
    }

    const code = nanoid(64);
    const expiresAt = new Date(Date.now() + OAUTH_CONFIG.AUTH_CODE_TTL_SECONDS * 1000);

    await this.prisma.oAuthAuthorizationCode.create({
      data: {
        code,
        clientId: client.id,
        userId,
        codeChallenge: challenge.codeChallenge,
        codeChallengeMethod: challenge.codeChallengeMethod,
        scopes: grantedScopes,
        redirectUri: challenge.redirectUri,
        expiresAt,
      },
    });

    const redirectUrl = new URL(challenge.redirectUri);
    redirectUrl.searchParams.set('code', code);
    redirectUrl.searchParams.set('state', challenge.state);

    return { redirectUrl: redirectUrl.toString() };
  }

  /**
   * Exchange authorization code for tokens.
   */
  async exchangeCode(
    code: string,
    codeVerifier: string,
    clientId: string,
    clientSecret: string | undefined,
    redirectUri: string,
  ): Promise<OAuthTokenResponse> {
    // Atomic single-use: claim the code with UPDATE ... WHERE used_at IS NULL
    const claimed = await this.prisma.oAuthAuthorizationCode.updateMany({
      where: { code, usedAt: null },
      data: { usedAt: new Date() },
    });

    if (claimed.count === 0) {
      // Either code doesn't exist, already used, or replayed
      const existing = await this.prisma.oAuthAuthorizationCode.findUnique({
        where: { code },
        select: { usedAt: true, userId: true, clientId: true },
      });
      if (existing?.usedAt) {
        // Replay detected — revoke all tokens for safety
        this.logger.warn(`Auth code replay detected for client ${clientId}, revoking tokens`);
        await this.revokeAllTokensForUser(existing.userId, existing.clientId);
      }
      throw oauthError(OAUTH_ERROR.INVALID_GRANT, 'Invalid or expired authorization code');
    }

    // Now load the full code with relations for validation
    const authCode = await this.prisma.oAuthAuthorizationCode.findUnique({
      where: { code },
      include: { client: true, user: { include: { tenant: true } } },
    });

    if (!authCode) {
      throw oauthError(OAUTH_ERROR.INVALID_GRANT, 'Invalid or expired authorization code');
    }

    // Use a generic error message for all validation failures
    // to avoid leaking information via different error messages
    const invalidMsg = 'Invalid or expired authorization code';

    if (authCode.expiresAt < new Date()) {
      throw oauthError(OAUTH_ERROR.INVALID_GRANT, invalidMsg);
    }

    if (authCode.client.clientId !== clientId) {
      throw oauthError(OAUTH_ERROR.INVALID_GRANT, invalidMsg);
    }

    if (authCode.redirectUri !== redirectUri) {
      throw oauthError(OAUTH_ERROR.INVALID_GRANT, invalidMsg);
    }

    // PKCE verification (S256)
    const expectedChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    if (expectedChallenge !== authCode.codeChallenge) {
      throw oauthError(OAUTH_ERROR.INVALID_GRANT, invalidMsg);
    }

    // Client secret verification for confidential clients
    if (authCode.client.clientType === 'confidential') {
      if (!clientSecret) {
        throw oauthError(
          OAUTH_ERROR.INVALID_CLIENT,
          'client_secret required for confidential clients',
          HttpStatus.UNAUTHORIZED,
        );
      }
      const valid = await bcrypt.compare(clientSecret, authCode.client.clientSecret);
      if (!valid) {
        throw oauthError(OAUTH_ERROR.INVALID_CLIENT, 'Invalid client credentials', HttpStatus.UNAUTHORIZED);
      }
    }

    this.assertClientHasTenant(authCode.client);
    const grant = await this.resolveGrant(authCode.user, authCode.client);
    if (!grant) {
      throw oauthError(OAUTH_ERROR.INVALID_GRANT, invalidMsg);
    }

    return this.prisma.$transaction((tx) =>
      this.issueTokens(tx, authCode.user, authCode.client, grant, authCode.scopes),
    );
  }

  /**
   * Refresh token rotation.
   */
  async refreshToken(
    refreshTokenValue: string,
    clientId: string,
    clientSecret: string | undefined,
  ): Promise<OAuthTokenResponse> {
    const tokenHashValue = this.hashToken(refreshTokenValue);

    const storedToken = await this.prisma.oAuthRefreshToken.findUnique({
      where: { tokenHash: tokenHashValue },
      include: { client: true, user: { include: { tenant: true } } },
    });

    if (!storedToken) {
      throw oauthError(OAUTH_ERROR.INVALID_GRANT, 'Invalid refresh token');
    }

    // Replay detection: if token was already rotated, revoke entire chain
    if (storedToken.rotatedAt) {
      this.logger.warn(`Refresh token replay detected for client ${clientId}, user ${storedToken.userId}`);
      await this.revokeAllTokensForUser(storedToken.userId, storedToken.clientId);
      throw oauthError(OAUTH_ERROR.INVALID_GRANT, 'Refresh token reuse detected — all tokens revoked');
    }

    if (storedToken.revokedAt) {
      throw oauthError(OAUTH_ERROR.INVALID_GRANT, 'Refresh token revoked');
    }

    if (storedToken.expiresAt < new Date()) {
      throw oauthError(OAUTH_ERROR.INVALID_GRANT, 'Refresh token expired');
    }

    if (storedToken.client.clientId !== clientId) {
      throw oauthError(OAUTH_ERROR.INVALID_GRANT, 'Client mismatch');
    }

    // Verify client secret for confidential clients
    if (storedToken.client.clientType === 'confidential') {
      if (!clientSecret) {
        throw oauthError(
          OAUTH_ERROR.INVALID_CLIENT,
          'client_secret required for confidential clients',
          HttpStatus.UNAUTHORIZED,
        );
      }
      const valid = await bcrypt.compare(clientSecret, storedToken.client.clientSecret);
      if (!valid) {
        throw oauthError(OAUTH_ERROR.INVALID_CLIENT, 'Invalid client credentials', HttpStatus.UNAUTHORIZED);
      }
    }

    // 90-day absolute cap from the first token in the chain; past it the client must re-consent.
    this.assertWithinAbsoluteTtl(storedToken.originalIssuedAt);
    this.assertClientHasTenant(storedToken.client);
    // Not rotated and not revoked: if the membership comes back, the same token works again.
    const grant = await this.resolveGrant(storedToken.user, storedToken.client);
    if (!grant) {
      throw oauthError(OAUTH_ERROR.INVALID_GRANT, "The user no longer belongs to this app's workspace");
    }

    // The rotation claim and the new tokens commit together. Of two concurrent refreshes with the same token
    // exactly one claims it (the other is reuse and revokes the chain), and a failure while issuing rolls the
    // claim back, so the client can simply retry.
    const tokens = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.oAuthRefreshToken.updateMany({
        where: { tokenHash: tokenHashValue, rotatedAt: null, revokedAt: null },
        data: { rotatedAt: new Date() },
      });
      if (claimed.count === 0) return null;
      const issued = await this.issueTokens(tx, storedToken.user, storedToken.client, grant, storedToken.scopes, {
        originalIssuedAt: storedToken.originalIssuedAt,
      });
      await tx.oAuthRefreshToken.update({
        where: { tokenHash: tokenHashValue },
        data: { replacedByHash: this.hashToken(issued.refresh_token) },
      });
      return issued;
    });

    if (!tokens) {
      this.logger.warn(`Concurrent refresh token reuse for client ${clientId}, user ${storedToken.userId}`);
      await this.revokeAllTokensForUser(storedToken.userId, storedToken.clientId);
      throw oauthError(OAUTH_ERROR.INVALID_GRANT, 'Refresh token reuse detected — all tokens revoked');
    }
    return tokens;
  }

  /**
   * Revoke a token (access or refresh).
   */
  async revokeToken(token: string): Promise<void> {
    const tokenHashValue = this.hashToken(token);

    // Try access token first
    const accessToken = await this.prisma.oAuthAccessToken.findUnique({
      where: { tokenHash: tokenHashValue },
    });

    if (accessToken) {
      await this.prisma.oAuthAccessToken.update({
        where: { tokenHash: tokenHashValue },
        data: { revokedAt: new Date() },
      });
      return;
    }

    // Try refresh token
    const refreshToken = await this.prisma.oAuthRefreshToken.findUnique({
      where: { tokenHash: tokenHashValue },
    });

    if (refreshToken) {
      await this.prisma.oAuthRefreshToken.update({
        where: { tokenHash: tokenHashValue },
        data: { revokedAt: new Date() },
      });
    }

    // RFC 7009: always return success even if token not found
  }

  /**
   * Validate an OAuth access token. Returns payload if valid, null if not.
   */
  async validateAccessToken(token: string): Promise<OAuthAccessTokenPayload | null> {
    try {
      const payload = this.jwtService.verify<OAuthAccessTokenPayload>(token, {
        secret: this.oauthSecret,
        issuer: this.issuer,
      });

      // Verify it has OAuth-specific claims
      if (!payload.clientId || !payload.scopes) {
        this.logger.warn('Token missing OAuth claims (clientId or scopes)');
        return null;
      }

      // Check revocation in DB
      const tokenHashValue = this.hashToken(token);
      const stored = await this.prisma.oAuthAccessToken.findUnique({
        where: { tokenHash: tokenHashValue },
      });

      if (!stored) {
        this.logger.warn(`Token not found in DB — clientId=${payload.clientId}, sub=${payload.sub}`);
        return null;
      }

      if (stored.revokedAt) {
        this.logger.warn(`Token revoked (clientId: ${payload.clientId})`);
        return null;
      }

      return payload;
    } catch (error: any) {
      this.logger.warn(`Token verification failed: ${error.message}`);
      return null;
    }
  }

  // ── Private helpers ──────────────────────────────────────

  private assertWithinAbsoluteTtl(originalIssuedAt: Date): void {
    const absoluteTtlMs =
      (Number(this.configService.get<string>('OAUTH_REFRESH_TOKEN_ABSOLUTE_TTL')) ||
        OAUTH_CONFIG.REFRESH_TOKEN_ABSOLUTE_TTL_SECONDS) * 1000;
    if (Date.now() - originalIssuedAt.getTime() > absoluteTtlMs) {
      throw oauthError(OAUTH_ERROR.INVALID_GRANT, 'Refresh token chain expired — user must re-consent');
    }
  }

  /**
   * RFC 7591 dynamic client registration creates clients with no tenant (an MCP client cannot know its tenant
   * before anyone logs in), so the first tenant to consent takes the client. That is a compare-and-set: of two
   * tenants consenting at once one takes it and the other is refused. A client that already belongs to a tenant
   * is never used from another one, because that tenant's admins could neither see nor revoke it.
   */
  private async bindClientToTenant(client: { id: number; tenantId: number | null }, tenantDbId: number) {
    if (client.tenantId === tenantDbId) return;
    if (client.tenantId === null) {
      const adopted = await this.prisma.oAuthClient.updateMany({
        where: { id: client.id, tenantId: null },
        data: { tenantId: tenantDbId },
      });
      if (adopted.count === 1) return;
      const current = await this.prisma.oAuthClient.findUnique({
        where: { id: client.id },
        select: { tenantId: true },
      });
      if (current?.tenantId === tenantDbId) return;
    }
    throw new BadRequestException('This app is connected to a different workspace');
  }

  /** No tokens for a client that belongs to no tenant: no admin could see it or revoke it. */
  private assertClientHasTenant(client: { tenantId: number | null }): void {
    if (client.tenantId === null) {
      throw oauthError(OAUTH_ERROR.INVALID_GRANT, 'This app is not connected to a workspace. Connect it again.');
    }
  }

  /**
   * What a token for this user through this client may carry: the client's tenant, never the tenant the user
   * row currently points at (that follows every workspace switch, so a client connected in one workspace would
   * otherwise get tokens for whichever workspace the user opened last, where no admin can see or revoke it), and
   * the user's role in that tenant. Null when the user is not a member of the client's tenant: no tokens then.
   */
  private async resolveGrant(
    user: { id: number; tenantId: number | null; role: string },
    client: { tenantId: number | null },
  ): Promise<TokenGrant | null> {
    const tenantId = client.tenantId;
    if (tenantId === null) return null;

    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_tenantId: { userId: user.id, tenantId } },
      select: { role: true },
    });
    if (membership) return { tenantId, role: membership.role };

    // No membership row. The user row still names the user's own workspace and role there (accounts created
    // before memberships existed), and in single-tenant mode everyone belongs to the one implicit tenant.
    if (user.tenantId === tenantId) return { tenantId, role: user.role };
    const multiTenancy = this.configService.get<{ enabled: boolean; implicitTenantId: number }>('multiTenancy');
    if (
      multiTenancy?.enabled === false &&
      user.tenantId === null &&
      user.role !== 'SUPER_ADMIN' &&
      tenantId === multiTenancy.implicitTenantId
    ) {
      return { tenantId, role: user.role };
    }
    return null;
  }

  /** Signs and stores an access + refresh pair through `store`, so a caller's transaction covers both rows. */
  private async issueTokens(
    store: TokenStore,
    user: { id: number },
    client: { id: number; clientId: string },
    grant: TokenGrant,
    scopes: string[],
    chainContext: { originalIssuedAt?: Date } = {},
  ): Promise<OAuthTokenResponse> {
    const accessTokenTtl =
      Number(this.configService.get<string>('OAUTH_ACCESS_TOKEN_TTL')) || OAUTH_CONFIG.ACCESS_TOKEN_TTL_SECONDS;
    const refreshTokenTtl =
      Number(this.configService.get<string>('OAUTH_REFRESH_TOKEN_TTL')) || OAUTH_CONFIG.REFRESH_TOKEN_TTL_SECONDS;

    // JWT access token — jti nonce prevents hash collisions on rapid re-issuance
    const jti = nanoid(16);
    const accessToken = this.jwtService.sign(
      {
        sub: String(user.id),
        tenantId: grant.tenantId,
        role: grant.role,
        scopes,
        clientId: client.clientId,
        jti,
      },
      {
        secret: this.oauthSecret,
        expiresIn: accessTokenTtl,
        issuer: this.issuer,
      },
    );

    // Opaque refresh token
    const rawRefreshToken = nanoid(64);

    // Store token hashes
    const accessHash = this.hashToken(accessToken);
    const refreshHash = this.hashToken(rawRefreshToken);

    this.logger.log(
      `issueTokens — storing accessHash=${accessHash.substring(0, 12)}..., refreshHash=${refreshHash.substring(0, 12)}..., jti=${jti}, userId=${user.id}, clientDbId=${client.id}`,
    );

    await store.oAuthAccessToken.create({
      data: {
        tokenHash: accessHash,
        clientId: client.id,
        userId: user.id,
        scopes,
        expiresAt: new Date(Date.now() + accessTokenTtl * 1000),
      },
    });
    await store.oAuthRefreshToken.create({
      data: {
        tokenHash: refreshHash,
        clientId: client.id,
        userId: user.id,
        scopes,
        expiresAt: new Date(Date.now() + refreshTokenTtl * 1000),
        originalIssuedAt: chainContext.originalIssuedAt ?? new Date(),
      },
    });

    this.logger.log(`issueTokens — stored successfully, jti=${jti}`);

    // RFC 6749 Section 5.1 requires snake_case in token responses
    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: accessTokenTtl,
      refresh_token: rawRefreshToken,
      scope: scopes.join(' '),
    };
  }

  private async revokeAllTokensForUser(userId: number, clientId: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.oAuthAccessToken.updateMany({
        where: { userId, clientId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.oAuthRefreshToken.updateMany({
        where: { userId, clientId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}

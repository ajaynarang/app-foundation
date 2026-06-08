import { Injectable, BadRequestException, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import { OAUTH_CONFIG } from './constants/oauth.constants';
import type { AuthorizationRequest, ConsentChallenge } from '@app/shared-types';

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
  private readonly issuer: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    // Derive OAuth secret from secretKey if OAUTH_JWT_SECRET is not set.
    // secretKey always has a default in configuration.ts, so this is safe.
    const explicit = this.configService.get<string>('OAUTH_JWT_SECRET');
    const baseSecret = this.configService.get<string>('secretKey');
    this.oauthSecret = explicit || `${baseSecret}-oauth`;

    this.issuer = this.configService.get<string>('OAUTH_ISSUER') || 'https://api.trysally.com';
  }

  /**
   * Validate authorization request and return consent challenge.
   */
  async authorize(params: AuthorizationRequest): Promise<string> {
    const client = await this.prisma.oAuthClient.findUnique({
      where: { clientId: params.clientId },
    });

    if (!client || !client.isActive) {
      throw new BadRequestException('Invalid client_id');
    }

    // Exact-match redirect URI validation
    if (!client.redirectUris.includes(params.redirectUri)) {
      throw new BadRequestException('Invalid redirect_uri');
    }

    // Validate requested scopes are allowed for this client
    const requestedScopes = params.scope.split(' ').filter(Boolean);
    const invalidScopes = requestedScopes.filter((s) => !client.scopes.includes(s));
    if (invalidScopes.length > 0) {
      throw new BadRequestException(`Invalid scopes: ${invalidScopes.join(', ')}`);
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
      secret: this.oauthSecret,
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
    let challenge: ConsentChallenge;
    try {
      challenge = this.jwtService.verify(challengeToken, {
        secret: this.oauthSecret,
      } as any);
    } catch {
      throw new BadRequestException('Invalid or expired consent challenge');
    }

    const client = await this.prisma.oAuthClient.findUnique({
      where: { clientId: challenge.clientId },
    });

    if (!client || !client.isActive) {
      throw new BadRequestException('Client no longer available');
    }

    // RFC 7591 dynamic client registration creates clients with no tenant
    // (Claude/ChatGPT can't know which tenant they belong to before any user
    // logs in). The first authorizing user adopts the client into their
    // tenant — matches the user's mental model: "I connected it, it's mine."
    if (client.tenantId === null && userTenantDbId !== null) {
      await this.prisma.oAuthClient.update({
        where: { id: client.id },
        data: { tenantId: userTenantDbId },
      });
    }

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
      throw new BadRequestException('Invalid or expired authorization code');
    }

    // Now load the full code with relations for validation
    const authCode = await this.prisma.oAuthAuthorizationCode.findUnique({
      where: { code },
      include: { client: true, user: { include: { tenant: true } } },
    });

    if (!authCode) {
      throw new BadRequestException('Invalid or expired authorization code');
    }

    // Use a generic error message for all validation failures
    // to avoid leaking information via different error messages
    const invalidMsg = 'Invalid or expired authorization code';

    if (authCode.expiresAt < new Date()) {
      throw new BadRequestException(invalidMsg);
    }

    if (authCode.client.clientId !== clientId) {
      throw new BadRequestException(invalidMsg);
    }

    if (authCode.redirectUri !== redirectUri) {
      throw new BadRequestException(invalidMsg);
    }

    // PKCE verification (S256)
    const expectedChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    if (expectedChallenge !== authCode.codeChallenge) {
      throw new BadRequestException(invalidMsg);
    }

    // Client secret verification for confidential clients
    if (authCode.client.clientType === 'confidential') {
      if (!clientSecret) {
        throw new BadRequestException('client_secret required for confidential clients');
      }
      const valid = await bcrypt.compare(clientSecret, authCode.client.clientSecret);
      if (!valid) {
        throw new UnauthorizedException('Invalid client credentials');
      }
    }

    // Issue tokens
    return this.issueTokens(authCode.user, authCode.client, authCode.scopes);
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
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Replay detection: if token was already rotated, revoke entire chain
    if (storedToken.rotatedAt) {
      this.logger.warn(`Refresh token replay detected for client ${clientId}, user ${storedToken.userId}`);
      await this.revokeAllTokensForUser(storedToken.userId, storedToken.clientId);
      throw new UnauthorizedException('Refresh token reuse detected — all tokens revoked');
    }

    if (storedToken.revokedAt) {
      throw new UnauthorizedException('Refresh token revoked');
    }

    if (storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    if (storedToken.client.clientId !== clientId) {
      throw new UnauthorizedException('Client mismatch');
    }

    // Verify client secret for confidential clients
    if (storedToken.client.clientType === 'confidential') {
      if (!clientSecret) {
        throw new UnauthorizedException('client_secret required for confidential clients');
      }
      const valid = await bcrypt.compare(clientSecret, storedToken.client.clientSecret);
      if (!valid) {
        throw new UnauthorizedException('Invalid client_secret');
      }
    }

    // 90-day absolute cap — if the first token in this chain was issued >90d ago, refuse
    this.assertWithinAbsoluteTtl(storedToken.originalIssuedAt);

    // Revoke entire chain if cap exceeded (handled in assertWithinAbsoluteTtl by throwing;
    // the controller's exception filter returns 401 and the client must re-consent)

    // Issue new tokens and mark old one as rotated atomically
    const tokens = await this.issueTokens(storedToken.user, storedToken.client, storedToken.scopes, {
      originalIssuedAt: storedToken.originalIssuedAt,
    });

    const newRefreshHash = this.hashToken(tokens.refresh_token);
    await this.prisma.oAuthRefreshToken.update({
      where: { tokenHash: tokenHashValue },
      data: {
        rotatedAt: new Date(),
        replacedByHash: newRefreshHash,
      },
    });

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
      } as any);

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
      throw new UnauthorizedException('Refresh token chain expired — user must re-consent');
    }
  }

  private async issueTokens(
    user: any,
    client: any,
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
        tenantId: user.tenantId,
        role: user.role,
        scopes,
        clientId: client.clientId,
        jti,
      },
      {
        secret: this.oauthSecret,
        expiresIn: accessTokenTtl,
      } as any,
    );

    // Opaque refresh token
    const rawRefreshToken = nanoid(64);

    // Store token hashes
    const accessHash = this.hashToken(accessToken);
    const refreshHash = this.hashToken(rawRefreshToken);

    this.logger.log(
      `issueTokens — storing accessHash=${accessHash.substring(0, 12)}..., refreshHash=${refreshHash.substring(0, 12)}..., jti=${jti}, userId=${user.id}, clientDbId=${client.id}`,
    );

    await this.prisma.$transaction([
      this.prisma.oAuthAccessToken.create({
        data: {
          tokenHash: accessHash,
          clientId: client.id,
          userId: user.id,
          scopes,
          expiresAt: new Date(Date.now() + accessTokenTtl * 1000),
        },
      }),
      this.prisma.oAuthRefreshToken.create({
        data: {
          tokenHash: refreshHash,
          clientId: client.id,
          userId: user.id,
          scopes,
          expiresAt: new Date(Date.now() + refreshTokenTtl * 1000),
          originalIssuedAt: chainContext.originalIssuedAt ?? new Date(),
        },
      }),
    ]);

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
    await this.prisma.$transaction([
      this.prisma.oAuthAccessToken.updateMany({
        where: { userId, clientId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.oAuthRefreshToken.updateMany({
        where: { userId, clientId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}

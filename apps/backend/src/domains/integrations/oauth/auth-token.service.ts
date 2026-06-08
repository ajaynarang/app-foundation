import {
  Injectable,
  Logger,
  Inject,
  BadRequestException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import crypto, { randomUUID } from 'crypto';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { CredentialsService } from '../credentials/credentials.service';
import { SallyCacheService } from '../../../infrastructure/cache/sally-cache.service';
import { REDIS_CLIENT } from '../../../infrastructure/cache/redis-client.provider';
import { buildKey } from '../../../infrastructure/cache/cache-key.constants';
import { CACHE_TTL_WARM_10M } from '../../../constants/cache.constants';
import { VENDOR_REGISTRY, OAuthConfig, getVendorOAuth } from '../vendor-registry';

@Injectable()
export class AuthTokenService {
  private readonly logger = new Logger(AuthTokenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly credentialsService: CredentialsService,
    private readonly cache: SallyCacheService,
    // Raw Redis client only for the fenced distributed lock below (SET NX EX + UUID-checked GET/DEL).
    // SallyCacheService.getOrSet uses a simple lock that does not fence by holder identity, so it
    // cannot replace this. All other Redis ops in this file go through `cache`.
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Build the OAuth authorization URL for a vendor.
   * Generates a CSRF nonce stored in cache.
   */
  async getConnectUrl(vendor: string, tenantId: number): Promise<{ authUrl: string }> {
    const oauthConfig = this.getOAuthConfig(vendor);
    const clientId = this.getEnvVar(oauthConfig.envPrefix, 'CLIENT_ID');
    const redirectUri = this.config.get<string>('OAUTH_REDIRECT_URI', '');

    const nonce = crypto.randomBytes(16).toString('hex');
    const statePayload = { tenantId, vendor, nonce };
    const state = Buffer.from(JSON.stringify(statePayload)).toString('base64');
    await this.cache.set(buildKey('sally:oauth', 'nonce', vendor, nonce), tenantId, CACHE_TTL_WARM_10M);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: oauthConfig.scopes.join(' '),
      state,
      ...oauthConfig.extraAuthParams,
    });

    const authUrl = `${oauthConfig.authorizationUrl}?${params.toString()}`;
    return { authUrl };
  }

  /**
   * Handle the OAuth callback from any vendor.
   * Validates CSRF, exchanges code for tokens, stores encrypted credentials.
   */
  async handleCallback(
    code: string,
    state: string,
    extraParams: Record<string, string>,
  ): Promise<{ vendor: string; tenantId: number }> {
    const { tenantId, vendor, nonce } = JSON.parse(Buffer.from(state, 'base64').toString());

    // Validate CSRF nonce
    const cachedTenantId = await this.cache.get<number>(buildKey('sally:oauth', 'nonce', vendor, nonce));
    if (!cachedTenantId || cachedTenantId !== tenantId) {
      throw new UnauthorizedException('OAuth session expired — please reconnect your integration');
    }
    await this.cache.del(buildKey('sally:oauth', 'nonce', vendor, nonce));

    // Exchange code for tokens
    const oauthConfig = this.getOAuthConfig(vendor);
    const tokens = await this.exchangeCodeForTokens(oauthConfig, code);

    // Build credentials object with vendor-specific extras
    const credentials: Record<string, string> = {
      authMethod: 'oauth',
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    };

    // Store vendor-specific callback params (e.g. realmId for QB)
    for (const param of oauthConfig.callbackQueryParams ?? []) {
      if (extraParams[param]) {
        credentials[param] = extraParams[param];
      }
    }

    const encrypted = this.credentialsService.encrypt(JSON.stringify(credentials));

    // Upsert IntegrationConfig
    const vendorMeta = VENDOR_REGISTRY[vendor];
    const existing = await this.prisma.integrationConfig.findFirst({
      where: { tenantId, vendor: vendor },
    });

    if (existing) {
      await this.prisma.integrationConfig.update({
        where: { id: existing.id },
        data: {
          credentials: encrypted as any,
          realmId: extraParams['realmId'] ?? existing.realmId,
          isEnabled: true,
          status: 'ACTIVE',
        },
      });
    } else {
      const integrationId = `${vendor.toLowerCase()}-${tenantId}-${Date.now()}`;
      await this.prisma.integrationConfig.create({
        data: {
          integrationId,
          tenantId,
          integrationType: vendorMeta.integrationType as any,
          vendor: vendor,
          displayName: vendorMeta.displayName,
          isEnabled: true,
          status: 'ACTIVE',
          credentials: encrypted as any,
          realmId: extraParams['realmId'] ?? null,
        },
      });
    }

    return { vendor, tenantId };
  }

  /**
   * Refresh tokens for an integration. Updates credentials in DB.
   * Returns new access token.
   */
  async refreshTokens(integrationId: number): Promise<string> {
    const config = await this.prisma.integrationConfig.findUnique({
      where: { id: integrationId },
    });
    if (!config?.credentials) throw new BadRequestException('Integration credentials are not configured');

    const creds = this.decryptCredentials(config.credentials);
    if (creds.authMethod !== 'oauth' && !creds.access_token) {
      throw new BadRequestException('This integration does not use OAuth authentication');
    }

    const oauthConfig = this.getOAuthConfig(config.vendor);
    const clientId = this.getEnvVar(oauthConfig.envPrefix, 'CLIENT_ID');
    const clientSecret = this.getEnvVar(oauthConfig.envPrefix, 'CLIENT_SECRET');
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    // Support both new format (refreshToken) and legacy (refresh_token)
    const refreshToken = creds.refreshToken ?? creds.refresh_token;
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    const res = await fetch(oauthConfig.tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });

    if (!res.ok) {
      const errText = await res.text();
      this.logger.error(`OAuth token refresh failed for ${config.vendor}: ${errText}`);

      // Detect invalid_grant — refresh token expired/revoked
      try {
        const errJson = JSON.parse(errText) as { error?: string };
        if (errJson.error === 'invalid_grant') {
          await this.prisma.integrationConfig.update({
            where: { id: integrationId },
            data: { status: 'NEEDS_RECONNECT' },
          });
          const err = new Error(`OAuth refresh token expired for ${config.vendor}. Reconnect required.`);
          (err as any).nonRetryable = true;
          throw err;
        }
      } catch (parseErr) {
        if (parseErr.nonRetryable) throw parseErr;
      }
      throw new InternalServerErrorException('Failed to refresh integration token — please reconnect');
    }

    const tokens = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    // Always save in new format with authMethod (progressive migration)
    const newCreds = {
      ...creds,
      authMethod: 'oauth',
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    };
    // Clean up legacy fields if present
    delete newCreds.access_token;
    delete newCreds.refresh_token;
    delete newCreds.expires_at;
    delete newCreds.realm_id;
    // Preserve realmId in camelCase if it came from legacy
    if (creds.realm_id && !newCreds.realmId) {
      newCreds.realmId = creds.realm_id;
    }

    const encrypted = this.credentialsService.encrypt(JSON.stringify(newCreds));

    await this.prisma.integrationConfig.update({
      where: { id: integrationId },
      data: { credentials: encrypted as any },
    });

    this.logger.log(`OAuth token refreshed for ${config.vendor} (integration ${integrationId})`);
    return tokens.access_token;
  }

  /**
   * Get a valid access token for an integration.
   * Works for both OAuth and API token integrations.
   *
   * - OAuth: checks expiry, refreshes if needed, returns accessToken
   * - API token: decrypts and returns apiToken directly
   * - Legacy (no authMethod): falls back to apiToken or legacy OAuth fields
   */
  async getActiveToken(integration: { id: number; vendor: string; credentials: any }): Promise<string> {
    if (!integration.credentials) {
      throw new BadRequestException('Integration credentials are not configured');
    }

    const creds = this.decryptCredentials(integration.credentials);

    // API token path
    if (creds.authMethod === 'api_token' || (!creds.authMethod && creds.apiToken)) {
      return creds.apiToken;
    }

    // OAuth path (new format)
    if (creds.authMethod === 'oauth') {
      return this.getOrRefreshOAuthToken(integration.id, creds.accessToken, creds.expiresAt);
    }

    // Legacy QB OAuth credentials (pre-migration, no authMethod field)
    if (!creds.authMethod && creds.access_token) {
      return this.getOrRefreshOAuthToken(integration.id, creds.access_token, creds.expires_at);
    }

    throw new BadRequestException('Integration credentials are in an unsupported format — please reconnect');
  }

  /**
   * Disconnect an OAuth integration: revoke token + clear credentials.
   */
  async disconnect(vendor: string, tenantId: number): Promise<void> {
    const config = await this.prisma.integrationConfig.findFirst({
      where: { tenantId, vendor: vendor as any },
    });

    if (!config?.credentials) return;

    // Try to revoke token (non-fatal)
    try {
      const creds = this.decryptCredentials(config.credentials);
      if (creds.authMethod === 'oauth' || creds.access_token) {
        const oauthConfig = this.getOAuthConfig(vendor);
        if (oauthConfig.revokeUrl) {
          const clientId = this.getEnvVar(oauthConfig.envPrefix, 'CLIENT_ID');
          const clientSecret = this.getEnvVar(oauthConfig.envPrefix, 'CLIENT_SECRET');
          const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
          const token = creds.accessToken ?? creds.access_token;

          await fetch(oauthConfig.revokeUrl, {
            method: 'POST',
            headers: {
              Authorization: `Basic ${basicAuth}`,
              'Content-Type': 'application/x-www-form-urlencoded',
              Accept: 'application/json',
            },
            body: new URLSearchParams({ token }).toString(),
          });
        }
      }
    } catch (err) {
      this.logger.warn(`Token revoke failed for ${vendor} (non-fatal): ${(err as Error).message}`);
    }

    await this.prisma.integrationConfig.update({
      where: { id: config.id },
      data: {
        credentials: null,
        isEnabled: false,
        status: 'NOT_CONFIGURED',
      },
    });
  }

  // ---- Private helpers ----

  private async getOrRefreshOAuthToken(integrationId: number, accessToken: string, expiresAt: string): Promise<string> {
    const expiresAtMs = new Date(expiresAt).getTime();
    const nowPlus5Min = Date.now() + 5 * 60 * 1000;

    if (expiresAtMs > nowPlus5Min) {
      return accessToken;
    }

    // Token expired or expiring soon — refresh with fenced distributed lock.
    // Fence value = UUID written into the lock key, checked on release so we
    // don't accidentally delete a lock acquired by another worker after our
    // EX window expired.
    const lockKey = buildKey('sally:oauth', 'lock', String(integrationId));
    const lockValue = randomUUID();
    const acquired = await this.redis.set(lockKey, lockValue, 'EX', 30, 'NX');

    if (acquired !== 'OK') {
      // Another worker is refreshing — wait briefly and re-read from DB.
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const refreshed = await this.prisma.integrationConfig.findUnique({
        where: { id: integrationId },
      });
      if (refreshed?.credentials) {
        const refreshedCreds = this.decryptCredentials(refreshed.credentials);
        return refreshedCreds.accessToken ?? refreshedCreds.access_token;
      }
    }

    try {
      return await this.refreshTokens(integrationId);
    } finally {
      // Fenced release: only delete if we still own the lock (UUID match).
      const currentValue = await this.redis.get(lockKey);
      if (currentValue === lockValue) {
        await this.redis.del(lockKey);
      }
    }
  }

  private getOAuthConfig(vendor: string): OAuthConfig {
    const meta = VENDOR_REGISTRY[vendor];
    const oauth = meta ? getVendorOAuth(meta) : undefined;
    if (!oauth) throw new BadRequestException('This integration does not support OAuth');
    return oauth;
  }

  private getEnvVar(prefix: string, suffix: string): string {
    const key = `${prefix}_OAUTH_${suffix}`;
    const value = this.config.get<string>(key, '');
    if (!value) {
      throw new InternalServerErrorException('OAuth integration is not properly configured on this server');
    }
    return value;
  }

  private async exchangeCodeForTokens(
    oauthConfig: OAuthConfig,
    code: string,
  ): Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }> {
    const clientId = this.getEnvVar(oauthConfig.envPrefix, 'CLIENT_ID');
    const clientSecret = this.getEnvVar(oauthConfig.envPrefix, 'CLIENT_SECRET');
    const redirectUri = this.config.get<string>('OAUTH_REDIRECT_URI', '');

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });

    const res = await fetch(oauthConfig.tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      this.logger.error(`OAuth token exchange failed: ${err}`);
      throw new InternalServerErrorException('OAuth connection failed — please try connecting again');
    }

    return res.json() as Promise<{
      access_token: string;
      refresh_token: string;
      expires_in: number;
    }>;
  }

  decryptCredentials(credentials: any): any {
    if (typeof credentials === 'string') {
      return JSON.parse(this.credentialsService.decrypt(credentials));
    }
    if (credentials && typeof credentials === 'object' && !Array.isArray(credentials)) {
      // Decrypt individually-encrypted field values (API token flow)
      const decrypted: Record<string, any> = {};
      for (const [key, value] of Object.entries(credentials)) {
        if (typeof value === 'string') {
          try {
            decrypted[key] = this.credentialsService.decrypt(value);
          } catch {
            decrypted[key] = value;
          }
        } else {
          decrypted[key] = value;
        }
      }
      return decrypted;
    }
    throw new InternalServerErrorException('Integration credentials are corrupted — please reconnect');
  }
}

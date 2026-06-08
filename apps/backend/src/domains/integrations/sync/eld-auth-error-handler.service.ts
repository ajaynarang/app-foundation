import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { AuthTokenService } from '../oauth/auth-token.service';
import { SamsaraAuthError } from '../adapters/eld/samsara-eld.adapter';

/**
 * Shared auth-error handling for ELD sync operations.
 *
 * Extracted from ELDSyncService as a pure mechanical facade split.
 * Behavior is byte-for-byte identical to the original private handler.
 */
@Injectable()
export class EldAuthErrorHandler {
  private readonly logger = new Logger(EldAuthErrorHandler.name);

  constructor(
    private prisma: PrismaService,
    private authTokenService: AuthTokenService,
  ) {}

  /**
   * Handle SamsaraAuthError: for OAuth integrations, refresh the token and
   * return a new one. For API token integrations, mark NEEDS_RECONNECT and
   * throw a non-retryable error (no point retrying with a revoked API key).
   */
  async handleAuthError(
    error: unknown,
    integration: { id: number; vendor: string; credentials: any },
  ): Promise<string> {
    if (!(error instanceof SamsaraAuthError)) throw error;

    const creds = this.authTokenService.decryptCredentials(integration.credentials);

    // OAuth integration — attempt token refresh and return new token
    if (creds.authMethod === 'oauth') {
      this.logger.warn(`OAuth token expired for integration ${integration.id}, refreshing...`);
      return this.authTokenService.refreshTokens(integration.id);
    }

    // API token integration — token was revoked/invalidated in Samsara dashboard
    this.logger.error(
      `API token invalid for integration ${integration.id} (${integration.vendor}). ` +
        `User needs to update their API token in Samsara settings.`,
    );
    await this.prisma.integrationConfig.update({
      where: { id: integration.id },
      data: {
        status: 'NEEDS_RECONNECT',
        lastErrorAt: new Date(),
        lastErrorMessage: 'Samsara API token is invalid or revoked. Please update your API token.',
      },
    });
    const err = new Error('Samsara API token is invalid or revoked. Please reconnect.');
    (err as any).nonRetryable = true;
    throw err;
  }
}

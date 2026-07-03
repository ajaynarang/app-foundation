import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { CredentialsService } from '../credentials/credentials.service';

/**
 * IntegrationDataService — runtime data access for external integrations.
 *
 * Responsibilities:
 * - Test connections to external systems.
 * - Decrypt stored credential fields for adapters.
 *
 * The starter ships with no concrete vendor adapters, so `testConnection`
 * validates that credentials are present and marks the integration ACTIVE.
 * Wire your adapter's real connection check in here per vendor.
 */
@Injectable()
export class IntegrationDataService {
  private readonly logger = new Logger(IntegrationDataService.name);

  constructor(
    private prisma: PrismaService,
    private credentials: CredentialsService,
  ) {}

  /**
   * Test connection to an external system.
   *
   * With no vendor adapters wired in, this performs a presence check on the
   * stored credentials and updates the integration health columns. Replace the
   * body with a real per-vendor connection check when adding an adapter.
   */
  async testConnection(integrationId: string): Promise<boolean> {
    const integration = await this.prisma.integrationConfig.findUnique({
      where: { integrationId },
    });

    if (!integration) {
      throw new NotFoundException('Integration not found');
    }

    try {
      const success = !!integration.credentials && Object.keys(integration.credentials as object).length > 0;

      await this.prisma.integrationConfig.update({
        where: { id: integration.id },
        data: {
          status: success ? 'ACTIVE' : 'ERROR',
          lastSuccessAt: success ? new Date() : integration.lastSuccessAt,
          lastErrorAt: success ? integration.lastErrorAt : new Date(),
          lastErrorMessage: success ? null : 'Connection test failed - check credentials',
        },
      });

      return success;
    } catch (error) {
      await this.prisma.integrationConfig.update({
        where: { id: integration.id },
        data: {
          status: 'ERROR',
          lastErrorAt: new Date(),
          lastErrorMessage: (error as Error).message,
        },
      });

      return false;
    }
  }

  /**
   * Extract and decrypt a specific credential field.
   */
  getCredentialField(credentials: any, fieldName: string): string {
    if (!credentials || !credentials[fieldName]) {
      throw new BadRequestException('Integration credentials are incomplete — please reconnect');
    }

    try {
      return this.credentials.decrypt(credentials[fieldName]);
    } catch {
      // If not encrypted, return as-is (for development)
      return credentials[fieldName];
    }
  }
}

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { CredentialsService } from '../credentials/credentials.service';
import { SamsaraELDAdapter } from '../adapters/eld/samsara-eld.adapter';
import { ELDVehicleLocationData } from '../adapters/eld/eld-adapter.interface';
import { McLeodTMSAdapter } from '../adapters/tms/mcleod-tms.adapter';
import { Project44TMSAdapter } from '../adapters/tms/project44-tms.adapter';
import { EldDataCacheService, HOSCacheData } from './eld-data-cache.service';

/**
 * IntegrationDataService — runtime data access for external integrations.
 *
 * Responsibilities:
 * - Read cached data from EldDataCacheService (Redis → Postgres fallback)
 * - Test connections to external systems
 *
 * NOT responsible for batch sync — that lives in TmsSyncService / EldSyncService.
 * Used by: route monitoring, API endpoints, drivers controller.
 */
@Injectable()
export class IntegrationDataService {
  private readonly logger = new Logger(IntegrationDataService.name);

  constructor(
    private prisma: PrismaService,
    private credentials: CredentialsService,
    private samsaraAdapter: SamsaraELDAdapter,
    private mcleodAdapter: McLeodTMSAdapter,
    private project44Adapter: Project44TMSAdapter,
    private eldDataCache: EldDataCacheService,
  ) {}

  /**
   * Fetch driver HOS data from cache (Redis → Postgres fallback).
   * Returns null when no data is available (callers decide how to handle).
   */
  async getDriverHOS(tenantId: number, driverId: string): Promise<HOSCacheData | null> {
    return this.eldDataCache.getDriverHOS(tenantId, driverId);
  }

  /**
   * Fetch vehicle GPS location from cache (Redis → Postgres fallback).
   * Returns null when no data is available (callers decide how to handle).
   */
  async getVehicleLocation(tenantId: number, vehicleId: string): Promise<ELDVehicleLocationData | null> {
    const cached = await this.eldDataCache.getVehicleTelematics(tenantId, vehicleId);
    if (!cached) return null;

    return {
      vehicleId,
      latitude: cached.latitude,
      longitude: cached.longitude,
      speed: cached.speed,
      heading: cached.heading,
      timestamp: cached.timestamp,
    };
  }

  /**
   * Test connection to external system
   */
  async testConnection(integrationId: string): Promise<boolean> {
    const integration = await this.prisma.integrationConfig.findUnique({
      where: { integrationId },
    });

    if (!integration) {
      throw new NotFoundException('Integration not found');
    }

    try {
      let success = false;

      // Test connection based on vendor - use dynamic credential field names
      if (integration.vendor === 'SAMSARA_ELD' || integration.vendor === 'MOTIVE_ELD') {
        const apiToken = this.getCredentialField(integration.credentials, 'apiToken');
        success = await this.samsaraAdapter.testConnection(apiToken);
      } else if (integration.vendor === 'MCLEOD_TMS' || integration.vendor === 'TMW_TMS') {
        const apiKey = this.getCredentialField(integration.credentials, 'apiKey');
        const baseUrl = this.getCredentialField(integration.credentials, 'baseUrl');
        success = await this.mcleodAdapter.testConnection(apiKey, baseUrl);
      } else if (integration.vendor === 'PROJECT44_TMS') {
        const clientId = this.getCredentialField(integration.credentials, 'clientId');
        const clientSecret = this.getCredentialField(integration.credentials, 'clientSecret');
        success = await this.project44Adapter.testConnection(clientId, clientSecret);
      } else {
        throw new BadRequestException('This vendor integration is not supported');
      }

      // Update integration status
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
          lastErrorMessage: error.message,
        },
      });

      return false;
    }
  }

  /**
   * Extract and decrypt a specific credential field
   */
  private getCredentialField(credentials: any, fieldName: string): string {
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

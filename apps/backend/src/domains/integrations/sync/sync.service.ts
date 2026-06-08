import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { TmsSyncService } from './tms-sync.service';
import { EldSyncService } from './eld-sync.service';
import { VENDOR_REGISTRY } from '../vendor-registry';
import { IntegrationType } from '../dto/create-integration.dto';
import { NotificationTriggersService } from '../../operations/notifications/notification-triggers.service';

/**
 * SyncService provides the core sync orchestration logic.
 *
 * Note: All sync scheduling and job tracking is now handled by Bull queue
 * (SyncProcessor + SyncQueueModule). This service is retained for any
 * domain-level sync logic that may be needed outside the Bull pipeline.
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private prisma: PrismaService,
    private tmsSyncService: TmsSyncService,
    private eldSyncService: EldSyncService,
    private readonly notificationTriggers: NotificationTriggersService,
  ) {}

  /**
   * Sync a single integration (TMS or ELD).
   * Called by SyncProcessor for the actual sync work.
   * No sync log management — the processor handles job tracking.
   */
  async syncIntegration(integrationId: number): Promise<void> {
    this.logger.log(`Starting sync for integration: ${integrationId}`);

    const integration = await this.prisma.integrationConfig.findUnique({
      where: { id: integrationId },
      select: { vendor: true, integrationType: true, tenantId: true },
    });

    if (!integration) {
      throw new NotFoundException('Integration not found');
    }

    const vendorMeta = VENDOR_REGISTRY[integration.vendor];
    if (!vendorMeta) {
      throw new BadRequestException('This vendor integration is not supported');
    }

    try {
      if (vendorMeta.integrationType === IntegrationType.TMS) {
        this.logger.log(`Syncing TMS integration: ${integration.vendor}`);
        await this.tmsSyncService.syncVehicles(integrationId);
        await this.tmsSyncService.syncDrivers(integrationId);
        await this.tmsSyncService.syncLoads(integrationId);
      } else if (vendorMeta.integrationType === IntegrationType.ELD) {
        this.logger.log(`Syncing ELD integration: ${integration.vendor}`);
        await this.eldSyncService.syncVehicles(integrationId);
        await this.eldSyncService.syncDrivers(integrationId);
        await this.eldSyncService.syncTrailers(integrationId);
      } else {
        throw new BadRequestException('Sync is not supported for this integration type');
      }

      this.logger.log(`Sync complete for integration: ${integrationId}`);

      // Fire-and-forget: notify team about successful sync
      this.notificationTriggers
        .integrationSyncCompleted(integration.tenantId, integration.vendor ?? 'Integration', 'Synced successfully')
        .catch(() => {});
    } catch (error) {
      // Fire-and-forget: notify team about sync failure
      this.notificationTriggers
        .integrationSyncFailed(
          integration.tenantId,
          integration.vendor ?? 'Integration',
          error.message ?? 'Unknown error',
        )
        .catch(() => {});

      throw error;
    }
  }
}

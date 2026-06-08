import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { AuthTokenService } from '../oauth/auth-token.service';
import { AdapterFactoryService } from '../adapters/adapter-factory.service';
import { ELDVehicleStat } from '../adapters/eld/eld-adapter.interface';
import { SyncResult } from '../../../infrastructure/sync/sync-job.types';
import { SyncActionLog } from '../../../infrastructure/sync/sync-action-log';
import { EldDataCacheService } from '../services/eld-data-cache.service';
import { EldAuthErrorHandler } from './eld-auth-error-handler.service';

/**
 * Vehicle telematics (GPS, fuel, engine, odometer) sync from ELD.
 *
 * Extracted from ELDSyncService as a pure mechanical facade split.
 * Every method body is byte-for-byte identical to the original.
 */
@Injectable()
export class TelematicsSyncService {
  private readonly logger = new Logger(TelematicsSyncService.name);

  constructor(
    private prisma: PrismaService,
    private authTokenService: AuthTokenService,
    private adapterFactory: AdapterFactoryService,
    private eldDataCache: EldDataCacheService,
    private authErrorHandler: EldAuthErrorHandler,
  ) {}

  async syncTelematics(integrationId: number): Promise<SyncResult> {
    const log = new SyncActionLog();

    const integration = await this.prisma.integrationConfig.findUnique({
      where: { id: integrationId },
    });

    if (!integration) {
      throw new NotFoundException('Integration not found');
    }

    // Get adapter from factory (vendor-agnostic)
    const adapter = this.adapterFactory.getELDAdapter(integration.vendor);
    if (!adapter?.getVehicleStatsFeed) {
      throw new BadRequestException(`ELD vendor ${integration.vendor} does not support telematics feed sync`);
    }

    let token = await this.authTokenService.getActiveToken(integration);

    // Read cursor from syncMetadata
    const syncMetadata = (integration.syncMetadata as Record<string, any>) ?? {};
    const cursor = syncMetadata.telematicsCursor as string | undefined;

    // Call feed endpoint (cursor-based delta sync, retry once on 401)
    let feedResult;
    try {
      feedResult = await adapter.getVehicleStatsFeed(token, cursor);
    } catch (error) {
      token = await this.authErrorHandler.handleAuthError(error, integration);
      feedResult = await adapter.getVehicleStatsFeed(token, cursor);
    }

    log.add('api_fetch', `Fetched ${feedResult.data.length} vehicle stats from feed`, {
      cursor: cursor ?? 'initial',
      hasNextPage: feedResult.hasNextPage,
    });

    this.logger.log(`Syncing telematics for ${feedResult.data.length} vehicle stats (tenant ${integration.tenantId})`);

    // Check if any vehicles have ELD metadata for matching
    if (feedResult.data.length > 0) {
      const vehiclesWithEldMeta = await this.prisma.vehicle.count({
        where: {
          tenantId: integration.tenantId,
          OR: [{ NOT: { eldTelematicsMetadata: { equals: Prisma.DbNull } } }, { externalVehicleId: { not: null } }],
        },
      });

      if (vehiclesWithEldMeta === 0) {
        this.logger.warn(
          `[TELEMATICS_SYNC] 0 vehicles have ELD metadata or externalVehicleId — enrichment may not have run yet. ` +
            `Skipping telematics sync; the sync scheduler should run vehicle enrichment first.`,
        );
        log.add('enrichment_needed', 'No vehicles have ELD metadata — enrichment must run before telematics sync');

        return {
          recordsProcessed: 0,
          recordsCreated: 0,
          recordsExisting: 0,
          details: { actions: log.toArray(), enrichmentNeeded: true },
        };
      }
    }

    let updated = 0;
    let unmatched = 0;
    const results = await Promise.allSettled(
      feedResult.data.map(async (stat) => {
        const success = await this.updateVehicleTelematicsFromFeed(integration.tenantId, stat);
        if (success) {
          updated++;
        } else {
          unmatched++;
          log.add('vehicle_unmatched', `No matching vehicle for Samsara ID ${stat.id}`, {
            samsaraId: stat.id,
          });
        }
      }),
    );

    // Save new cursor back to integrationConfig
    await this.prisma.integrationConfig.update({
      where: { id: integrationId },
      data: {
        syncMetadata: {
          ...syncMetadata,
          telematicsCursor: feedResult.endCursor,
          telematicsCursorUpdatedAt: new Date().toISOString(),
        },
      },
    });

    log.add('cursor_saved', `Saved cursor: ${feedResult.endCursor}`);

    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      this.logger.warn(`Telematics sync for tenant ${integration.tenantId}: ${updated} updated, ${failed} failed`);
    }

    log.add(
      'summary',
      `Telematics sync: ${updated} updated, ${unmatched} unmatched, ${failed} failed out of ${feedResult.data.length} stats`,
    );

    return {
      recordsProcessed: feedResult.data.length,
      recordsCreated: 0,
      recordsExisting: updated,
      details: { actions: log.toArray() },
    };
  }

  /**
   * Update telematics for a single vehicle from the feed result.
   * Populates GPS + rich fields (fuelLevel, engineRunning, odometer).
   */
  private async updateVehicleTelematicsFromFeed(tenantId: number, stat: ELDVehicleStat): Promise<boolean> {
    // Primary match: indexed externalVehicleId column (fast)
    // Fallback: JSON path query on eldTelematicsMetadata.eldId (slower, for legacy data)
    let vehicle = await this.prisma.vehicle.findFirst({
      where: { tenantId, externalVehicleId: stat.id },
    });

    if (!vehicle) {
      vehicle = await this.prisma.vehicle.findFirst({
        where: {
          tenantId,
          eldTelematicsMetadata: {
            path: ['eldId'],
            equals: stat.id,
          },
        },
      });
    }

    if (!vehicle) {
      this.logger.warn(`No matching vehicle for Samsara ID ${stat.id}`);
      return false;
    }

    // Samsara returns gps, fuelPercents, gpsOdometerMeters as arrays — take first element
    const gpsPoint = Array.isArray(stat.gps) ? stat.gps[0] : stat.gps;
    const fuelPoint = Array.isArray(stat.fuelPercents) ? stat.fuelPercents[0] : stat.fuelPercents;
    const odometerPoint = Array.isArray(stat.gpsOdometerMeters) ? stat.gpsOdometerMeters[0] : stat.gpsOdometerMeters;

    // Determine the most recent timestamp from available data
    const timestamps = [gpsPoint?.time, stat.engineStates?.[0]?.time, odometerPoint?.time].filter(Boolean);
    const recordedAt =
      timestamps.length > 0 ? new Date(Math.max(...timestamps.map((t) => new Date(t).getTime()))) : new Date();

    const telematicsData: Record<string, any> = {
      timestamp: recordedAt,
    };

    // GPS fields
    if (gpsPoint) {
      telematicsData.latitude = gpsPoint.latitude;
      telematicsData.longitude = gpsPoint.longitude;
      telematicsData.speed = gpsPoint.speedMilesPerHour;
      telematicsData.heading = gpsPoint.headingDegrees;
    }

    // Rich fields
    if (stat.engineStates && stat.engineStates.length > 0) {
      // Samsara engine states: 'On' | 'Off' | 'Idle'
      // 'Idle' = engine running but vehicle stationary — still counts as engine running
      telematicsData.engineRunning = stat.engineStates[0].value !== 'Off';
    }
    if (fuelPoint) {
      telematicsData.fuelLevel = fuelPoint.value;
    }
    if (odometerPoint) {
      telematicsData.odometer = odometerPoint.value / 1609.34; // meters → miles
    }

    // latitude/longitude are required (non-nullable) in the schema.
    // Skip the upsert entirely if GPS data is missing to avoid writing 0,0.
    if (telematicsData.latitude == null || telematicsData.longitude == null) {
      this.logger.debug(`Skipping telematics upsert for vehicle ${vehicle.vehicleId} — no GPS data available`);
      return true; // Vehicle matched, just no GPS to write
    }

    await this.prisma.vehicleTelematics.upsert({
      where: { vehicleId: vehicle.id },
      update: telematicsData,
      create: {
        vehicleId: vehicle.id,
        tenantId,
        latitude: telematicsData.latitude,
        longitude: telematicsData.longitude,
        speed: telematicsData.speed ?? 0,
        heading: telematicsData.heading ?? 0,
        fuelLevel: telematicsData.fuelLevel ?? null,
        engineRunning: telematicsData.engineRunning ?? false,
        odometer: telematicsData.odometer ?? 0,
        timestamp: recordedAt,
      },
    });

    // Write-through to Redis cache
    await this.eldDataCache.setVehicleTelematics(tenantId, vehicle.vehicleId, {
      vehicleId: vehicle.vehicleId,
      latitude: telematicsData.latitude,
      longitude: telematicsData.longitude,
      speed: telematicsData.speed ?? 0,
      heading: telematicsData.heading ?? 0,
      fuelLevel: telematicsData.fuelLevel ?? null,
      engineRunning: telematicsData.engineRunning ?? false,
      odometer: telematicsData.odometer ?? 0,
      timestamp: recordedAt.toISOString(),
      syncedAt: new Date().toISOString(),
    });

    return true;
  }
}

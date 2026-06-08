import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { AuthTokenService } from '../oauth/auth-token.service';
import { AdapterFactoryService } from '../adapters/adapter-factory.service';
import { HOSClockData } from '../adapters/eld/eld-adapter.interface';
import { AlertService, AlertSeverity } from '../../operations/alerts/services/alert.service';
import { SyncResult } from '../../../infrastructure/sync/sync-job.types';
import { SyncActionLog } from '../../../infrastructure/sync/sync-action-log';
import { HOS_CONSTANTS } from '@sally/shared-types';
import { EldDataCacheService } from '../services/eld-data-cache.service';
import { EldAuthErrorHandler } from './eld-auth-error-handler.service';

/**
 * HOS clock sync from ELD.
 *
 * Extracted from ELDSyncService as a pure mechanical facade split.
 * Every method body is byte-for-byte identical to the original.
 */
@Injectable()
export class HosSyncService {
  private readonly logger = new Logger(HosSyncService.name);

  constructor(
    private prisma: PrismaService,
    private authTokenService: AuthTokenService,
    private adapterFactory: AdapterFactoryService,
    private alertService: AlertService,
    private eldDataCache: EldDataCacheService,
    private authErrorHandler: EldAuthErrorHandler,
  ) {}

  async syncHos(integrationId: number): Promise<SyncResult> {
    const log = new SyncActionLog();

    const integration = await this.prisma.integrationConfig.findUnique({
      where: { id: integrationId },
      select: { id: true, vendor: true, tenantId: true, credentials: true },
    });

    if (!integration) {
      throw new NotFoundException('Integration not found');
    }

    const { tenantId } = integration;
    this.logger.debug(`[HOS_SYNC] Starting for tenant ${tenantId}, integration ${integrationId}`);

    // Get adapter from factory (vendor-agnostic)
    const adapter = this.adapterFactory.getELDAdapter(integration.vendor);
    if (!adapter?.getHOSClocks) {
      throw new BadRequestException(`ELD vendor ${integration.vendor} does not support HOS clock sync`);
    }

    let token = await this.authTokenService.getActiveToken(integration);
    this.logger.debug(`[HOS_SYNC] Got auth token (length: ${token?.length ?? 0})`);

    // Fetch HOS clocks (retry once on 401 with refreshed token)
    let hosClocks: HOSClockData[];
    try {
      hosClocks = await adapter.getHOSClocks(token);
    } catch (error) {
      token = await this.authErrorHandler.handleAuthError(error, {
        id: integrationId,
        vendor: integration.vendor,
        credentials: integration.credentials,
      });
      hosClocks = await adapter.getHOSClocks(token);
    }

    log.add('api_fetch', `Fetched ${hosClocks.length} HOS clocks from ${integration.vendor}`);
    this.logger.debug(
      `[HOS_SYNC] HOS clocks received: ${hosClocks.length}. Driver IDs in clocks: [${hosClocks.map((c) => c.driverId).join(', ')}]`,
    );

    const drivers = await this.prisma.driver.findMany({
      where: {
        tenantId,
        status: { in: ['PENDING_ACTIVATION', 'ACTIVE'] },
        hosManualOverride: { equals: Prisma.DbNull },
      },
    });

    log.add(
      'driver_query',
      `Found ${drivers.length} active drivers (filter: status IN [PENDING_ACTIVATION, ACTIVE], hosManualOverride=null)`,
    );

    // Log each driver's eldMetadata for debugging matching
    for (const driver of drivers) {
      const eldId = driver.eldMetadata ? (driver.eldMetadata as any).eldId : null;
      this.logger.debug(
        `[HOS_SYNC] DB driver: id=${driver.id}, driverId=${driver.driverId}, name=${driver.name}, eldId=${eldId ?? 'NOT SET'}`,
      );
    }

    // Check if drivers have ELD metadata for matching
    const driversWithEldId = drivers.filter((d) => d.eldMetadata && (d.eldMetadata as Record<string, any>).eldId);

    if (drivers.length > 0 && driversWithEldId.length === 0) {
      this.logger.warn(
        `[HOS_SYNC] 0/${drivers.length} drivers have ELD metadata — enrichment may not have run yet. ` +
          `Skipping HOS sync; the sync scheduler should run driver enrichment first.`,
      );
      log.add('enrichment_needed', `No drivers have ELD metadata — enrichment must run before HOS sync`);

      return {
        recordsProcessed: 0,
        recordsCreated: 0,
        recordsExisting: 0,
        details: { actions: log.toArray(), enrichmentNeeded: true },
      };
    }

    this.logger.log(`Syncing HOS for ${drivers.length} drivers (tenant ${tenantId})`);

    const MS_TO_HOURS = 1 / (1000 * 60 * 60);
    let updatedCount = 0;
    let matchedByEldId = 0;
    let matchedByName = 0;
    let notMatched = 0;

    const results = await Promise.allSettled(
      drivers.map(async (driver) => {
        // Match by ELD ID stored during enrichment, fall back to name match
        const eldId = driver.eldMetadata ? (driver.eldMetadata as Record<string, any>).eldId : null;

        let driverClock: (typeof hosClocks)[number] | undefined;
        let matchMethod: string | undefined;

        if (eldId) {
          driverClock = hosClocks.find((c) => c.driverId === eldId);
          if (driverClock) matchMethod = 'eld_id';
        }

        if (!driverClock) {
          driverClock = hosClocks.find((c) =>
            c.driverName?.toLowerCase().includes(driver.name?.toLowerCase().split(' ')[0] ?? ''),
          );
          if (driverClock) matchMethod = 'name';
        }

        if (!driverClock) {
          this.logger.debug(`No HOS clock match for driver ${driver.driverId} (eldId: ${eldId ?? 'not set'})`);
          notMatched++;
          log.add('driver_not_matched', `No HOS clock for ${driver.name} (${driver.driverId})`, {
            eldId,
            reason: eldId ? 'eld_id_not_in_clocks' : 'no_eld_id_and_name_not_matched',
          });
          return;
        }

        if (matchMethod === 'eld_id') matchedByEldId++;
        else matchedByName++;

        this.logger.debug(
          `[HOS_SYNC] MATCHED ${driver.name} (${driver.driverId}) by ${matchMethod} → ` +
            `Samsara driver: ${driverClock.driverName} (${driverClock.driverId}), ` +
            `status: ${driverClock.currentDutyStatus}, ` +
            `driveRemaining: ${driverClock.driveTimeRemainingMs}ms, ` +
            `shiftRemaining: ${driverClock.shiftTimeRemainingMs}ms`,
        );

        log.add('driver_matched', `${driver.name} matched by ${matchMethod}`, {
          driverId: driver.driverId,
          matchMethod,
        });

        const driveRemaining = (driverClock.driveTimeRemainingMs ?? 0) * MS_TO_HOURS;
        const shiftRemaining = (driverClock.shiftTimeRemainingMs ?? 0) * MS_TO_HOURS;
        const cycleRemaining = (driverClock.cycleTimeRemainingMs ?? 0) * MS_TO_HOURS;
        const breakRemaining = (driverClock.timeUntilBreakMs ?? 0) * MS_TO_HOURS;

        await this.prisma.driver.update({
          where: { id: driver.id },
          data: {
            hosData: {
              data_source: 'samsara',
              currentDutyStatus: driverClock.currentDutyStatus,
              driveTimeRemainingMs: driverClock.driveTimeRemainingMs,
              shiftTimeRemainingMs: driverClock.shiftTimeRemainingMs,
              cycleTimeRemainingMs: driverClock.cycleTimeRemainingMs,
              timeUntilBreakMs: driverClock.timeUntilBreakMs,
              lastUpdated: driverClock.lastUpdated,
            } as any,
            hosDataSyncedAt: new Date(),
            hosDataSource: 'samsara',
            lastSyncedAt: new Date(),
            currentHoursDriven: Math.max(0, HOS_CONSTANTS.MAX_DRIVE_HOURS - driveRemaining),
            currentOnDutyTime: Math.max(0, HOS_CONSTANTS.MAX_DUTY_HOURS - shiftRemaining),
            currentHoursSinceBreak: Math.max(0, HOS_CONSTANTS.BREAK_TRIGGER_HOURS - breakRemaining),
            cycleHoursUsed: Math.max(0, HOS_CONSTANTS.MAX_CYCLE_HOURS - cycleRemaining),
          },
        });

        this.logger.debug(`[HOS_SYNC] WROTE hosData to DB for driver ${driver.driverId} (id: ${driver.id})`);

        // Write-through to Redis cache
        await this.eldDataCache.setDriverHOS(tenantId, driver.driverId, {
          driverId: driver.driverId,
          currentDutyStatus: driverClock.currentDutyStatus,
          driveTimeRemainingMs: driverClock.driveTimeRemainingMs,
          shiftTimeRemainingMs: driverClock.shiftTimeRemainingMs,
          cycleTimeRemainingMs: driverClock.cycleTimeRemainingMs,
          timeUntilBreakMs: driverClock.timeUntilBreakMs,
          dataSource: 'samsara',
          lastUpdated: driverClock.lastUpdated,
          syncedAt: new Date().toISOString(),
        });

        updatedCount++;
      }),
    );

    const failed = results.filter((r) => r.status === 'rejected').length;

    // Log failed drivers
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        const driver = drivers[i];
        log.add('driver_update_failed', `Failed to update HOS for ${driver.name} (${driver.driverId})`, {
          driverId: driver.driverId,
          error: r.reason?.message ?? String(r.reason),
        });
      }
    });

    if (failed > 0) {
      this.logger.warn(`HOS sync for tenant ${tenantId}: ${updatedCount} updated, ${failed} failed`);

      // Alert on repeated failures
      await this.alertOnRepeatedFailures(tenantId, 'hos');
    } else {
      this.logger.log(`HOS sync complete for tenant ${tenantId}: ${updatedCount} updated`);
    }

    log.add(
      'summary',
      `HOS sync: ${updatedCount} updated, ${notMatched} no match, ${failed} failed (${matchedByEldId} by ELD ID, ${matchedByName} by name)`,
    );

    return {
      recordsProcessed: drivers.length,
      recordsCreated: 0,
      recordsExisting: updatedCount,
      details: { actions: log.toArray() },
    };
  }

  /**
   * Alert dispatchers if a sync type has failed 3+ times in the last hour.
   */
  private async alertOnRepeatedFailures(tenantId: number, syncType: string): Promise<void> {
    try {
      const since = new Date(Date.now() - 60 * 60 * 1000);
      const recentFailures = await this.prisma.job.count({
        where: {
          tenantId,
          category: 'telemetry',
          type: syncType,
          status: 'FAILED',
          createdAt: { gte: since },
        },
      });

      if (recentFailures >= 3) {
        await this.alertService.sendAlert(
          {
            title: 'Integration Sync Failing',
            message: `${syncType.toUpperCase()} sync has failed ${recentFailures} times in the last hour. Please check your integration configuration.`,
            severity: AlertSeverity.ERROR,
            context: {
              tenantId,
              syncType,
              failureCount: recentFailures,
              timestamp: new Date().toISOString(),
            },
          },
          tenantId,
        );
      }
    } catch (error) {
      this.logger.error(`Failed to send alert: ${(error as Error).message}`);
    }
  }
}

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { VehicleMatcher } from './matching/vehicle-matcher';
import { DriverMatcher } from './matching/driver-matcher';
import { TrailerMatcher } from './matching/trailer-matcher';
import { VehicleMerger } from './merging/vehicle-merger';
import { DriverMerger } from './merging/driver-merger';
import { TrailerMerger } from './merging/trailer-merger';
import { AuthTokenService } from '../oauth/auth-token.service';
import { AdapterFactoryService } from '../adapters/adapter-factory.service';
import { ELDTrailerData } from '../adapters/eld/eld-adapter.interface';
import { SyncActionLog } from '../../../infrastructure/sync/sync-action-log';
import { generateId } from '../../../shared/utils/id-generator';
import { EldAuthErrorHandler } from './eld-auth-error-handler.service';
import type { EldSyncResult } from './eld-sync.service';

/**
 * Fleet entity sync (vehicles, trailers, drivers) from ELD.
 *
 * Extracted from ELDSyncService as a pure mechanical facade split.
 * Every method body is byte-for-byte identical to the original.
 */
@Injectable()
export class FleetSyncService {
  private readonly logger = new Logger(FleetSyncService.name);

  constructor(
    private prisma: PrismaService,
    private vehicleMatcher: VehicleMatcher,
    private driverMatcher: DriverMatcher,
    private trailerMatcher: TrailerMatcher,
    private vehicleMerger: VehicleMerger,
    private driverMerger: DriverMerger,
    private trailerMerger: TrailerMerger,
    private authTokenService: AuthTokenService,
    private adapterFactory: AdapterFactoryService,
    private authErrorHandler: EldAuthErrorHandler,
  ) {}

  async syncVehicles(integrationId: number): Promise<EldSyncResult> {
    this.logger.log(`Starting ELD vehicle sync for integration: ${integrationId}`);
    const log = new SyncActionLog();

    const integration = await this.prisma.integrationConfig.findUnique({
      where: { id: integrationId },
    });

    if (!integration) {
      throw new NotFoundException('Integration not found');
    }

    const { tenantId, vendor } = integration;

    // Get adapter from factory
    const adapter = this.adapterFactory.getELDAdapter(vendor);
    if (!adapter) {
      throw new BadRequestException('No adapter available for this ELD vendor');
    }

    // Get token (supports both OAuth and API token integrations)
    let token = await this.authTokenService.getActiveToken(integration);

    // Fetch vehicles from ELD using adapter (retry once on 401 with refreshed token)
    let eldVehicles;
    try {
      eldVehicles = await adapter.getVehicles(token);
    } catch (error) {
      token = await this.authErrorHandler.handleAuthError(error, integration);
      eldVehicles = await adapter.getVehicles(token);
    }

    log.add('eld_fetch', `Fetched ${eldVehicles.length} vehicles from ELD (${vendor})`);

    let createdCount = 0;
    let enrichedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const unmatchedItems: EldSyncResult['unmatchedItems'] = [];

    // Match and merge each ELD vehicle
    for (const eldVehicle of eldVehicles) {
      try {
        // Try direct match by external ID first (fastest, indexed)
        let dbVehicle = await this.prisma.vehicle.findFirst({
          where: { tenantId, externalVehicleId: eldVehicle.id },
        });

        // Fallback to VIN/license plate matching
        if (!dbVehicle) {
          dbVehicle = await this.vehicleMatcher.match(tenantId, {
            vin: eldVehicle.vin,
            licensePlate: eldVehicle.licensePlate,
          });
        }

        if (dbVehicle) {
          // Enrich existing vehicle with ELD metadata
          const mergedData = this.vehicleMerger.merge(dbVehicle, {
            eldVendor: vendor,
            eldId: eldVehicle.id,
            serial: eldVehicle.serial,
            gateway: eldVehicle.gateway,
            esn: eldVehicle.esn,
            cameraSerial: eldVehicle.cameraSerial,
          });

          const enrichUpdateData: Record<string, any> = {
            eldTelematicsMetadata: mergedData.eldTelematicsMetadata,
          };

          // Backfill make/model/year from ELD if missing in DB
          const enrichedYear = eldVehicle.year ? parseInt(String(eldVehicle.year), 10) : null;
          if (!dbVehicle.make && eldVehicle.make) enrichUpdateData.make = eldVehicle.make;
          if (!dbVehicle.model && eldVehicle.model) enrichUpdateData.model = eldVehicle.model;
          if (!dbVehicle.year && enrichedYear != null && !Number.isNaN(enrichedYear))
            enrichUpdateData.year = enrichedYear;

          await this.prisma.vehicle.update({
            where: { id: dbVehicle.id },
            data: enrichUpdateData,
          });

          enrichedCount++;
          log.add('vehicle_enriched', `Enriched ${eldVehicle.vin || eldVehicle.id} → DB vehicle ${dbVehicle.id}`, {
            eldId: eldVehicle.id,
            dbVehicleId: dbVehicle.id,
          });
        } else {
          // No match found — CREATE vehicle from ELD data (ELD is source of truth)
          if (!eldVehicle.vin) {
            this.logger.warn(`Skipping ELD vehicle ${eldVehicle.id} — no VIN available for creation`);
            skippedCount++;
            unmatchedItems.push({
              id: eldVehicle.id,
              name: eldVehicle.id,
              matchField: `No VIN — cannot create`,
            });
            log.add('vehicle_skipped', `Skipped ${eldVehicle.id} — no VIN for creation`, { eldId: eldVehicle.id });
            continue;
          }

          const vehicleId = generateId('veh');
          const parsedYear = eldVehicle.year ? parseInt(String(eldVehicle.year), 10) : null;
          const eldTelematicsMetadata = {
            eldId: eldVehicle.id,
            eldVendor: vendor,
            serial: eldVehicle.serial,
            gateway: eldVehicle.gateway,
            esn: eldVehicle.esn,
            cameraSerial: eldVehicle.cameraSerial || null,
            lastSyncAt: new Date().toISOString(),
          };

          await this.prisma.vehicle.create({
            data: {
              vehicleId,
              unitNumber: eldVehicle.name || eldVehicle.vin?.slice(-6) || `ELD-${eldVehicle.id}`,
              vin: eldVehicle.vin,
              licensePlate: eldVehicle.licensePlate,
              make: eldVehicle.make || null,
              model: eldVehicle.model || null,
              year: Number.isNaN(parsedYear) ? null : parsedYear,
              fuelCapacityGallons: 150,
              equipmentType: 'DRY_VAN',
              tenantId,
              externalSource: vendor,
              externalVehicleId: eldVehicle.id,
              lastSyncedAt: new Date(),
              eldTelematicsMetadata,
            },
          });

          this.logger.warn(
            `Vehicle ${eldVehicle.name || eldVehicle.vin} created with default equipment (DRY_VAN) and fuel capacity (150 gal) — update via TMS enrichment or manual edit`,
          );

          createdCount++;
          log.add('vehicle_created', `Created vehicle ${vehicleId} from ELD (VIN: ${eldVehicle.vin})`, {
            eldId: eldVehicle.id,
            vehicleId,
            vin: eldVehicle.vin,
          });
        }
      } catch (error) {
        errorCount++;
        this.logger.error(`Failed to sync ELD vehicle ${eldVehicle.id}: ${(error as Error).message}`);
        log.add('vehicle_error', `Error syncing ${eldVehicle.vin || eldVehicle.id}: ${(error as Error).message}`, {
          eldId: eldVehicle.id,
        });
      }
    }

    // Link vehicles to drivers via staticAssignedDriverId (don't overwrite existing assignments)
    for (const eldVehicle of eldVehicles) {
      if (!eldVehicle.staticAssignedDriverId) continue;
      try {
        const vehicle = await this.prisma.vehicle.findFirst({
          where: { tenantId, externalVehicleId: eldVehicle.id },
          select: { id: true, vehicleId: true, assignedDriverId: true },
        });
        if (!vehicle || vehicle.assignedDriverId) continue; // already assigned, don't overwrite

        const driver = await this.prisma.driver.findFirst({
          where: {
            tenantId,
            externalDriverId: eldVehicle.staticAssignedDriverId,
          },
          select: { id: true, driverId: true },
        });
        if (!driver) continue;

        await this.prisma.vehicle.update({
          where: { id: vehicle.id },
          data: { assignedDriverId: driver.id },
        });
        log.add(
          'vehicle_driver_linked',
          `Linked vehicle ${vehicle.vehicleId} → driver ${driver.driverId} via staticAssignedDriver`,
          { vehicleId: vehicle.vehicleId, driverId: driver.driverId },
        );
      } catch (error) {
        this.logger.warn(
          `Failed to link vehicle ${eldVehicle.id} to driver ${eldVehicle.staticAssignedDriverId}: ${(error as Error).message}`,
        );
      }
    }

    await this.prisma.integrationConfig.update({
      where: { id: integrationId },
      data: { lastSyncAt: new Date() },
    });

    log.add(
      'summary',
      `${createdCount} created, ${enrichedCount} enriched, ${skippedCount} skipped, ${errorCount} errors out of ${eldVehicles.length} fetched`,
    );
    this.logger.log(
      `ELD vehicle sync complete (${vendor}): ${createdCount} created, ${enrichedCount} enriched, ${skippedCount} skipped, ${errorCount} errors`,
    );

    return {
      total: eldVehicles.length,
      created: createdCount,
      enriched: enrichedCount,
      skipped: skippedCount,
      errors: errorCount,
      unmatchedItems,
      actions: log.toArray(),
    };
  }

  async syncTrailers(integrationId: number): Promise<EldSyncResult> {
    this.logger.log(`Starting ELD trailer sync for integration: ${integrationId}`);
    const log = new SyncActionLog();

    const integration = await this.prisma.integrationConfig.findUnique({
      where: { id: integrationId },
    });

    if (!integration) {
      throw new NotFoundException('Integration not found');
    }

    const { tenantId, vendor } = integration;

    // Get adapter from factory
    const adapter = this.adapterFactory.getELDAdapter(vendor);
    if (!adapter) {
      throw new BadRequestException('No adapter available for this ELD vendor');
    }

    // Check if adapter supports trailer sync (optional method)
    if (!adapter.getTrailers) {
      this.logger.debug(`[TRAILERS] Adapter ${vendor} does not support trailer sync`);
      return {
        total: 0,
        created: 0,
        enriched: 0,
        skipped: 0,
        errors: 0,
        unmatchedItems: [],
        actions: [],
      };
    }

    // Get token (supports both OAuth and API token integrations)
    let token = await this.authTokenService.getActiveToken(integration);

    // Fetch trailers from ELD using adapter (retry once on 401 with refreshed token)
    let eldTrailers: ELDTrailerData[];
    try {
      eldTrailers = await adapter.getTrailers(token);
    } catch (error) {
      token = await this.authErrorHandler.handleAuthError(error, integration);
      eldTrailers = await adapter.getTrailers(token);
    }

    log.add('eld_fetch', `Fetched ${eldTrailers.length} trailers from ELD (${vendor})`);

    let createdCount = 0;
    let enrichedCount = 0;
    const skippedCount = 0;
    let errorCount = 0;
    const unmatchedItems: EldSyncResult['unmatchedItems'] = [];

    // Match and merge each ELD trailer
    for (const eldTrailer of eldTrailers) {
      try {
        // Try direct match by external ID first (fastest, indexed)
        let dbTrailer = await this.trailerMatcher.matchByExternalId(tenantId, eldTrailer.id);

        // Fallback to VIN/serial and license plate matching
        if (!dbTrailer) {
          dbTrailer = await this.trailerMatcher.match(tenantId, {
            serialNumber: eldTrailer.serialNumber,
            licensePlate: eldTrailer.licensePlate,
          });
        }

        if (dbTrailer) {
          // Enrich existing trailer with ELD metadata
          const mergedData = this.trailerMerger.merge(dbTrailer, eldTrailer);

          const enrichUpdateData: Record<string, any> = {
            eldTelematicsMetadata: mergedData.eldTelematicsMetadata,
            externalTrailerId: eldTrailer.id,
            externalSource: vendor,
            lastSyncedAt: new Date(),
          };

          // Backfill make/model/year from ELD if missing in DB
          const enrichedYear = eldTrailer.year ? parseInt(String(eldTrailer.year), 10) : null;
          if (!dbTrailer.make && eldTrailer.make) enrichUpdateData.make = eldTrailer.make;
          if (!dbTrailer.model && eldTrailer.model) enrichUpdateData.model = eldTrailer.model;
          if (!dbTrailer.year && enrichedYear != null && !Number.isNaN(enrichedYear))
            enrichUpdateData.year = enrichedYear;
          if (!dbTrailer.vin && eldTrailer.serialNumber) enrichUpdateData.vin = eldTrailer.serialNumber;
          if (!dbTrailer.licensePlate && eldTrailer.licensePlate)
            enrichUpdateData.licensePlate = eldTrailer.licensePlate;

          await this.prisma.trailer.update({
            where: { id: dbTrailer.id },
            data: enrichUpdateData,
          });

          enrichedCount++;
          log.add('trailer_enriched', `Enriched ${eldTrailer.name || eldTrailer.id} → DB trailer ${dbTrailer.id}`, {
            eldId: eldTrailer.id,
            dbTrailerId: dbTrailer.id,
          });
        } else {
          // No match found — CREATE trailer from ELD data (ELD is source of truth)
          const trailerId = generateId('trl');
          const parsedYear = eldTrailer.year ? parseInt(String(eldTrailer.year), 10) : null;
          const eldTelematicsMetadata = {
            eldId: eldTrailer.id,
            eldVendor: vendor,
            lastSyncAt: new Date().toISOString(),
          };

          await this.prisma.trailer.create({
            data: {
              trailerId,
              unitNumber: eldTrailer.name || `ELD-${eldTrailer.id}`,
              vin: eldTrailer.serialNumber || null,
              licensePlate: eldTrailer.licensePlate || null,
              make: eldTrailer.make || null,
              model: eldTrailer.model || null,
              year: Number.isNaN(parsedYear) ? null : parsedYear,
              equipmentType: 'DRY_VAN',
              tenantId,
              externalSource: vendor,
              externalTrailerId: eldTrailer.id,
              lastSyncedAt: new Date(),
              eldTelematicsMetadata,
            },
          });

          this.logger.warn(
            `Trailer ${eldTrailer.name || eldTrailer.id} created with default equipment (DRY_VAN) — update via TMS enrichment or manual edit`,
          );

          createdCount++;
          log.add(
            'trailer_created',
            `Created trailer ${trailerId} from ELD (name: ${eldTrailer.name || eldTrailer.id})`,
            {
              eldId: eldTrailer.id,
              trailerId,
            },
          );
        }
      } catch (error) {
        errorCount++;
        this.logger.error(`Failed to sync ELD trailer ${eldTrailer.id}: ${(error as Error).message}`);
        log.add('trailer_error', `Error syncing ${eldTrailer.name || eldTrailer.id}: ${(error as Error).message}`, {
          eldId: eldTrailer.id,
        });
      }
    }

    await this.prisma.integrationConfig.update({
      where: { id: integrationId },
      data: { lastSyncAt: new Date() },
    });

    log.add(
      'summary',
      `${createdCount} created, ${enrichedCount} enriched, ${skippedCount} skipped, ${errorCount} errors out of ${eldTrailers.length} fetched`,
    );
    this.logger.log(
      `ELD trailer sync complete (${vendor}): ${createdCount} created, ${enrichedCount} enriched, ${skippedCount} skipped, ${errorCount} errors`,
    );

    return {
      total: eldTrailers.length,
      created: createdCount,
      enriched: enrichedCount,
      skipped: skippedCount,
      errors: errorCount,
      unmatchedItems,
      actions: log.toArray(),
    };
  }

  async syncDrivers(integrationId: number): Promise<EldSyncResult> {
    this.logger.log(`Starting ELD driver sync for integration: ${integrationId}`);
    const log = new SyncActionLog();

    const integration = await this.prisma.integrationConfig.findUnique({
      where: { id: integrationId },
    });

    if (!integration) {
      throw new NotFoundException('Integration not found');
    }

    const { tenantId, vendor } = integration;

    // Get adapter from factory
    const adapter = this.adapterFactory.getELDAdapter(vendor);
    if (!adapter) {
      throw new BadRequestException('No adapter available for this ELD vendor');
    }

    // Get token (supports both OAuth and API token integrations)
    let token = await this.authTokenService.getActiveToken(integration);

    // Fetch drivers from ELD using adapter (retry once on 401 with refreshed token)
    let eldDrivers;
    try {
      eldDrivers = await adapter.getDrivers(token);
    } catch (error) {
      token = await this.authErrorHandler.handleAuthError(error, integration);
      eldDrivers = await adapter.getDrivers(token);
    }

    log.add('eld_fetch', `Fetched ${eldDrivers.length} drivers from ELD (${vendor})`);

    let createdCount = 0;
    let enrichedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const unmatchedItems: EldSyncResult['unmatchedItems'] = [];

    for (const eldDriver of eldDrivers) {
      try {
        // Try direct match by external ID first (fastest, indexed)
        let dbDriver = await this.prisma.driver.findFirst({
          where: { tenantId, externalDriverId: eldDriver.id },
        });

        // Fallback to phone/license matching
        if (!dbDriver) {
          dbDriver = await this.driverMatcher.match(tenantId, {
            phone: eldDriver.phone,
            licenseNumber: eldDriver.licenseNumber,
            licenseState: eldDriver.licenseState,
          });
        }

        if (dbDriver) {
          // Enrich existing driver with ELD metadata
          const mergedData = this.driverMerger.merge(dbDriver, {
            eldVendor: vendor,
            eldId: eldDriver.id,
            username: eldDriver.username,
            eldSettings: eldDriver.eldSettings,
            carrierSettings: eldDriver.carrierSettings,
            tags: eldDriver.tags,
            timezone: eldDriver.timezone,
          });

          await this.prisma.driver.update({
            where: { id: dbDriver.id },
            data: {
              eldMetadata: mergedData.eldMetadata,
            },
          });

          enrichedCount++;
          log.add('driver_enriched', `Enriched ${eldDriver.username || eldDriver.id} → DB driver ${dbDriver.id}`, {
            eldId: eldDriver.id,
            dbDriverId: dbDriver.id,
          });
        } else {
          // No match found — CREATE driver from ELD data (ELD is source of truth)
          if (!eldDriver.username) {
            this.logger.warn(`Skipping ELD driver ${eldDriver.id} — no username available for creation`);
            skippedCount++;
            unmatchedItems.push({
              id: eldDriver.id,
              name: eldDriver.id,
              matchField: `No username — cannot create`,
            });
            log.add('driver_skipped', `Skipped ${eldDriver.id} — no username for creation`, { eldId: eldDriver.id });
            continue;
          }

          const driverId = generateId('drv');
          const eldMetadata = {
            eldId: eldDriver.id,
            eldVendor: vendor,
            username: eldDriver.username,
            timezone: eldDriver.timezone,
            eldSettings: eldDriver.eldSettings,
            carrierSettings: eldDriver.carrierSettings || null,
            tags: eldDriver.tags || null,
            lastSyncAt: new Date().toISOString(),
          };

          await this.prisma.driver.create({
            data: {
              driverId,
              name: eldDriver.name || eldDriver.username,
              status: eldDriver.driverActivationStatus === 'active' ? 'ACTIVE' : 'PENDING_ACTIVATION',
              tenantId,
              phone: eldDriver.phone,
              email: null,
              licenseNumber: eldDriver.licenseNumber,
              licenseState: eldDriver.licenseState,
              externalSource: vendor,
              externalDriverId: eldDriver.id,
              lastSyncedAt: new Date(),
              eldMetadata,
            },
          });

          createdCount++;
          log.add('driver_created', `Created driver ${driverId} from ELD (${eldDriver.username})`, {
            eldId: eldDriver.id,
            driverId,
            name: eldDriver.username,
          });
        }
      } catch (error) {
        errorCount++;
        this.logger.error(`Failed to sync ELD driver ${eldDriver.id}: ${(error as Error).message}`);
        log.add('driver_error', `Error syncing ${eldDriver.username || eldDriver.id}: ${(error as Error).message}`, {
          eldId: eldDriver.id,
        });
      }
    }

    await this.prisma.integrationConfig.update({
      where: { id: integrationId },
      data: { lastSyncAt: new Date() },
    });

    log.add(
      'summary',
      `${createdCount} created, ${enrichedCount} enriched, ${skippedCount} skipped, ${errorCount} errors out of ${eldDrivers.length} fetched`,
    );
    this.logger.log(
      `ELD driver sync complete (${vendor}): ${createdCount} created, ${enrichedCount} enriched, ${skippedCount} skipped, ${errorCount} errors`,
    );

    return {
      total: eldDrivers.length,
      created: createdCount,
      enriched: enrichedCount,
      skipped: skippedCount,
      errors: errorCount,
      unmatchedItems,
      actions: log.toArray(),
    };
  }
}

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { LoadStatus } from '@prisma/client';
import { LoadStopStatusSchema } from '@sally/shared-types';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

const LOAD_STOP_STATUS = LoadStopStatusSchema.enum;
import { CredentialsService } from '../credentials/credentials.service';
import { AdapterFactoryService } from '../adapters/adapter-factory.service';
import { VENDOR_REGISTRY, getVendorCredentialFields } from '../vendor-registry';
import { SyncAction, SyncActionLog } from '../../../infrastructure/sync/sync-action-log';
import { generateId } from '../../../shared/utils/id-generator';

export interface TmsSyncResult {
  actions: SyncAction[];
  created: number;
  updated: number;
}

/**
 * TMS Sync Service — Enrichment for Vehicles/Drivers, Source of Truth for Loads
 *
 * Vehicles & Drivers: Enrichment-only. ELD creates fleet entities; TMS enriches
 * them with business data (make, model, year, etc.). If no matching record exists,
 * logs a warning and skips — does NOT create.
 *
 * Loads: TMS remains the source of truth. Creates/updates loads as before.
 *
 * Uses AdapterFactory to get the appropriate adapter for each vendor.
 */
@Injectable()
export class TmsSyncService {
  private readonly logger = new Logger(TmsSyncService.name);

  constructor(
    private prisma: PrismaService,
    private credentials: CredentialsService,
    private adapterFactory: AdapterFactoryService,
  ) {}

  /**
   * Enrich vehicles from TMS API (enrichment-only).
   * Does NOT create vehicles — ELD is source of truth for entity creation.
   * Matches by externalVehicleId or VIN, then updates with TMS business data.
   */
  async syncVehicles(integrationId: number): Promise<TmsSyncResult> {
    this.logger.log(`Starting TMS vehicle enrichment for integration: ${integrationId}`);
    const log = new SyncActionLog();

    const integration = await this.prisma.integrationConfig.findUnique({
      where: { id: integrationId },
    });

    if (!integration) {
      throw new NotFoundException('Integration not found');
    }

    const { tenantId, vendor } = integration;

    // Get adapter from factory
    const adapter = this.adapterFactory.getTMSAdapter(vendor);
    if (!adapter) {
      throw new BadRequestException('No adapter available for this TMS vendor');
    }

    // Get credentials (dynamic based on vendor's credential fields)
    const credentials = this.getVendorCredentials(integration.credentials, vendor);

    // Fetch vehicles from TMS using adapter
    const tmsVehicles = await adapter.getVehicles(credentials.primary, credentials.secondary);

    log.add('tms_fetch', `Fetched ${tmsVehicles.length} vehicles from ${vendor}`);

    let updated = 0;
    let skipped = 0;

    // Enrich each vehicle (no creation)
    for (const tmsVehicle of tmsVehicles) {
      // Try matching by externalVehicleId first, fall back to VIN match
      const existingByExternal = tmsVehicle.vehicle_id
        ? await this.prisma.vehicle.findUnique({
            where: {
              externalVehicleId_tenantId: {
                externalVehicleId: tmsVehicle.vehicle_id,
                tenantId,
              },
            },
          })
        : null;

      const existingByVin =
        !existingByExternal && tmsVehicle.vin
          ? await this.prisma.vehicle.findUnique({
              where: { vin_tenantId: { vin: tmsVehicle.vin, tenantId } },
            })
          : null;

      const existing = existingByExternal || existingByVin;

      if (existing) {
        await this.prisma.vehicle.update({
          where: { id: existing.id },
          data: {
            externalVehicleId: tmsVehicle.vehicle_id,
            make: tmsVehicle.make,
            model: tmsVehicle.model,
            year: tmsVehicle.year,
            unitNumber: tmsVehicle.unit_number || (existing as any).unitNumber,
            licensePlate: tmsVehicle.license_plate || (existing as any).licensePlate,
            lastSyncedAt: new Date(),
          },
        });
        updated++;
        const matchMethod = existingByExternal ? 'external_id' : 'vin_fallback';
        log.add('vehicle_enriched', `Enriched ${tmsVehicle.vehicle_id} (${tmsVehicle.vin ?? 'no VIN'})`, {
          vehicleId: tmsVehicle.vehicle_id,
          matchMethod,
        });
      } else {
        // No matching vehicle — skip creation (ELD is source of truth)
        this.logger.warn(
          `TMS vehicle ${tmsVehicle.vehicle_id} (VIN: ${tmsVehicle.vin ?? 'none'}) has no matching record. ` +
            `Skipping — ELD is source of truth for vehicle creation.`,
        );
        skipped++;
        log.add(
          'vehicle_skipped',
          `No match for TMS vehicle ${tmsVehicle.vehicle_id} — skipped (ELD creates vehicles)`,
          {
            vehicleId: tmsVehicle.vehicle_id,
            vin: tmsVehicle.vin,
          },
        );
      }
    }

    await this.prisma.integrationConfig.update({
      where: { id: integrationId },
      data: { lastSyncAt: new Date() },
    });

    log.add('summary', `${updated} enriched, ${skipped} skipped out of ${tmsVehicles.length} fetched`);
    this.logger.log(`TMS vehicle enrichment complete (${vendor}): ${updated} enriched, ${skipped} skipped`);

    return { actions: log.toArray(), created: 0, updated };
  }

  /**
   * Enrich drivers from TMS API (enrichment-only).
   * Does NOT create drivers — ELD is source of truth for entity creation.
   * Matches by driverId, phone, or license, then updates with TMS business data.
   */
  async syncDrivers(integrationId: number): Promise<TmsSyncResult> {
    this.logger.log(`Starting TMS driver enrichment for integration: ${integrationId}`);
    const log = new SyncActionLog();

    const integration = await this.prisma.integrationConfig.findUnique({
      where: { id: integrationId },
    });

    if (!integration) {
      throw new NotFoundException('Integration not found');
    }

    const { tenantId, vendor } = integration;

    // Get adapter from factory
    const adapter = this.adapterFactory.getTMSAdapter(vendor);
    if (!adapter) {
      throw new BadRequestException('No adapter available for this TMS vendor');
    }

    // Get credentials
    const credentials = this.getVendorCredentials(integration.credentials, vendor);

    // Fetch drivers from TMS using adapter
    const tmsDrivers = await adapter.getDrivers(credentials.primary, credentials.secondary);

    log.add('tms_fetch', `Fetched ${tmsDrivers.length} drivers from ${vendor}`);

    let updated = 0;
    let skipped = 0;

    // Enrich each driver (no creation)
    for (const tmsDriver of tmsDrivers) {
      const driverName = `${tmsDriver.first_name} ${tmsDriver.last_name}`;

      // Try matching by driverId first
      let existing = tmsDriver.driver_id
        ? await this.prisma.driver.findUnique({
            where: {
              driverId_tenantId: {
                driverId: tmsDriver.driver_id,
                tenantId,
              },
            },
          })
        : null;

      // Fall back to phone match if no driverId match
      if (!existing && tmsDriver.phone) {
        existing = await this.prisma.driver.findFirst({
          where: { tenantId, phone: tmsDriver.phone },
        });
      }

      // Fall back to license match
      if (!existing && tmsDriver.license_number) {
        existing = await this.prisma.driver.findFirst({
          where: {
            tenantId,
            licenseNumber: tmsDriver.license_number,
            licenseState: tmsDriver.license_state,
          },
        });
      }

      if (existing) {
        await this.prisma.driver.update({
          where: { id: existing.id },
          data: {
            name: driverName,
            phone: tmsDriver.phone || existing.phone,
            email: tmsDriver.email || existing.email,
            licenseNumber: tmsDriver.license_number || existing.licenseNumber,
            licenseState: tmsDriver.license_state || existing.licenseState,
            externalDriverId: tmsDriver.driver_id,
            lastSyncedAt: new Date(),
          },
        });
        updated++;
        log.add('driver_enriched', `Enriched ${driverName} (${tmsDriver.driver_id})`, {
          driverId: tmsDriver.driver_id,
        });
      } else {
        // No matching driver — skip creation (ELD is source of truth)
        this.logger.warn(
          `TMS driver ${tmsDriver.driver_id} (${driverName}) has no matching record. ` +
            `Skipping — ELD is source of truth for driver creation.`,
        );
        skipped++;
        log.add(
          'driver_skipped',
          `No match for TMS driver ${driverName} (${tmsDriver.driver_id}) — skipped (ELD creates drivers)`,
          {
            driverId: tmsDriver.driver_id,
          },
        );
      }
    }

    await this.prisma.integrationConfig.update({
      where: { id: integrationId },
      data: { lastSyncAt: new Date() },
    });

    log.add('summary', `${updated} enriched, ${skipped} skipped out of ${tmsDrivers.length} fetched`);
    this.logger.log(`TMS driver enrichment complete (${vendor}): ${updated} enriched, ${skipped} skipped`);

    return { actions: log.toArray(), created: 0, updated };
  }

  /**
   * Sync loads from TMS API
   */
  async syncLoads(integrationId: number): Promise<TmsSyncResult> {
    this.logger.log(`Starting TMS load sync for integration: ${integrationId}`);
    const log = new SyncActionLog();

    const integration = await this.prisma.integrationConfig.findUnique({
      where: { id: integrationId },
    });

    if (!integration) {
      throw new NotFoundException('Integration not found');
    }

    const { tenantId, vendor } = integration;

    // Get adapter from factory
    const adapter = this.adapterFactory.getTMSAdapter(vendor);
    if (!adapter) {
      throw new BadRequestException('No adapter available for this TMS vendor');
    }

    // Get credentials
    const credentials = this.getVendorCredentials(integration.credentials, vendor);

    // Fetch loads from TMS using adapter
    const tmsLoads = await adapter.getActiveLoads(credentials.primary, credentials.secondary);

    log.add('tms_fetch', `Fetched ${tmsLoads.length} loads from ${vendor}`);

    let created = 0;
    let updated = 0;
    let stopsCreated = 0;
    let stopsExisting = 0;

    // Upsert each load
    for (const tmsLoad of tmsLoads) {
      // Find or create stops from TMS load data
      const stopIds: number[] = [];

      // Process all stops if available
      if (tmsLoad.stops && tmsLoad.stops.length > 0) {
        for (const tmsStop of tmsLoad.stops) {
          const { stop, isNew } = await this.findOrCreateStop(
            tmsStop.address,
            tmsStop.city,
            tmsStop.state,
            tmsStop.zip,
            tmsStop.latitude,
            tmsStop.longitude,
          );
          stopIds.push(stop.id);
          if (isNew) stopsCreated++;
          else stopsExisting++;
        }
      } else {
        // Fallback to pickup/delivery locations
        const pickup = await this.findOrCreateStop(
          tmsLoad.pickup_location.address,
          tmsLoad.pickup_location.city,
          tmsLoad.pickup_location.state,
          tmsLoad.pickup_location.zip,
          tmsLoad.pickup_location.latitude,
          tmsLoad.pickup_location.longitude,
        );
        stopIds.push(pickup.stop.id);
        if (pickup.isNew) stopsCreated++;
        else stopsExisting++;

        const delivery = await this.findOrCreateStop(
          tmsLoad.delivery_location.address,
          tmsLoad.delivery_location.city,
          tmsLoad.delivery_location.state,
          tmsLoad.delivery_location.zip,
          tmsLoad.delivery_location.latitude,
          tmsLoad.delivery_location.longitude,
        );
        stopIds.push(delivery.stop.id);
        if (delivery.isNew) stopsCreated++;
        else stopsExisting++;
      }

      // Check if load already exists
      const existingLoad = await this.prisma.load.findUnique({
        where: {
          externalLoadId_tenantId: {
            externalLoadId: tmsLoad.load_id,
            tenantId,
          },
        },
      });

      // Determine mapped status
      const mappedStatus = this.mapLoadStatus(tmsLoad.status);
      const isNewlyDelivered = mappedStatus === 'DELIVERED' && (!existingLoad || existingLoad.status !== 'DELIVERED');

      // Resolve or create customer from customerName (TMS is source of truth)
      let customer: { id: number } | null = null;
      if (tmsLoad.customer_name) {
        customer = await this.prisma.customer.findFirst({
          where: { companyName: tmsLoad.customer_name, tenantId },
          select: { id: true },
        });
        if (!customer) {
          customer = await this.prisma.customer.create({
            data: {
              customerId: generateId('cust'),
              companyName: tmsLoad.customer_name,
              tenantId,
              status: 'ACTIVE',
            },
            select: { id: true },
          });
          this.logger.log(`Auto-created customer "${tmsLoad.customer_name}" from TMS sync`);
        }
      }

      // Upsert load
      const load = await this.prisma.load.upsert({
        where: {
          externalLoadId_tenantId: {
            externalLoadId: tmsLoad.load_id,
            tenantId,
          },
        },
        update: {
          loadNumber: tmsLoad.load_number,
          customerName: tmsLoad.customer_name,
          ...(customer && { customerId: customer.id }),
          weightLbs: tmsLoad.weight_lbs ?? 0,
          commodityType: tmsLoad.commodity_type ?? 'general',
          specialRequirements: tmsLoad.special_requirements || null,
          status: mappedStatus as LoadStatus,
          externalSource: vendor,
          lastSyncedAt: new Date(),
          // Set billingStatus only when transitioning to delivered (not on re-sync)
          ...(isNewlyDelivered && {
            billingStatus: 'PENDING_DOCUMENTS',
            deliveredAt: new Date(),
          }),
        },
        create: {
          loadNumber: tmsLoad.load_number,
          customerName: tmsLoad.customer_name,
          ...(customer && { customerId: customer.id }),
          weightLbs: tmsLoad.weight_lbs ?? 0,
          commodityType: tmsLoad.commodity_type ?? 'general',
          specialRequirements: tmsLoad.special_requirements || null,
          status: mappedStatus as LoadStatus,
          externalLoadId: tmsLoad.load_id,
          externalSource: vendor,
          lastSyncedAt: new Date(),
          tenantId,
          isActive: true,
          // Set billingStatus when creating as delivered
          ...(mappedStatus === 'DELIVERED' && {
            billingStatus: 'PENDING_DOCUMENTS',
            deliveredAt: new Date(),
          }),
        },
      });

      if (existingLoad) {
        updated++;
        log.add('load_updated', `Updated load ${tmsLoad.load_number}`, {
          loadNumber: tmsLoad.load_number,
        });
      } else {
        created++;
        log.add('load_created', `Created load ${tmsLoad.load_number}`, {
          loadNumber: tmsLoad.load_number,
        });
      }

      // Delete existing load_stops and recreate
      await this.prisma.loadStop.deleteMany({
        where: { loadId: load.id },
      });

      // Create new load_stops (mark as completed if load is delivered)
      const isDelivered = mappedStatus === 'DELIVERED';
      let sequence = 1;
      for (const stopId of stopIds) {
        const isPickup = sequence === 1;
        await this.prisma.loadStop.create({
          data: {
            loadId: load.id,
            stopId: stopId,
            sequenceOrder: sequence,
            actionType: isPickup ? 'pickup' : 'delivery',
            estimatedDockHours: 1.0,
            ...(isDelivered && {
              status: LOAD_STOP_STATUS.COMPLETED,
              completedAt: new Date(),
            }),
          },
        });
        sequence++;
      }
    }

    await this.prisma.integrationConfig.update({
      where: { id: integrationId },
      data: { lastSyncAt: new Date() },
    });

    log.add(
      'summary',
      `${created} loads created, ${updated} updated, ${stopsCreated} new stops, ${stopsExisting} existing stops`,
    );
    this.logger.log(`Synced ${tmsLoads.length} loads from ${vendor}`);

    return { actions: log.toArray(), created, updated };
  }

  /**
   * Find or create a stop (location) from TMS data
   */
  private async findOrCreateStop(
    address: string,
    city: string,
    state: string,
    zip: string,
    latitude: number,
    longitude: number,
  ): Promise<{ stop: { id: number }; isNew: boolean }> {
    const existing = await this.prisma.stop.findFirst({
      where: {
        address,
        city,
        state,
      },
    });

    if (existing) {
      return { stop: existing, isNew: false };
    }

    const stop = await this.prisma.stop.create({
      data: {
        stopId: `TMS-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: `${city}, ${state}`,
        address,
        city,
        state,
        lat: latitude,
        lon: longitude,
        locationType: 'WAREHOUSE',
        isActive: true,
      },
    });

    return { stop, isNew: true };
  }

  /**
   * Map TMS load status to SALLY load status
   */
  private mapLoadStatus(tmsStatus: 'UNASSIGNED' | 'ASSIGNED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED'): string {
    const statusMap: Record<string, string> = {
      UNASSIGNED: 'PENDING',
      ASSIGNED: 'ASSIGNED',
      IN_TRANSIT: 'IN_TRANSIT',
      DELIVERED: 'DELIVERED',
      CANCELLED: 'CANCELLED',
    };
    return statusMap[tmsStatus] || 'PENDING';
  }

  /**
   * Get vendor credentials in the format expected by adapters
   *
   * Dynamically extracts credentials based on vendor registry configuration.
   * The first credential field is primary, second is secondary (if exists).
   */
  private getVendorCredentials(credentials: any, vendor: string): { primary: string; secondary: string } {
    // Get vendor metadata from registry
    const vendorMeta = VENDOR_REGISTRY[vendor];
    if (!vendorMeta) {
      throw new BadRequestException('This vendor integration is not supported');
    }

    // Extract credential field names from vendor registry
    const credentialFields = getVendorCredentialFields(vendorMeta);
    if (credentialFields.length === 0) {
      throw new BadRequestException('Integration credentials are not properly configured');
    }

    const primaryField = credentialFields[0]?.name;
    const secondaryField = credentialFields[1]?.name;

    if (!primaryField) {
      throw new BadRequestException('Integration credentials are not properly configured');
    }

    return {
      primary: this.getCredentialField(credentials, primaryField),
      secondary: secondaryField ? this.getCredentialField(credentials, secondaryField) : '',
    };
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

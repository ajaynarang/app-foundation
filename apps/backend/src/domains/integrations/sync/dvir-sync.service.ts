import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { AuthTokenService } from '../oauth/auth-token.service';
import { AdapterFactoryService } from '../adapters/adapter-factory.service';
import { ELDDVIRData } from '../adapters/eld/eld-adapter.interface';
import { EldAuthErrorHandler } from './eld-auth-error-handler.service';
import type { EldSyncResult } from './eld-sync.service';

/**
 * Driver Vehicle Inspection Report (DVIR) sync from ELD.
 *
 * Extracted from ELDSyncService as a pure mechanical facade split.
 * Every method body is byte-for-byte identical to the original.
 */
@Injectable()
export class DvirSyncService {
  private readonly logger = new Logger(DvirSyncService.name);

  constructor(
    private prisma: PrismaService,
    private authTokenService: AuthTokenService,
    private adapterFactory: AdapterFactoryService,
    private authErrorHandler: EldAuthErrorHandler,
  ) {}

  async syncDVIRs(integrationId: number): Promise<EldSyncResult> {
    const integration = await this.prisma.integrationConfig.findUnique({
      where: { id: integrationId },
    });

    if (!integration) {
      throw new NotFoundException('Integration not found');
    }

    const { tenantId, vendor } = integration;
    this.logger.log(`Starting DVIR sync for tenant ${tenantId}, integration ${integrationId}`);

    const adapter = this.adapterFactory.getELDAdapter(vendor);
    if (!adapter || !adapter.getDVIRs) {
      this.logger.debug(`[DVIR] Adapter ${vendor} does not support DVIR sync`);
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

    let token = await this.authTokenService.getActiveToken(integration);

    // Fetch DVIRs from last 48 hours
    const startDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    let dvirs: ELDDVIRData[];
    try {
      dvirs = await adapter.getDVIRs(token, startDate);
    } catch (error) {
      token = await this.authErrorHandler.handleAuthError(error, integration);
      dvirs = await adapter.getDVIRs(token, startDate);
    }

    this.logger.debug(`[DVIR] Fetched ${dvirs.length} DVIRs from ${vendor}`);

    // Match vehicles by ELD ID
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        tenantId,
        status: { in: ['AVAILABLE', 'ASSIGNED'] },
      },
      select: {
        id: true,
        vehicleId: true,
        eldTelematicsMetadata: true,
        externalVehicleId: true,
      },
    });

    const eldIdToVehicle = new Map<string, { id: number; vehicleId: string }>();
    for (const v of vehicles) {
      const meta = v.eldTelematicsMetadata as any;
      if (meta?.eldId) eldIdToVehicle.set(meta.eldId, { id: v.id, vehicleId: v.vehicleId });
      // Also map by externalVehicleId for fallback
      if (v.externalVehicleId)
        eldIdToVehicle.set(v.externalVehicleId, {
          id: v.id,
          vehicleId: v.vehicleId,
        });
    }

    // Match drivers by ELD ID
    const drivers = await this.prisma.driver.findMany({
      where: {
        tenantId,
        status: { in: ['ACTIVE', 'PENDING_ACTIVATION'] },
      },
      select: {
        id: true,
        driverId: true,
        eldMetadata: true,
        externalDriverId: true,
      },
    });

    const eldIdToDriver = new Map<string, { id: number; driverId: string }>();
    for (const d of drivers) {
      const meta = d.eldMetadata as any;
      if (meta?.eldId) eldIdToDriver.set(meta.eldId, { id: d.id, driverId: d.driverId });
      // Also map by externalDriverId for fallback
      if (d.externalDriverId)
        eldIdToDriver.set(d.externalDriverId, {
          id: d.id,
          driverId: d.driverId,
        });
    }

    // Match trailers by ELD ID or name for trailer DVIR sync
    const trailers = await this.prisma.trailer.findMany({
      where: {
        tenantId,
        lifecycleStatus: { not: 'DECOMMISSIONED' },
      },
      select: {
        id: true,
        trailerId: true,
        unitNumber: true,
        eldTelematicsMetadata: true,
        externalTrailerId: true,
      },
    });

    const eldIdToTrailer = new Map<string, { id: number; trailerId: string }>();
    for (const t of trailers) {
      const meta = t.eldTelematicsMetadata as any;
      if (meta?.eldId) eldIdToTrailer.set(meta.eldId, { id: t.id, trailerId: t.trailerId });
      if (t.externalTrailerId)
        eldIdToTrailer.set(t.externalTrailerId, {
          id: t.id,
          trailerId: t.trailerId,
        });
      // Also map by unitNumber for name-based matching
      if (t.unitNumber)
        eldIdToTrailer.set(t.unitNumber, {
          id: t.id,
          trailerId: t.trailerId,
        });
    }

    let matched = 0;
    let unmatched = 0;
    const unmatchedItems: EldSyncResult['unmatchedItems'] = [];

    const results = await Promise.allSettled(
      dvirs.map(async (dvir) => {
        const vehicle = eldIdToVehicle.get(dvir.vehicleId);
        if (!vehicle) {
          unmatched++;
          unmatchedItems.push({
            id: dvir.id,
            name: dvir.vehicleName || dvir.vehicleId,
            matchField: `ELD Vehicle ID: ${dvir.vehicleId}`,
          });
          return;
        }

        const driver = dvir.driverId ? eldIdToDriver.get(dvir.driverId) : undefined;

        await this.prisma.vehicleDVIR.upsert({
          where: {
            externalDvirId_tenantId: {
              externalDvirId: dvir.id,
              tenantId,
            },
          },
          create: {
            tenantId,
            vehicleId: vehicle.id,
            externalDvirId: dvir.id,
            driverId: driver?.id,
            inspectionType: dvir.inspectionType,
            condition: dvir.condition,
            defectsCount: dvir.defects.length,
            defects: dvir.defects as any,
            mechanicSignedOff: dvir.mechanicSignedOff,
            inspectedAt: new Date(dvir.inspectedAt),
          },
          update: {
            condition: dvir.condition,
            defectsCount: dvir.defects.length,
            defects: dvir.defects as any,
            mechanicSignedOff: dvir.mechanicSignedOff,
          },
        });

        // Sync trailer DVIR if DVIR has trailer data
        if (dvir.trailerId || dvir.trailerName) {
          const trailer =
            (dvir.trailerId ? eldIdToTrailer.get(dvir.trailerId) : undefined) ||
            (dvir.trailerName ? eldIdToTrailer.get(dvir.trailerName) : undefined);

          if (trailer) {
            const trailerDefects = dvir.trailerDefects || [];
            // Determine trailer-specific condition: if trailer has defects, needs repair
            const trailerCondition = trailerDefects.length > 0 ? 'needs_repair' : dvir.condition;

            await this.prisma.trailerDVIR.upsert({
              where: {
                externalDvirId_tenantId: {
                  externalDvirId: dvir.id,
                  tenantId,
                },
              },
              create: {
                tenantId,
                trailerId: trailer.id,
                externalDvirId: dvir.id,
                driverId: driver?.id,
                inspectionType: dvir.inspectionType,
                condition: trailerCondition,
                defectsCount: trailerDefects.length,
                defects: trailerDefects as any,
                mechanicSignedOff: dvir.mechanicSignedOff,
                inspectedAt: new Date(dvir.inspectedAt),
              },
              update: {
                condition: trailerCondition,
                defectsCount: trailerDefects.length,
                defects: trailerDefects as any,
                mechanicSignedOff: dvir.mechanicSignedOff,
              },
            });
          }
        }

        matched++;
      }),
    );

    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      this.logger.warn(
        `[DVIR] Sync for tenant ${tenantId}: ${matched} matched, ${unmatched} unmatched, ${failed} failed`,
      );
    } else {
      this.logger.log(`[DVIR] Sync complete for tenant ${tenantId}: ${matched} matched, ${unmatched} unmatched`);
    }

    return {
      total: dvirs.length,
      created: matched,
      enriched: 0,
      skipped: unmatched,
      errors: failed,
      unmatchedItems,
      actions: [],
    };
  }
}

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { AdapterFactoryService } from '../adapters/adapter-factory.service';
import { AuthTokenService } from '../oauth/auth-token.service';
import { DriverMerger } from '../sync/merging/driver-merger';
import { VehicleMerger } from '../sync/merging/vehicle-merger';

export interface LinkResult {
  linked: boolean;
  eldName?: string;
  eldId?: string;
  matchMethod?: 'phone' | 'license' | 'vin' | 'license_plate' | 'manual';
  candidates?: { eldId: string; name: string; detail: string }[];
}

@Injectable()
export class EldLinkingService {
  private readonly logger = new Logger(EldLinkingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adapterFactory: AdapterFactoryService,
    private readonly authTokenService: AuthTokenService,
    private readonly driverMerger: DriverMerger,
    private readonly vehicleMerger: VehicleMerger,
  ) {}

  // ---- Driver linking ----

  async linkDriver(tenantId: number, driverDbId: number, eldId?: string): Promise<LinkResult> {
    const driver = await this.prisma.driver.findFirst({
      where: { id: driverDbId, tenantId },
    });
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    // Idempotency: if already linked and no specific eldId requested, return current link
    const existingEldMeta = driver.eldMetadata as { eldId?: string } | null;
    if (!eldId && existingEldMeta?.eldId) {
      return {
        linked: true,
        eldId: existingEldMeta.eldId,
        matchMethod: 'manual',
      };
    }

    const { adapter, token } = await this.getEldAdapterAndToken(tenantId);
    const eldDrivers = await adapter.getDrivers(token);

    if (eldId) {
      const eldDriver = eldDrivers.find((d) => d.id === eldId);
      if (!eldDriver) {
        throw new BadRequestException(`ELD driver with id ${eldId} not found in Samsara`);
      }
      await this.mergeAndUpdateDriver(driverDbId, eldDriver);
      this.logger.log(`Manually linked driver ${driverDbId} to ELD driver ${eldId}`);
      return {
        linked: true,
        eldName: eldDriver.username ?? eldDriver.id,
        eldId: eldDriver.id,
        matchMethod: 'manual',
      };
    }

    // Auto-match — try matching by phone, then license
    for (const eldDriver of eldDrivers) {
      if (eldDriver.phone && driver.phone === eldDriver.phone) {
        await this.mergeAndUpdateDriver(driverDbId, eldDriver);
        this.logger.log(`Auto-matched driver ${driverDbId} to ELD driver ${eldDriver.id} by phone`);
        return {
          linked: true,
          eldName: eldDriver.username ?? eldDriver.id,
          eldId: eldDriver.id,
          matchMethod: 'phone',
        };
      }

      if (
        eldDriver.licenseNumber &&
        eldDriver.licenseState &&
        driver.licenseNumber === eldDriver.licenseNumber &&
        driver.licenseState === eldDriver.licenseState
      ) {
        await this.mergeAndUpdateDriver(driverDbId, eldDriver);
        this.logger.log(`Auto-matched driver ${driverDbId} to ELD driver ${eldDriver.id} by license`);
        return {
          linked: true,
          eldName: eldDriver.username ?? eldDriver.id,
          eldId: eldDriver.id,
          matchMethod: 'license',
        };
      }
    }

    // No auto-match found — return top 5 candidates sorted by name similarity
    const driverName = driver.name;
    const candidates = eldDrivers
      .map((d) => ({
        eldId: d.id,
        name: d.username ?? d.id,
        detail: [d.phone, d.licenseNumber].filter(Boolean).join(' | '),
        similarity: this.nameSimilarity(driverName, d.username ?? ''),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5)
      .map(({ similarity: _similarity, ...rest }) => rest);

    return { linked: false, candidates };
  }

  async unlinkDriver(tenantId: number, driverDbId: number): Promise<void> {
    const driver = await this.prisma.driver.findFirst({
      where: { id: driverDbId, tenantId },
    });
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    await this.prisma.driver.update({
      where: { id: driverDbId },
      data: { eldMetadata: Prisma.DbNull },
    });

    this.logger.log(`Unlinked driver ${driverDbId} from ELD`);
  }

  // ---- Vehicle linking ----

  async linkVehicle(tenantId: number, vehicleDbId: number, eldId?: string): Promise<LinkResult> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleDbId, tenantId },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    // Idempotency: if already linked and no specific eldId requested, return current link
    const existingEldMeta = vehicle.eldTelematicsMetadata as {
      eldId?: string;
    } | null;
    if (!eldId && existingEldMeta?.eldId) {
      return {
        linked: true,
        eldId: existingEldMeta.eldId,
        matchMethod: 'manual',
      };
    }

    const { adapter, token } = await this.getEldAdapterAndToken(tenantId);
    const eldVehicles = await adapter.getVehicles(token);

    if (eldId) {
      const eldVehicle = eldVehicles.find((v) => v.id === eldId);
      if (!eldVehicle) {
        throw new BadRequestException(`ELD vehicle with id ${eldId} not found in Samsara`);
      }
      await this.mergeAndUpdateVehicle(vehicleDbId, eldVehicle);
      this.logger.log(`Manually linked vehicle ${vehicleDbId} to ELD vehicle ${eldId}`);
      return {
        linked: true,
        eldName: eldVehicle.vin ?? eldVehicle.id,
        eldId: eldVehicle.id,
        matchMethod: 'manual',
      };
    }

    // Auto-match — try matching by VIN, then license plate
    for (const eldVehicle of eldVehicles) {
      if (eldVehicle.vin && vehicle.vin === eldVehicle.vin) {
        await this.mergeAndUpdateVehicle(vehicleDbId, eldVehicle);
        this.logger.log(`Auto-matched vehicle ${vehicleDbId} to ELD vehicle ${eldVehicle.id} by VIN`);
        return {
          linked: true,
          eldName: eldVehicle.vin ?? eldVehicle.id,
          eldId: eldVehicle.id,
          matchMethod: 'vin',
        };
      }

      if (eldVehicle.licensePlate && vehicle.licensePlate === eldVehicle.licensePlate) {
        await this.mergeAndUpdateVehicle(vehicleDbId, eldVehicle);
        this.logger.log(`Auto-matched vehicle ${vehicleDbId} to ELD vehicle ${eldVehicle.id} by license plate`);
        return {
          linked: true,
          eldName: eldVehicle.licensePlate ?? eldVehicle.id,
          eldId: eldVehicle.id,
          matchMethod: 'license_plate',
        };
      }
    }

    // No auto-match found — return top 5 candidates sorted by name similarity
    const vehicleName = vehicle.unitNumber ?? vehicle.vin ?? `${vehicle.make ?? ''} ${vehicle.model ?? ''}`.trim();
    const candidates = eldVehicles
      .map((v) => ({
        eldId: v.id,
        name: v.vin ?? v.id,
        detail: [v.licensePlate, v.serial].filter(Boolean).join(' | '),
        similarity: this.nameSimilarity(vehicleName, v.vin ?? v.licensePlate ?? ''),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5)
      .map(({ similarity: _similarity, ...rest }) => rest);

    return { linked: false, candidates };
  }

  async unlinkVehicle(tenantId: number, vehicleDbId: number): Promise<void> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleDbId, tenantId },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    await this.prisma.vehicle.update({
      where: { id: vehicleDbId },
      data: { eldTelematicsMetadata: Prisma.DbNull },
    });

    this.logger.log(`Unlinked vehicle ${vehicleDbId} from ELD`);
  }

  // ---- ELD entity listing (for manual picker) ----

  async listEldDrivers(tenantId: number): Promise<{ eldId: string; name: string; detail: string }[]> {
    const { adapter, token } = await this.getEldAdapterAndToken(tenantId);
    const eldDrivers = await adapter.getDrivers(token);

    return eldDrivers.map((d) => ({
      eldId: d.id,
      name: d.username ?? d.id,
      detail: [d.phone, d.licenseNumber].filter(Boolean).join(' | '),
    }));
  }

  async listEldVehicles(tenantId: number): Promise<{ eldId: string; name: string; detail: string }[]> {
    const { adapter, token } = await this.getEldAdapterAndToken(tenantId);
    const eldVehicles = await adapter.getVehicles(token);

    return eldVehicles.map((v) => ({
      eldId: v.id,
      name: v.vin ?? v.id,
      detail: [v.licensePlate, v.serial].filter(Boolean).join(' | '),
    }));
  }

  // ---- Private helpers ----

  private async mergeAndUpdateDriver(driverDbId: number, eldDriver: any): Promise<void> {
    const merged = this.driverMerger.merge(
      {},
      {
        eldVendor: 'SAMSARA_ELD',
        eldId: eldDriver.id,
        name: eldDriver.username,
        username: eldDriver.username,
        phone: eldDriver.phone,
        licenseNumber: eldDriver.licenseNumber,
        licenseState: eldDriver.licenseState,
        eldSettings: eldDriver.eldSettings,
        timezone: eldDriver.timezone,
      },
    );

    await this.prisma.driver.update({
      where: { id: driverDbId },
      data: { eldMetadata: merged.eldMetadata },
    });
  }

  private async mergeAndUpdateVehicle(vehicleDbId: number, eldVehicle: any): Promise<void> {
    const merged = this.vehicleMerger.merge(
      {},
      {
        eldVendor: 'SAMSARA_ELD',
        eldId: eldVehicle.id,
        vin: eldVehicle.vin,
        licensePlate: eldVehicle.licensePlate,
        serial: eldVehicle.serial,
        gateway: eldVehicle.gateway,
        esn: eldVehicle.esn,
      },
    );

    await this.prisma.vehicle.update({
      where: { id: vehicleDbId },
      data: { eldTelematicsMetadata: merged.eldTelematicsMetadata },
    });
  }

  private async getEldAdapterAndToken(tenantId: number) {
    const integration = await this.prisma.integrationConfig.findFirst({
      where: {
        tenantId,
        integrationType: 'ELD',
        isEnabled: true,
        status: { in: ['ACTIVE', 'CONFIGURED'] },
      },
    });

    if (!integration) {
      throw new NotFoundException('No active ELD integration found');
    }

    const adapter = this.adapterFactory.getELDAdapter(integration.vendor);
    if (!adapter) {
      throw new BadRequestException(`No ELD adapter available for vendor: ${integration.vendor}`);
    }

    const token = await this.authTokenService.getActiveToken(integration);

    return { adapter, token };
  }

  /**
   * Simple name similarity score (0-1) based on common prefix length.
   * Used for sorting candidates when auto-match fails.
   */
  private nameSimilarity(a: string, b: string): number {
    const al = a.toLowerCase().trim();
    const bl = b.toLowerCase().trim();
    if (!al || !bl) return 0;

    const maxLen = Math.max(al.length, bl.length);
    let commonPrefix = 0;
    for (let i = 0; i < Math.min(al.length, bl.length); i++) {
      if (al[i] === bl[i]) {
        commonPrefix++;
      } else {
        break;
      }
    }

    return commonPrefix / maxLen;
  }
}

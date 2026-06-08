import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { Trailer } from '@prisma/client';

@Injectable()
export class TrailerMatcher {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Match trailer by external ELD ID (fastest, indexed)
   */
  async matchByExternalId(tenantId: number, externalTrailerId: string): Promise<Trailer | null> {
    return this.prisma.trailer.findFirst({
      where: {
        tenantId,
        externalTrailerId,
        lifecycleStatus: { not: 'DECOMMISSIONED' },
      },
    });
  }

  /**
   * Match trailer by VIN/serial number
   */
  async matchByVin(tenantId: number, vin: string): Promise<Trailer | null> {
    if (!vin) return null;
    return this.prisma.trailer.findFirst({
      where: {
        tenantId,
        vin,
        lifecycleStatus: { not: 'DECOMMISSIONED' },
      },
    });
  }

  /**
   * Match trailer by license plate (fallback)
   */
  async matchByLicensePlate(tenantId: number, licensePlate: string): Promise<Trailer | null> {
    if (!licensePlate) return null;
    return this.prisma.trailer.findFirst({
      where: {
        tenantId,
        licensePlate,
        lifecycleStatus: { not: 'DECOMMISSIONED' },
      },
    });
  }

  /**
   * Match trailer with fallback strategy: VIN/Serial → License Plate
   */
  async match(tenantId: number, data: { serialNumber?: string; licensePlate?: string }): Promise<Trailer | null> {
    // Try VIN/serial first (most reliable)
    if (data.serialNumber) {
      const byVin = await this.matchByVin(tenantId, data.serialNumber);
      if (byVin) return byVin;
    }

    // Fallback to license plate
    if (data.licensePlate) {
      return this.matchByLicensePlate(tenantId, data.licensePlate);
    }

    return null;
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { Vehicle } from '@prisma/client';

@Injectable()
export class VehicleMatcher {
  constructor(private prisma: PrismaService) {}

  /**
   * Match vehicle by VIN (primary matching strategy)
   */
  async matchByVin(tenantId: number, vin: string): Promise<Vehicle | null> {
    if (!vin) return null;

    return this.prisma.vehicle.findFirst({
      where: {
        tenantId,
        vin,
      },
    });
  }

  /**
   * Match vehicle by license plate (fallback)
   */
  async matchByLicensePlate(tenantId: number, licensePlate: string): Promise<Vehicle | null> {
    if (!licensePlate) return null;

    return this.prisma.vehicle.findFirst({
      where: {
        tenantId,
        licensePlate,
      },
    });
  }

  /**
   * Match vehicle with fallback strategy: VIN → License Plate
   */
  async match(tenantId: number, data: { vin?: string; licensePlate?: string }): Promise<Vehicle | null> {
    // Try VIN first (most reliable)
    if (data.vin) {
      const match = await this.matchByVin(tenantId, data.vin);
      if (match) return match;
    }

    // Fallback to license plate
    if (data.licensePlate) {
      return this.matchByLicensePlate(tenantId, data.licensePlate);
    }

    return null;
  }
}

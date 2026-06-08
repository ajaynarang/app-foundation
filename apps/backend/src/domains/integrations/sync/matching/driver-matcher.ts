import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { Driver } from '@prisma/client';

@Injectable()
export class DriverMatcher {
  constructor(private prisma: PrismaService) {}

  /**
   * Match driver by phone (primary matching strategy)
   */
  async matchByPhone(tenantId: number, phone: string): Promise<Driver | null> {
    if (!phone) return null;

    return this.prisma.driver.findFirst({
      where: {
        tenantId,
        phone,
      },
    });
  }

  /**
   * Match driver by license number + state (fallback)
   */
  async matchByLicense(tenantId: number, licenseNumber: string, licenseState: string): Promise<Driver | null> {
    if (!licenseNumber || !licenseState) return null;

    return this.prisma.driver.findFirst({
      where: {
        tenantId,
        licenseNumber,
        licenseState,
      },
    });
  }

  /**
   * Match driver with fallback strategy: Phone → License+State
   */
  async match(
    tenantId: number,
    data: { phone?: string; licenseNumber?: string; licenseState?: string },
  ): Promise<Driver | null> {
    // Try phone first (most reliable)
    if (data.phone) {
      const match = await this.matchByPhone(tenantId, data.phone);
      if (match) return match;
    }

    // Fallback to license number + state
    if (data.licenseNumber && data.licenseState) {
      return this.matchByLicense(tenantId, data.licenseNumber, data.licenseState);
    }

    return null;
  }
}

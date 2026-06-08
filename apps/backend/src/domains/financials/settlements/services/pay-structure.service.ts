import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

@Injectable()
export class PayStructureService {
  private readonly logger = new Logger(PayStructureService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getByDriverId(tenantId: number, driverId: string) {
    const driver = await this.prisma.driver.findFirst({
      where: { driverId, tenantId },
    });
    if (!driver) throw new NotFoundException('Driver not found');

    const ps = await this.prisma.driverPayStructure.findFirst({
      where: { driverId: driver.id, isActive: true },
      orderBy: { effectiveFrom: 'desc' },
    });
    return ps ? this.serializePayStructure(ps) : null;
  }

  async upsert(
    tenantId: number,
    driverId: string,
    data: {
      type: string;
      ratePerMileCents?: number;
      percentage?: number;
      flatRateCents?: number;
      hybridBaseCents?: number;
      hybridPercent?: number;
      effectiveDate: string;
      notes?: string;
    },
  ) {
    const driver = await this.prisma.driver.findFirst({
      where: { driverId, tenantId },
    });
    if (!driver) throw new NotFoundException('Driver not found');

    // Deactivate current active pay structure(s) and create the new one
    const result = await this.prisma.$transaction(async (tx) => {
      // Close out any active pay structures
      await tx.driverPayStructure.updateMany({
        where: { driverId: driver.id, isActive: true },
        data: {
          isActive: false,
          effectiveTo: new Date(data.effectiveDate),
        },
      });

      // Create new active pay structure
      return tx.driverPayStructure.create({
        data: {
          driverId: driver.id,
          type: data.type as any,
          ratePerMileCents: data.ratePerMileCents ?? null,
          percentage: data.percentage ?? null,
          flatRateCents: data.flatRateCents ?? null,
          hybridBaseCents: data.hybridBaseCents ?? null,
          hybridPercent: data.hybridPercent ?? null,
          effectiveFrom: new Date(data.effectiveDate),
          isActive: true,
          notes: data.notes ?? null,
          tenantId,
        },
      });
    });

    this.logger.log(`Upserted pay structure for driver ${driverId}: ${data.type}`);
    return this.serializePayStructure(result);
  }

  /**
   * Serialize a DriverPayStructure row for API output:
   * - @db.Date fields → YYYY-MM-DD (prevents timezone shift)
   * - Decimal `percentage` / `hybridPercent` → number (preserves the
   *   API contract; Prisma serializes Decimal as string by default).
   */
  private serializePayStructure<T extends Record<string, any>>(ps: T): T & { effectiveDate: string } {
    return {
      ...ps,
      percentage: ps.percentage != null ? Number(ps.percentage) : null,
      hybridPercent: ps.hybridPercent != null ? Number(ps.hybridPercent) : null,
      effectiveFrom: ps.effectiveFrom instanceof Date ? ps.effectiveFrom.toISOString().split('T')[0] : ps.effectiveFrom,
      effectiveTo:
        ps.effectiveTo instanceof Date ? ps.effectiveTo.toISOString().split('T')[0] : (ps.effectiveTo ?? null),
      // Keep backward compat alias for API consumers
      effectiveDate: ps.effectiveFrom instanceof Date ? ps.effectiveFrom.toISOString().split('T')[0] : ps.effectiveFrom,
    };
  }
}

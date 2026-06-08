import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

@Injectable()
export class FuelCardsService {
  private readonly logger = new Logger(FuelCardsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Fuel Card Types ──

  async getAllCardTypes() {
    return this.prisma.fuelCardType.findMany({
      orderBy: { id: 'asc' },
    });
  }

  async getActiveCardTypes() {
    return this.prisma.fuelCardType.findMany({
      where: { isActive: true },
      orderBy: { displayName: 'asc' },
    });
  }

  async updateCardType(id: string, data: { displayName?: string; description?: string; isActive?: boolean }) {
    const existing = await this.prisma.fuelCardType.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException(`Fuel card type '${id}' not found`);

    return this.prisma.fuelCardType.update({
      where: { id },
      data,
    });
  }

  // ── Brand Acceptance ──

  async getBrandAcceptanceMap() {
    const rows = await this.prisma.brandFuelCardAcceptance.findMany({
      include: { fuelCardType: { select: { displayName: true } } },
      orderBy: [{ brand: 'asc' }, { fuelCardTypeId: 'asc' }],
    });

    // Group by brand
    const map: Record<string, { fuelCardTypeId: string; displayName: string }[]> = {};
    for (const row of rows) {
      if (!map[row.brand]) map[row.brand] = [];
      map[row.brand].push({
        fuelCardTypeId: row.fuelCardTypeId,
        displayName: row.fuelCardType.displayName,
      });
    }

    return Object.entries(map).map(([brand, cards]) => ({ brand, cards }));
  }

  async setBrandAcceptance(brand: string, fuelCardTypeIds: string[]) {
    // Validate that all fuel card type IDs exist
    const validTypes = await this.prisma.fuelCardType.findMany({
      where: { id: { in: fuelCardTypeIds } },
      select: { id: true },
    });
    const validIds = new Set(validTypes.map((t) => t.id));
    const invalid = fuelCardTypeIds.filter((id) => !validIds.has(id));
    if (invalid.length > 0) {
      throw new BadRequestException(`Invalid fuel card type IDs: ${invalid.join(', ')}`);
    }

    // Delete existing mappings for this brand, then create new ones
    await this.prisma.$transaction(async (tx) => {
      await tx.brandFuelCardAcceptance.deleteMany({ where: { brand } });

      if (fuelCardTypeIds.length > 0) {
        await tx.brandFuelCardAcceptance.createMany({
          data: fuelCardTypeIds.map((fuelCardTypeId) => ({
            brand,
            fuelCardTypeId,
          })),
        });
      }
    });

    return this.getBrandAcceptanceForBrand(brand);
  }

  async deleteBrand(brand: string) {
    const count = await this.prisma.brandFuelCardAcceptance.count({
      where: { brand },
    });
    if (count === 0) throw new NotFoundException(`Brand '${brand}' not found`);

    await this.prisma.brandFuelCardAcceptance.deleteMany({ where: { brand } });
  }

  async getBrandsAcceptingCards(fuelCardTypeIds: string[]): Promise<string[]> {
    if (fuelCardTypeIds.length === 0) return [];

    const rows = await this.prisma.brandFuelCardAcceptance.findMany({
      where: { fuelCardTypeId: { in: fuelCardTypeIds } },
      select: { brand: true },
      distinct: ['brand'],
    });

    return rows.map((r) => r.brand);
  }

  private async getBrandAcceptanceForBrand(brand: string) {
    const rows = await this.prisma.brandFuelCardAcceptance.findMany({
      where: { brand },
      include: { fuelCardType: { select: { displayName: true } } },
    });

    return {
      brand,
      cards: rows.map((r) => ({
        fuelCardTypeId: r.fuelCardTypeId,
        displayName: r.fuelCardType.displayName,
      })),
    };
  }
}

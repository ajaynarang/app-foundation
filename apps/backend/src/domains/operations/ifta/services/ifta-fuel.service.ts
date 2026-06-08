import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { getQuarterFromDate, getQuarterPeriod } from '../ifta.types';

export interface CreateFuelPurchaseInput {
  purchaseDate: string;
  jurisdiction: string;
  gallons: number;
  pricePerGallon?: number;
  vehicleId?: number;
  driverId?: number;
  stationName?: string;
  vendorName?: string;
  notes?: string;
  createdById?: number;
  source?: 'MANUAL' | 'RECEIPT_SCAN';
}

export interface FuelByStateResult {
  jurisdiction: string;
  totalGallons: number;
  purchaseCount: number;
}

@Injectable()
export class IftaFuelService {
  private readonly logger = new Logger(IftaFuelService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async ensureQuarterExists(tenantId: number, year: number, quarter: number): Promise<{ id: number }> {
    const existing = await this.prisma.iftaQuarter.findUnique({
      where: { tenantId_year_quarter: { tenantId, year, quarter } },
    });
    if (existing) return existing;

    const { periodStart, periodEnd } = getQuarterPeriod(year, quarter);
    return this.prisma.iftaQuarter.create({
      data: { tenantId, year, quarter, periodStart, periodEnd },
    });
  }

  async createFuelPurchase(tenantId: number, input: CreateFuelPurchaseInput) {
    const date = new Date(input.purchaseDate);
    const { year, quarter } = getQuarterFromDate(date);
    const quarterRecord = await this.ensureQuarterExists(tenantId, year, quarter);

    const totalCostCents =
      input.pricePerGallon != null ? Math.round(input.gallons * input.pricePerGallon * 100) : undefined;

    return this.prisma.iftaFuelPurchase.create({
      data: {
        tenantId,
        quarterId: quarterRecord.id,
        purchaseDate: date,
        jurisdiction: input.jurisdiction,
        gallons: input.gallons,
        pricePerGallon: input.pricePerGallon,
        totalCostCents,
        vehicleId: input.vehicleId,
        driverId: input.driverId,
        stationName: input.stationName,
        vendorName: input.vendorName,
        notes: input.notes,
        createdById: input.createdById,
        source: input.source ?? 'MANUAL',
      },
    });
  }

  async getFuelPurchases(tenantId: number, quarterId: number) {
    return this.prisma.iftaFuelPurchase.findMany({
      where: { tenantId, quarterId },
      orderBy: { purchaseDate: 'desc' },
      include: {
        vehicle: { select: { unitNumber: true } },
      },
    });
  }

  async getFuelByState(tenantId: number, quarterId: number): Promise<FuelByStateResult[]> {
    const rows = await this.prisma.iftaFuelPurchase.groupBy({
      by: ['jurisdiction'],
      where: { tenantId, quarterId },
      _sum: { gallons: true },
      _count: { id: true },
    });

    return rows.map((row) => ({
      jurisdiction: row.jurisdiction,
      totalGallons: row._sum.gallons ?? 0,
      purchaseCount: row._count.id,
    }));
  }

  async deleteFuelPurchase(tenantId: number, purchaseId: number): Promise<void> {
    await this.prisma.iftaFuelPurchase.delete({
      where: { id: purchaseId, tenantId },
    });
  }
}

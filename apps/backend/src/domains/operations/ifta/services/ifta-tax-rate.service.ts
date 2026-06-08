import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { IftaTaxRate } from '@prisma/client';

/**
 * Serialize an IftaTaxRate row for API output. taxRatePerGallon and
 * surchargeRate are Decimal in the DB; the API contract is `number` and
 * downstream consumers (ifta.service.ts) do `Number(...)` arithmetic on
 * these values regardless. Convert at the boundary.
 */
type SerializedIftaTaxRate = Omit<IftaTaxRate, 'taxRatePerGallon' | 'surchargeRate'> & {
  taxRatePerGallon: number;
  surchargeRate: number;
};

function serializeRate(row: IftaTaxRate): SerializedIftaTaxRate {
  // Decimal columns are NOT NULL in the schema (taxRatePerGallon required;
  // surchargeRate has @default(0)), so a runtime row from Prisma always has
  // both. If a test fixture mocks a partial row, fix the fixture rather
  // than the serializer — silently coercing undefined → NaN here would
  // mask real test bugs.
  return {
    ...row,
    taxRatePerGallon: Number(row.taxRatePerGallon),
    surchargeRate: Number(row.surchargeRate),
  };
}

@Injectable()
export class IftaTaxRateService {
  private readonly logger = new Logger(IftaTaxRateService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getTaxRate(jurisdiction: string, year: number, quarter: number): Promise<SerializedIftaTaxRate | null> {
    const row = await this.prisma.iftaTaxRate.findUnique({
      where: { jurisdiction_year_quarter: { jurisdiction, year, quarter } },
    });
    return row ? serializeRate(row) : null;
  }

  async getAllRatesForQuarter(year: number, quarter: number): Promise<SerializedIftaTaxRate[]> {
    const rates = await this.prisma.iftaTaxRate.findMany({
      where: { year, quarter, isActive: true },
      orderBy: { jurisdictionName: 'asc' },
    });
    return rates.map(serializeRate);
  }

  async getRatesMap(year: number, quarter: number): Promise<Map<string, SerializedIftaTaxRate>> {
    const rates = await this.getAllRatesForQuarter(year, quarter);
    return new Map(rates.map((r) => [r.jurisdiction, r]));
  }
}

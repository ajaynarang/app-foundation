import { Test, TestingModule } from '@nestjs/testing';
import { IftaTaxRateService } from '../ifta-tax-rate.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

describe('IftaTaxRateService', () => {
  let service: IftaTaxRateService;
  let prisma: { iftaTaxRate: { findUnique: jest.Mock; findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      iftaTaxRate: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [IftaTaxRateService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(IftaTaxRateService);
  });

  describe('getTaxRate', () => {
    it('should return tax rate for a valid jurisdiction and quarter', async () => {
      prisma.iftaTaxRate.findUnique.mockResolvedValue({
        jurisdiction: 'TX',
        jurisdictionName: 'Texas',
        taxRatePerGallon: 0.2,
        surchargeRate: 0,
        year: 2026,
        quarter: 1,
      });
      const result = await service.getTaxRate('TX', 2026, 1);
      expect(result).toEqual(expect.objectContaining({ jurisdiction: 'TX', taxRatePerGallon: 0.2 }));
      expect(prisma.iftaTaxRate.findUnique).toHaveBeenCalledWith({
        where: {
          jurisdiction_year_quarter: {
            jurisdiction: 'TX',
            year: 2026,
            quarter: 1,
          },
        },
      });
    });

    it('should return null when no rate exists', async () => {
      prisma.iftaTaxRate.findUnique.mockResolvedValue(null);
      const result = await service.getTaxRate('XX', 2026, 1);
      expect(result).toBeNull();
    });
  });

  describe('getAllRatesForQuarter', () => {
    it('should return all active rates for a given quarter', async () => {
      prisma.iftaTaxRate.findMany.mockResolvedValue([
        { jurisdiction: 'TX', taxRatePerGallon: 0.2 },
        { jurisdiction: 'CA', taxRatePerGallon: 0.68 },
      ]);
      const result = await service.getAllRatesForQuarter(2026, 1);
      expect(result).toHaveLength(2);
      expect(prisma.iftaTaxRate.findMany).toHaveBeenCalledWith({
        where: { year: 2026, quarter: 1, isActive: true },
        orderBy: { jurisdictionName: 'asc' },
      });
    });
  });

  describe('getRatesMap', () => {
    it('should return a map keyed by jurisdiction code', async () => {
      prisma.iftaTaxRate.findMany.mockResolvedValue([
        {
          jurisdiction: 'TX',
          taxRatePerGallon: 0.2,
          surchargeRate: 0,
          jurisdictionName: 'Texas',
        },
        {
          jurisdiction: 'CA',
          taxRatePerGallon: 0.68,
          surchargeRate: 0,
          jurisdictionName: 'California',
        },
      ]);
      const result = await service.getRatesMap(2026, 1);
      expect(result.get('TX')).toEqual(expect.objectContaining({ taxRatePerGallon: 0.2 }));
      expect(result.get('CA')).toEqual(expect.objectContaining({ taxRatePerGallon: 0.68 }));
      expect(result.has('NY')).toBe(false);
    });
  });
});

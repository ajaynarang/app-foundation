import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IftaService } from '../ifta.service';
import { IftaMileageService } from '../ifta-mileage.service';
import { IftaFuelService } from '../ifta-fuel.service';
import { IftaTaxRateService } from '../ifta-tax-rate.service';
import { IftaAnomalyDetectorService } from '../ifta-anomaly-detector.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

describe('IftaService', () => {
  let service: IftaService;
  let prisma: any;
  let mileageService: any;
  let fuelService: any;
  let taxRateService: any;
  let anomalyDetector: any;

  beforeEach(async () => {
    prisma = {
      iftaQuarter: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      iftaStateMileage: {
        upsert: jest.fn(),
      },
      iftaFiling: {
        upsert: jest.fn(),
      },
    };

    mileageService = {
      aggregateLoadMileageByState: jest.fn(),
      getMileageForQuarter: jest.fn(),
    };

    fuelService = {
      getFuelByState: jest.fn(),
    };

    taxRateService = {
      getRatesMap: jest.fn(),
    };

    anomalyDetector = {
      detectAnomalies: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IftaService,
        { provide: PrismaService, useValue: prisma },
        { provide: IftaMileageService, useValue: mileageService },
        { provide: IftaFuelService, useValue: fuelService },
        { provide: IftaTaxRateService, useValue: taxRateService },
        { provide: IftaAnomalyDetectorService, useValue: anomalyDetector },
      ],
    }).compile();

    service = module.get<IftaService>(IftaService);
  });

  describe('getQuarters', () => {
    it('should return quarters for tenant', async () => {
      const quarters = [
        { id: 101, year: 2026, quarter: 1, tenantId: 1 },
        { id: 102, year: 2025, quarter: 4, tenantId: 1 },
      ];
      prisma.iftaQuarter.findMany.mockResolvedValue(quarters);

      const result = await service.getQuarters(1);

      expect(result).toEqual(quarters);
      expect(prisma.iftaQuarter.findMany).toHaveBeenCalledWith({
        where: { tenantId: 1 },
        orderBy: [{ year: 'desc' }, { quarter: 'desc' }],
        include: { filing: true },
      });
    });

    it('should filter by year if provided', async () => {
      prisma.iftaQuarter.findMany.mockResolvedValue([]);

      await service.getQuarters(1, { year: 2026 });

      expect(prisma.iftaQuarter.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 1, year: 2026 },
        }),
      );
    });
  });

  describe('calculateQuarter', () => {
    it('should calculate per-state tax correctly', async () => {
      const quarter = {
        id: 101,
        tenantId: 1,
        year: 2026,
        quarter: 1,
        status: 'OPEN',
      };

      prisma.iftaQuarter.findFirst.mockResolvedValue(quarter);
      prisma.iftaQuarter.updateMany.mockResolvedValue({ count: 1 });
      prisma.iftaQuarter.update.mockImplementation(({ data }) => ({
        ...quarter,
        ...data,
        stateMileage: [],
        filing: null,
      }));
      prisma.iftaStateMileage.upsert.mockResolvedValue({});

      mileageService.aggregateLoadMileageByState.mockResolvedValue([
        {
          jurisdiction: 'TX',
          totalMiles: 1000,
          loadIds: [1, 2],
          source: 'LOAD_DERIVED',
        },
        {
          jurisdiction: 'OK',
          totalMiles: 500,
          loadIds: [3],
          source: 'LOAD_DERIVED',
        },
      ]);
      mileageService.getMileageForQuarter.mockResolvedValue([]);

      fuelService.getFuelByState.mockResolvedValue([{ jurisdiction: 'TX', totalGallons: 100, purchaseCount: 3 }]);

      const taxRatesMap = new Map([
        [
          'TX',
          {
            jurisdiction: 'TX',
            jurisdictionName: 'Texas',
            taxRatePerGallon: 0.2,
            surchargeRate: 0,
          },
        ],
        [
          'OK',
          {
            jurisdiction: 'OK',
            jurisdictionName: 'Oklahoma',
            taxRatePerGallon: 0.19,
            surchargeRate: 0.01,
          },
        ],
      ]);
      taxRateService.getRatesMap.mockResolvedValue(taxRatesMap);
      anomalyDetector.detectAnomalies.mockReturnValue([]);

      const result = await service.calculateQuarter(1, 101);

      expect(result.stateCalculations).toHaveLength(2);

      // TX: miles=1000, mpg=6.5 → taxableGallons=153.846, rate=0.20
      // taxOwed = round(153.846 * 0.20 * 100) = 3077 cents
      // taxPaid = round(100 * 0.20 * 100) = 2000 cents
      // net = 3077 - 2000 = 1077
      const tx = result.stateCalculations.find((s) => s.jurisdiction === 'TX');
      expect(tx).toBeDefined();
      expect(tx.totalMiles).toBe(1000);
      expect(tx.taxableGallons).toBeCloseTo(153.846, 2);
      expect(tx.taxOwedCents).toBe(3077);
      expect(tx.taxPaidCents).toBe(2000);
      expect(tx.netTaxCents).toBe(1077);

      // OK: miles=500, mpg=6.5 → taxableGallons=76.923, rate=0.19, surcharge=0.01
      // taxOwed = round(76.923 * 0.19 * 100) = 1462 cents
      // surchargeOwed = round(76.923 * 0.01 * 100) = 77 cents
      // taxPaid = 0 (no fuel in OK)
      // net = 1462 + 77 - 0 = 1539
      const ok = result.stateCalculations.find((s) => s.jurisdiction === 'OK');
      expect(ok).toBeDefined();
      expect(ok.totalMiles).toBe(500);
      expect(ok.fuelPurchasedGallons).toBe(0);
      expect(ok.netTaxCents).toBe(1539);

      expect(result.summary.totalMiles).toBe(1500);
      expect(result.summary.totalGallons).toBe(100);
      expect(result.summary.stateCount).toBe(2);
    });

    it('should throw NotFoundException for missing quarter', async () => {
      prisma.iftaQuarter.findFirst.mockResolvedValue(null);

      await expect(service.calculateQuarter(1, 999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateFilingStatus', () => {
    it('should enforce valid transitions', async () => {
      prisma.iftaQuarter.findFirst.mockResolvedValue({
        id: 101,
        tenantId: 1,
        year: 2026,
        quarter: 1,
        status: 'OPEN',
      });

      // OPEN → FILED is not allowed
      await expect(service.updateFilingStatus(1, 101, { status: 'FILED' }, 1)).rejects.toThrow(BadRequestException);
    });

    it('should reject OPEN → DRAFT (must use calculateQuarter)', async () => {
      prisma.iftaQuarter.findFirst.mockResolvedValue({
        id: 101,
        tenantId: 1,
        year: 2026,
        quarter: 1,
        status: 'OPEN',
      });

      await expect(service.updateFilingStatus(1, 101, { status: 'DRAFT' }, 1)).rejects.toThrow(BadRequestException);
    });

    it('should allow REVIEWED → FILED and create filing record', async () => {
      prisma.iftaQuarter.findFirst.mockResolvedValue({
        id: 101,
        tenantId: 1,
        year: 2026,
        quarter: 1,
        status: 'REVIEWED',
        netTaxDueCents: 5000,
      });
      prisma.iftaQuarter.update.mockResolvedValue({
        id: 101,
        status: 'FILED',
        filing: {},
      });
      prisma.iftaFiling.upsert.mockResolvedValue({});

      const result = await service.updateFilingStatus(1, 101, { status: 'FILED', confirmationNumber: 'IFTA-123' }, 1);

      expect(result.status).toBe('FILED');
      expect(prisma.iftaFiling.upsert).toHaveBeenCalled();
    });

    it('should throw NotFoundException for missing quarter', async () => {
      prisma.iftaQuarter.findFirst.mockResolvedValue(null);

      await expect(service.updateFilingStatus(1, 999, { status: 'DRAFT' }, 1)).rejects.toThrow(NotFoundException);
    });

    it('should allow DRAFT → REVIEWED transition', async () => {
      prisma.iftaQuarter.findFirst.mockResolvedValue({
        id: 101,
        tenantId: 1,
        year: 2026,
        quarter: 1,
        status: 'DRAFT',
      });
      prisma.iftaQuarter.update.mockResolvedValue({
        id: 101,
        status: 'REVIEWED',
        filing: null,
      });

      const result = await service.updateFilingStatus(1, 101, { status: 'REVIEWED' }, 1);

      expect(result.status).toBe('REVIEWED');
    });

    it('should allow FILED → CONFIRMED and set confirmedAt', async () => {
      prisma.iftaQuarter.findFirst.mockResolvedValue({
        id: 101,
        tenantId: 1,
        year: 2026,
        quarter: 1,
        status: 'FILED',
        netTaxDueCents: 5000,
      });
      prisma.iftaQuarter.update.mockResolvedValue({
        id: 101,
        status: 'CONFIRMED',
        filing: {},
      });

      const result = await service.updateFilingStatus(1, 101, { status: 'CONFIRMED' }, 1);

      expect(result.status).toBe('CONFIRMED');
      expect(prisma.iftaQuarter.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'CONFIRMED',
            confirmedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should allow CONFIRMED → AMENDED transition', async () => {
      prisma.iftaQuarter.findFirst.mockResolvedValue({
        id: 101,
        tenantId: 1,
        year: 2026,
        quarter: 1,
        status: 'CONFIRMED',
      });
      prisma.iftaQuarter.update.mockResolvedValue({
        id: 101,
        status: 'AMENDED',
        filing: null,
      });

      const result = await service.updateFilingStatus(1, 101, { status: 'AMENDED' }, 1);

      expect(result.status).toBe('AMENDED');
    });

    it('should save notes when provided', async () => {
      prisma.iftaQuarter.findFirst.mockResolvedValue({
        id: 101,
        tenantId: 1,
        year: 2026,
        quarter: 1,
        status: 'DRAFT',
      });
      prisma.iftaQuarter.update.mockResolvedValue({
        id: 101,
        status: 'REVIEWED',
        filing: null,
      });

      await service.updateFilingStatus(1, 101, { status: 'REVIEWED', notes: 'Ready for review' }, 1);

      expect(prisma.iftaQuarter.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ notes: 'Ready for review' }),
        }),
      );
    });
  });

  describe('getQuarterDetail', () => {
    it('should return quarter with related data', async () => {
      const quarter = {
        id: 101,
        year: 2026,
        quarter: 1,
        stateMileage: [],
        fuelPurchases: [],
        filing: null,
        filedByUser: null,
      };
      prisma.iftaQuarter.findFirst.mockResolvedValue(quarter);

      const result = await service.getQuarterDetail(1, 101);
      expect(result).toEqual(quarter);
    });

    it('should throw NotFoundException when quarter not found', async () => {
      prisma.iftaQuarter.findFirst.mockResolvedValue(null);

      await expect(service.getQuarterDetail(1, 999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getQuarterSummary', () => {
    it('should return summary with deadline countdown', async () => {
      prisma.iftaQuarter.findFirst.mockResolvedValue({
        id: 101,
        year: 2026,
        quarter: 1,
        status: 'DRAFT',
        totalMiles: 5000,
        totalGallons: 800,
        totalTaxOwedCents: 10000,
        totalTaxPaidCents: 7000,
        netTaxDueCents: 3000,
        anomalyCount: 1,
      });

      const result = await service.getQuarterSummary(1, 101);

      expect(result.year).toBe(2026);
      expect(result.quarter).toBe(1);
      expect(result.status).toBe('DRAFT');
      expect(result.totalMiles).toBe(5000);
      expect(result.totalGallons).toBe(800);
      expect(result.fleetAvgMpg).toBeCloseTo(6.25, 1);
      expect(result.filingDeadline).toBeInstanceOf(Date);
      expect(result.daysUntilDeadline).toBeDefined();
    });

    it('should throw NotFoundException for missing quarter', async () => {
      prisma.iftaQuarter.findFirst.mockResolvedValue(null);

      await expect(service.getQuarterSummary(1, 999)).rejects.toThrow(NotFoundException);
    });

    it('should use default MPG when no data', async () => {
      prisma.iftaQuarter.findFirst.mockResolvedValue({
        id: 101,
        year: 2026,
        quarter: 1,
        status: 'OPEN',
        totalMiles: null,
        totalGallons: null,
        totalTaxOwedCents: null,
        totalTaxPaidCents: null,
        netTaxDueCents: null,
        anomalyCount: 0,
      });

      const result = await service.getQuarterSummary(1, 101);

      expect(result.totalMiles).toBe(0);
      expect(result.totalGallons).toBe(0);
    });
  });

  describe('calculateQuarter — edge cases', () => {
    it('should throw when quarter is already CALCULATING', async () => {
      prisma.iftaQuarter.findFirst.mockResolvedValue({
        id: 101,
        tenantId: 1,
        year: 2026,
        quarter: 1,
        status: 'CALCULATING',
      });

      await expect(service.calculateQuarter(1, 101)).rejects.toThrow(BadRequestException);
    });

    it('should throw when optimistic lock fails', async () => {
      prisma.iftaQuarter.findFirst.mockResolvedValue({
        id: 101,
        tenantId: 1,
        year: 2026,
        quarter: 1,
        status: 'OPEN',
      });
      prisma.iftaQuarter.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.calculateQuarter(1, 101)).rejects.toThrow(BadRequestException);
    });

    it('should revert status on calculation error', async () => {
      prisma.iftaQuarter.findFirst.mockResolvedValue({
        id: 101,
        tenantId: 1,
        year: 2026,
        quarter: 1,
        status: 'DRAFT',
      });
      prisma.iftaQuarter.updateMany.mockResolvedValue({ count: 1 });
      mileageService.aggregateLoadMileageByState.mockRejectedValue(new Error('Mileage error'));

      await expect(service.calculateQuarter(1, 101)).rejects.toThrow('Mileage error');

      // Should revert status
      expect(prisma.iftaQuarter.update).toHaveBeenCalledWith({
        where: { id: 101 },
        data: { status: 'DRAFT' },
      });
    });

    it('should handle manual mileage entries overriding load-derived', async () => {
      prisma.iftaQuarter.findFirst.mockResolvedValue({
        id: 101,
        tenantId: 1,
        year: 2026,
        quarter: 1,
        status: 'OPEN',
      });
      prisma.iftaQuarter.updateMany.mockResolvedValue({ count: 1 });
      prisma.iftaQuarter.update.mockImplementation(({ data }) => ({
        ...data,
        stateMileage: [],
        filing: null,
      }));
      prisma.iftaStateMileage.upsert.mockResolvedValue({});

      mileageService.aggregateLoadMileageByState.mockResolvedValue([
        {
          jurisdiction: 'TX',
          totalMiles: 1000,
          loadIds: [1],
          source: 'LOAD_DERIVED',
        },
      ]);
      mileageService.getMileageForQuarter.mockResolvedValue([
        {
          jurisdiction: 'TX',
          totalMiles: 1200,
          source: 'MANUAL',
        },
      ]);
      fuelService.getFuelByState.mockResolvedValue([]);
      taxRateService.getRatesMap.mockResolvedValue(new Map());
      anomalyDetector.detectAnomalies.mockReturnValue([]);

      const result = await service.calculateQuarter(1, 101);

      // TX should use manual value (1200) instead of load-derived (1000)
      const tx = result.stateCalculations.find((s) => s.jurisdiction === 'TX');
      expect(tx.totalMiles).toBe(1200);
    });

    it('should include fuel-only jurisdictions', async () => {
      prisma.iftaQuarter.findFirst.mockResolvedValue({
        id: 101,
        tenantId: 1,
        year: 2026,
        quarter: 1,
        status: 'OPEN',
      });
      prisma.iftaQuarter.updateMany.mockResolvedValue({ count: 1 });
      prisma.iftaQuarter.update.mockImplementation(({ data }) => ({
        ...data,
        stateMileage: [],
        filing: null,
      }));
      prisma.iftaStateMileage.upsert.mockResolvedValue({});

      mileageService.aggregateLoadMileageByState.mockResolvedValue([]);
      mileageService.getMileageForQuarter.mockResolvedValue([]);
      fuelService.getFuelByState.mockResolvedValue([{ jurisdiction: 'GA', totalGallons: 50, purchaseCount: 2 }]);
      taxRateService.getRatesMap.mockResolvedValue(new Map());
      anomalyDetector.detectAnomalies.mockReturnValue([]);

      const result = await service.calculateQuarter(1, 101);

      // GA should be included even though no mileage
      const ga = result.stateCalculations.find((s) => s.jurisdiction === 'GA');
      expect(ga).toBeDefined();
      expect(ga.totalMiles).toBe(0);
      expect(ga.fuelPurchasedGallons).toBe(50);
    });
  });

  describe('getQuarters — with filters', () => {
    it('should filter by status', async () => {
      prisma.iftaQuarter.findMany.mockResolvedValue([]);

      await service.getQuarters(1, { status: 'DRAFT' });

      expect(prisma.iftaQuarter.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 1, status: 'DRAFT' },
        }),
      );
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PayStructureService } from '../pay-structure.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { createMockPrisma } from '../../../../../test/mocks';
import { makeDriver, makeDriverPayStructure } from '../../../../../test/factories';

describe('PayStructureService', () => {
  let service: PayStructureService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [PayStructureService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<PayStructureService>(PayStructureService);
  });

  const tenantId = 1;

  // ─── getByDriverId ──────────────────────────────────────────

  describe('getByDriverId', () => {
    it('should return pay structure for driver', async () => {
      prisma.driver.findFirst.mockResolvedValue(makeDriver());
      const ps = makeDriverPayStructure({
        effectiveFrom: new Date('2026-01-01'),
      });
      prisma.driverPayStructure.findFirst.mockResolvedValue(ps);

      const result = await service.getByDriverId(tenantId, 'drv-test-001');

      expect(result).toBeDefined();
      expect(result.type).toBe('PER_MILE');
      expect(result.effectiveFrom).toBe('2026-01-01');
      expect(result.effectiveDate).toBe('2026-01-01');
    });

    it('should return null when driver has no pay structure', async () => {
      prisma.driver.findFirst.mockResolvedValue(makeDriver());
      prisma.driverPayStructure.findFirst.mockResolvedValue(null);

      const result = await service.getByDriverId(tenantId, 'drv-test-001');
      expect(result).toBeNull();
    });

    it('should throw NotFoundException when driver not found', async () => {
      prisma.driver.findFirst.mockResolvedValue(null);
      await expect(service.getByDriverId(tenantId, 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── upsert ─────────────────────────────────────────────────

  describe('upsert', () => {
    it('should deactivate old and create new PER_MILE pay structure', async () => {
      prisma.driver.findFirst.mockResolvedValue(makeDriver());
      const created = {
        ...makeDriverPayStructure(),
        type: 'PER_MILE',
        ratePerMileCents: 55,
        effectiveFrom: new Date('2026-01-15'),
      };
      prisma.$transaction.mockImplementation(async (fn: any) => {
        prisma.driverPayStructure.updateMany.mockResolvedValue({ count: 1 });
        prisma.driverPayStructure.create.mockResolvedValue(created);
        return fn(prisma);
      });

      const result = await service.upsert(tenantId, 'drv-test-001', {
        type: 'PER_MILE',
        ratePerMileCents: 55,
        effectiveDate: '2026-01-15',
      });

      expect(prisma.driverPayStructure.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { driverId: 1, isActive: true },
          data: expect.objectContaining({
            isActive: false,
          }),
        }),
      );
      expect(prisma.driverPayStructure.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'PER_MILE',
            ratePerMileCents: 55,
            isActive: true,
            tenantId,
          }),
        }),
      );
      expect(result.effectiveFrom).toBe('2026-01-15');
      expect(result.effectiveDate).toBe('2026-01-15');
    });

    it('should create PERCENTAGE pay structure', async () => {
      prisma.driver.findFirst.mockResolvedValue(makeDriver());
      const created = {
        ...makeDriverPayStructure(),
        type: 'PERCENTAGE',
        percentage: 25,
        effectiveFrom: new Date('2026-02-01'),
      };
      prisma.$transaction.mockImplementation(async (fn: any) => {
        prisma.driverPayStructure.updateMany.mockResolvedValue({ count: 0 });
        prisma.driverPayStructure.create.mockResolvedValue(created);
        return fn(prisma);
      });

      await service.upsert(tenantId, 'drv-test-001', {
        type: 'PERCENTAGE',
        percentage: 25,
        effectiveDate: '2026-02-01',
      });

      const createCall = prisma.driverPayStructure.create.mock.calls[0][0];
      expect(createCall.data.percentage).toBe(25);
      expect(createCall.data.ratePerMileCents).toBeNull();
    });

    it('should create FLAT_RATE pay structure', async () => {
      prisma.driver.findFirst.mockResolvedValue(makeDriver());
      const created = {
        ...makeDriverPayStructure(),
        type: 'FLAT_RATE',
        flatRateCents: 50000,
        effectiveFrom: new Date('2026-02-01'),
      };
      prisma.$transaction.mockImplementation(async (fn: any) => {
        prisma.driverPayStructure.updateMany.mockResolvedValue({ count: 0 });
        prisma.driverPayStructure.create.mockResolvedValue(created);
        return fn(prisma);
      });

      await service.upsert(tenantId, 'drv-test-001', {
        type: 'FLAT_RATE',
        flatRateCents: 50000,
        effectiveDate: '2026-02-01',
      });

      const createCall = prisma.driverPayStructure.create.mock.calls[0][0];
      expect(createCall.data.flatRateCents).toBe(50000);
    });

    it('should create HYBRID pay structure', async () => {
      prisma.driver.findFirst.mockResolvedValue(makeDriver());
      const created = {
        ...makeDriverPayStructure(),
        type: 'HYBRID',
        hybridBaseCents: 10000,
        hybridPercent: 10,
        effectiveFrom: new Date('2026-02-01'),
      };
      prisma.$transaction.mockImplementation(async (fn: any) => {
        prisma.driverPayStructure.updateMany.mockResolvedValue({ count: 0 });
        prisma.driverPayStructure.create.mockResolvedValue(created);
        return fn(prisma);
      });

      await service.upsert(tenantId, 'drv-test-001', {
        type: 'HYBRID',
        hybridBaseCents: 10000,
        hybridPercent: 10,
        effectiveDate: '2026-02-01',
      });

      const createCall = prisma.driverPayStructure.create.mock.calls[0][0];
      expect(createCall.data.hybridBaseCents).toBe(10000);
      expect(createCall.data.hybridPercent).toBe(10);
    });

    it('should throw NotFoundException when driver not found', async () => {
      prisma.driver.findFirst.mockResolvedValue(null);
      await expect(
        service.upsert(tenantId, 'missing', {
          type: 'PER_MILE',
          ratePerMileCents: 55,
          effectiveDate: '2026-01-01',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should null out inapplicable rate fields', async () => {
      prisma.driver.findFirst.mockResolvedValue(makeDriver());
      prisma.$transaction.mockImplementation(async (fn: any) => {
        prisma.driverPayStructure.updateMany.mockResolvedValue({ count: 0 });
        prisma.driverPayStructure.create.mockResolvedValue({
          ...makeDriverPayStructure(),
          effectiveFrom: new Date('2026-01-01'),
        });
        return fn(prisma);
      });

      await service.upsert(tenantId, 'drv-test-001', {
        type: 'PERCENTAGE',
        percentage: 30,
        effectiveDate: '2026-01-01',
      });

      const createCall = prisma.driverPayStructure.create.mock.calls[0][0];
      // Fields not provided should be null
      expect(createCall.data.ratePerMileCents).toBeNull();
      expect(createCall.data.flatRateCents).toBeNull();
      expect(createCall.data.hybridBaseCents).toBeNull();
      expect(createCall.data.hybridPercent).toBeNull();
    });
  });
});

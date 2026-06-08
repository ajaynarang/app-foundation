import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { SettlementsService } from '../settlements.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { QUEUE_NAMES } from '../../../../../infrastructure/queue/queue.constants';
import { NotificationTriggersService } from '../../../../../domains/operations/notifications/notification-triggers.service';
import { DomainEventService } from '../../../../../infrastructure/events/domain-event.service';
import { createMockPrisma, createMockQueue } from '../../../../../test/mocks';
import { makeDriver, makeDeliveredLoad, makeSettlement } from '../../../../../test/factories';

describe('SettlementsService', () => {
  let service: SettlementsService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let accountingQueue: ReturnType<typeof createMockQueue>;
  let notificationTriggers: Record<string, jest.Mock>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    // Default: no relay legs (tests for non-relay loads)
    prisma.loadLeg.findMany.mockResolvedValue([]);
    accountingQueue = createMockQueue();
    notificationTriggers = {
      settlementReady: jest.fn().mockResolvedValue(undefined),
      driverPaymentProcessed: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettlementsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: getQueueToken(QUEUE_NAMES.FINANCE),
          useValue: accountingQueue,
        },
        {
          provide: NotificationTriggersService,
          useValue: notificationTriggers,
        },
        {
          provide: DomainEventService,
          useValue: { emit: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<SettlementsService>(SettlementsService);
  });

  const tenantId = 1;
  const periodStart = '2026-03-01';
  const periodEnd = '2026-03-15';

  function driverWithPayStructure(payOverrides?: Record<string, any>) {
    return makeDriver({
      payStructures: [
        {
          type: 'PER_MILE',
          ratePerMileCents: 55,
          percentage: null,
          flatRateCents: null,
          hybridBaseCents: null,
          hybridPercent: null,
          isActive: true,
          ...payOverrides,
        },
      ],
    });
  }

  function loadWithRoute(miles: number, rateCents = 250000, overrides?: Record<string, any>) {
    return makeDeliveredLoad({
      rateCents,
      routePlanLoads: [{ plan: { totalDistanceMiles: miles } }],
      ...overrides,
    });
  }

  // ─── calculate ───────────────────────────────────────────────

  describe('calculate', () => {
    it('should calculate PER_MILE: rate * routeMiles', async () => {
      const driver = driverWithPayStructure({
        type: 'PER_MILE',
        ratePerMileCents: 55,
      });
      prisma.driver.findFirst.mockResolvedValue(driver);
      prisma.load.findMany.mockResolvedValue([loadWithRoute(800)]);
      prisma.settlement.findFirst.mockResolvedValue(null);
      prisma.settlement.count.mockResolvedValue(0);
      prisma.settlement.create.mockImplementation(async (args: any) => ({
        ...makeSettlement(),
        ...args.data,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        lineItems: [],
        driver,
      }));

      await service.calculate(tenantId, {
        driverId: 'drv-test-001',
        periodStart,
        periodEnd,
      });

      const createCall = prisma.settlement.create.mock.calls[0][0];
      const lineItem = createCall.data.lineItems.create[0];
      expect(lineItem.payAmountCents).toBe(Math.round(800 * 55)); // 44000
      expect(createCall.data.grossPayCents).toBe(44000);
      expect(createCall.data.netPayCents).toBe(44000);
      expect(createCall.data.deductionsCents).toBe(0);
    });

    it('should calculate PERCENTAGE: rate * loadRevenue / 100', async () => {
      const driver = driverWithPayStructure({
        type: 'PERCENTAGE',
        percentage: 25,
      });
      prisma.driver.findFirst.mockResolvedValue(driver);
      prisma.load.findMany.mockResolvedValue([loadWithRoute(800, 400000)]);
      prisma.settlement.findFirst.mockResolvedValue(null);
      prisma.settlement.count.mockResolvedValue(0);
      prisma.settlement.create.mockImplementation(async (args: any) => ({
        ...makeSettlement(),
        ...args.data,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        lineItems: [],
        driver,
      }));

      await service.calculate(tenantId, {
        driverId: 'drv-test-001',
        periodStart,
        periodEnd,
      });

      const createCall = prisma.settlement.create.mock.calls[0][0];
      expect(createCall.data.lineItems.create[0].payAmountCents).toBe(Math.round((400000 * 25) / 100)); // 100000
    });

    it('should calculate FLAT_RATE per load', async () => {
      const driver = driverWithPayStructure({
        type: 'FLAT_RATE',
        flatRateCents: 50000,
      });
      prisma.driver.findFirst.mockResolvedValue(driver);
      prisma.load.findMany.mockResolvedValue([loadWithRoute(800), loadWithRoute(600)]);
      prisma.settlement.findFirst.mockResolvedValue(null);
      prisma.settlement.count.mockResolvedValue(0);
      prisma.settlement.create.mockImplementation(async (args: any) => ({
        ...makeSettlement(),
        ...args.data,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        lineItems: [],
        driver,
      }));

      await service.calculate(tenantId, {
        driverId: 'drv-test-001',
        periodStart,
        periodEnd,
      });

      const createCall = prisma.settlement.create.mock.calls[0][0];
      expect(createCall.data.grossPayCents).toBe(100000); // 50000 * 2 loads
    });

    it('should calculate HYBRID: base + percentage of revenue', async () => {
      const driver = driverWithPayStructure({
        type: 'HYBRID',
        hybridBaseCents: 10000,
        hybridPercent: 10,
      });
      prisma.driver.findFirst.mockResolvedValue(driver);
      prisma.load.findMany.mockResolvedValue([loadWithRoute(800, 300000)]);
      prisma.settlement.findFirst.mockResolvedValue(null);
      prisma.settlement.count.mockResolvedValue(0);
      prisma.settlement.create.mockImplementation(async (args: any) => ({
        ...makeSettlement(),
        ...args.data,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        lineItems: [],
        driver,
      }));

      await service.calculate(tenantId, {
        driverId: 'drv-test-001',
        periodStart,
        periodEnd,
      });

      const createCall = prisma.settlement.create.mock.calls[0][0];
      // 10000 + round(300000 * 10/100) = 10000 + 30000 = 40000
      expect(createCall.data.lineItems.create[0].payAmountCents).toBe(40000);
    });

    it('should throw when driver not found', async () => {
      prisma.driver.findFirst.mockResolvedValue(null);
      await expect(
        service.calculate(tenantId, {
          driverId: 'missing',
          periodStart,
          periodEnd,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw when driver has no pay structure', async () => {
      prisma.driver.findFirst.mockResolvedValue(makeDriver({ payStructures: [] }));
      await expect(
        service.calculate(tenantId, {
          driverId: 'drv-test-001',
          periodStart,
          periodEnd,
        }),
      ).rejects.toThrow('Driver has no pay structure configured');
    });

    it('should throw when no delivered loads in period', async () => {
      prisma.driver.findFirst.mockResolvedValue(driverWithPayStructure());
      prisma.load.findMany.mockResolvedValue([]);
      await expect(
        service.calculate(tenantId, {
          driverId: 'drv-test-001',
          periodStart,
          periodEnd,
        }),
      ).rejects.toThrow('No delivered loads found in this period');
    });

    it('should detect overlapping settlement periods', async () => {
      prisma.driver.findFirst.mockResolvedValue(driverWithPayStructure());
      prisma.load.findMany.mockResolvedValue([loadWithRoute(500)]);
      prisma.settlement.findFirst.mockResolvedValue(
        makeSettlement({
          settlementNumber: 'STL-2026-W10-DRIVER',
          periodStart: new Date('2026-03-05'),
          periodEnd: new Date('2026-03-12'),
        }),
      );

      await expect(
        service.calculate(tenantId, {
          driverId: 'drv-test-001',
          periodStart,
          periodEnd,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should skip overlap check in preview mode', async () => {
      const driver = driverWithPayStructure();
      prisma.driver.findFirst.mockResolvedValue(driver);
      prisma.load.findMany.mockResolvedValue([loadWithRoute(500)]);
      // settlement.findFirst not called because preview=true

      const result = await service.calculate(tenantId, {
        driverId: 'drv-test-001',
        periodStart,
        periodEnd,
        preview: true,
      });

      expect(result.lineItems).toHaveLength(1);
      expect((result as any).loadCount).toBe(1);
      expect(prisma.settlement.create).not.toHaveBeenCalled();
    });
  });

  // ─── findAll ─────────────────────────────────────────────────

  describe('findAll', () => {
    it('should list settlements with tenant isolation', async () => {
      prisma.settlement.findMany.mockResolvedValue([
        makeSettlement({
          periodStart: new Date('2026-03-01'),
          periodEnd: new Date('2026-03-15'),
        }),
      ]);

      const result = await service.findAll(tenantId);

      expect(prisma.settlement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId }),
        }),
      );
      expect(result).toHaveLength(1);
    });

    it('should filter by driver', async () => {
      prisma.driver.findFirst.mockResolvedValue(makeDriver({ id: 5 }));
      prisma.settlement.findMany.mockResolvedValue([]);

      await service.findAll(tenantId, { driverId: 'drv-test-001' });

      expect(prisma.settlement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ driverId: 5 }),
        }),
      );
    });

    it('should filter by status', async () => {
      prisma.settlement.findMany.mockResolvedValue([]);
      await service.findAll(tenantId, { status: 'APPROVED' });

      expect(prisma.settlement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'APPROVED' }),
        }),
      );
    });
  });

  // ─── findOne ────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return settlement with relations', async () => {
      const settlement = makeSettlement({
        settlementId: 'stl-001',
        periodStart: new Date('2026-03-01'),
        periodEnd: new Date('2026-03-15'),
        deductions: [],
      });
      prisma.settlement.findFirst.mockResolvedValue(settlement);

      const result = await service.findOne(tenantId, 'stl-001');
      expect(result.settlementId).toBe('stl-001');
    });

    it('should throw NotFoundException', async () => {
      prisma.settlement.findFirst.mockResolvedValue(null);
      await expect(service.findOne(tenantId, 'not-found')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── approve ────────────────────────────────────────────────

  describe('approve', () => {
    it('should set APPROVED status with approver and timestamp', async () => {
      const settlement = makeSettlement({
        settlementId: 'stl-001',
        status: 'DRAFT',
        periodStart: new Date('2026-03-01'),
        periodEnd: new Date('2026-03-15'),
        deductions: [],
      });
      prisma.settlement.findFirst.mockResolvedValue(settlement);
      prisma.settlement.update.mockResolvedValue({
        ...settlement,
        status: 'APPROVED',
        driver: makeDriver(),
      });

      await service.approve(tenantId, 'stl-001', 42);

      expect(prisma.settlement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'APPROVED',
            approvedBy: 42,
            approvedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should throw when not DRAFT', async () => {
      const settlement = makeSettlement({
        settlementId: 'stl-001',
        status: 'APPROVED',
        periodStart: new Date('2026-03-01'),
        periodEnd: new Date('2026-03-15'),
        deductions: [],
      });
      prisma.settlement.findFirst.mockResolvedValue(settlement);

      await expect(service.approve(tenantId, 'stl-001')).rejects.toThrow('Can only approve draft settlements');
    });
  });

  // ─── markPaid ───────────────────────────────────────────────

  describe('markPaid', () => {
    it('should set PAID status with paidAt', async () => {
      const settlement = makeSettlement({
        settlementId: 'stl-001',
        status: 'APPROVED',
        periodStart: new Date('2026-03-01'),
        periodEnd: new Date('2026-03-15'),
        deductions: [],
      });
      prisma.settlement.findFirst.mockResolvedValue(settlement);
      prisma.settlement.update.mockResolvedValue({
        ...settlement,
        status: 'PAID',
        driver: makeDriver(),
      });
      prisma.user.findFirst.mockResolvedValue(null); // no driver user

      await service.markPaid(tenantId, 'stl-001');

      expect(prisma.settlement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PAID',
            paidAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should throw when not APPROVED', async () => {
      const settlement = makeSettlement({
        settlementId: 'stl-001',
        status: 'DRAFT',
        periodStart: new Date('2026-03-01'),
        periodEnd: new Date('2026-03-15'),
        deductions: [],
      });
      prisma.settlement.findFirst.mockResolvedValue(settlement);

      await expect(service.markPaid(tenantId, 'stl-001')).rejects.toThrow('Can only mark approved settlements as paid');
    });

    it('should queue accounting sync when externalBillId exists', async () => {
      const settlement = makeSettlement({
        settlementId: 'stl-001',
        status: 'APPROVED',
        externalBillId: 'qb-bill-123',
        periodStart: new Date('2026-03-01'),
        periodEnd: new Date('2026-03-15'),
        deductions: [],
      });
      prisma.settlement.findFirst.mockResolvedValue(settlement);
      prisma.settlement.update.mockResolvedValue({
        ...settlement,
        status: 'PAID',
        driver: makeDriver(),
      });
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.integrationConfig.findFirst.mockResolvedValue({
        integrationId: 'int-1',
        isEnabled: true,
        status: 'ACTIVE',
      });

      await service.markPaid(tenantId, 'stl-001');

      expect(accountingQueue.add).toHaveBeenCalledWith(
        'settlement-payment',
        expect.objectContaining({
          payload: expect.objectContaining({ entityId: 'stl-001' }),
          metadata: expect.objectContaining({ source: 'api' }),
        }),
        expect.any(Object),
      );
    });
  });

  // ─── voidSettlement ──────────────────────────────────────────

  describe('voidSettlement', () => {
    it('should void a DRAFT settlement', async () => {
      const settlement = makeSettlement({
        settlementId: 'stl-001',
        status: 'DRAFT',
        periodStart: new Date('2026-03-01'),
        periodEnd: new Date('2026-03-15'),
        deductions: [],
      });
      prisma.settlement.findFirst.mockResolvedValue(settlement);
      prisma.settlement.update.mockResolvedValue({
        ...settlement,
        status: 'VOID',
        driver: makeDriver(),
      });

      await service.voidSettlement(tenantId, 'stl-001');

      expect(prisma.settlement.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'VOID' } }));
    });

    it('should throw when already VOID', async () => {
      const settlement = makeSettlement({
        settlementId: 'stl-001',
        status: 'VOID',
        periodStart: new Date('2026-03-01'),
        periodEnd: new Date('2026-03-15'),
        deductions: [],
      });
      prisma.settlement.findFirst.mockResolvedValue(settlement);

      await expect(service.voidSettlement(tenantId, 'stl-001')).rejects.toThrow('Settlement is already voided');
    });

    it('should throw when PAID', async () => {
      const settlement = makeSettlement({
        settlementId: 'stl-001',
        status: 'PAID',
        periodStart: new Date('2026-03-01'),
        periodEnd: new Date('2026-03-15'),
        deductions: [],
      });
      prisma.settlement.findFirst.mockResolvedValue(settlement);

      await expect(service.voidSettlement(tenantId, 'stl-001')).rejects.toThrow('Cannot void a paid settlement');
    });
  });

  // ─── addDeduction ───────────────────────────────────────────

  describe('addDeduction', () => {
    it('should add deduction and update netPay', async () => {
      const settlement = makeSettlement({
        settlementId: 'stl-001',
        status: 'DRAFT',
        grossPayCents: 100000,
        deductionsCents: 5000,
        netPayCents: 95000,
        periodStart: new Date('2026-03-01'),
        periodEnd: new Date('2026-03-15'),
        deductions: [],
      });
      prisma.settlement.findFirst.mockResolvedValue(settlement);
      prisma.settlementDeduction.create.mockResolvedValue({ id: 1 });
      prisma.settlement.update.mockResolvedValue({});

      await service.addDeduction(tenantId, 'stl-001', {
        type: 'FUEL_ADVANCE',
        description: 'Fuel advance',
        amountCents: 3000,
      });

      // $transaction receives array of promises
      const txArray = prisma.$transaction.mock.calls[0][0];
      expect(txArray).toHaveLength(2);
    });

    it('should throw when settlement is not DRAFT', async () => {
      const settlement = makeSettlement({
        settlementId: 'stl-001',
        status: 'APPROVED',
        periodStart: new Date('2026-03-01'),
        periodEnd: new Date('2026-03-15'),
        deductions: [],
      });
      prisma.settlement.findFirst.mockResolvedValue(settlement);

      await expect(
        service.addDeduction(tenantId, 'stl-001', {
          type: 'OTHER',
          description: 'x',
          amountCents: 1000,
        }),
      ).rejects.toThrow('Can only add deductions to draft settlements');
    });
  });

  // ─── batchCalculate ─────────────────────────────────────────

  describe('batchCalculate', () => {
    it('should report successes and errors separately', async () => {
      const driver = driverWithPayStructure();
      prisma.driver.findFirst.mockResolvedValueOnce(driver).mockResolvedValueOnce(null); // second driver not found
      prisma.load.findMany.mockResolvedValue([loadWithRoute(500)]);
      prisma.settlement.findFirst.mockResolvedValue(null);
      prisma.settlement.count.mockResolvedValue(0);
      prisma.settlement.create.mockImplementation(async (args: any) => ({
        ...makeSettlement(),
        ...args.data,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        lineItems: [],
        driver,
      }));

      const result = await service.batchCalculate(tenantId, {
        driverIds: ['drv-1', 'drv-2'],
        periodStart,
        periodEnd,
      });

      expect(result.successCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.total).toBe(2);
    });
  });

  // ─── batchApprove ──────────────────────────────────────────

  describe('batchApprove', () => {
    it('should approve multiple DRAFT settlements', async () => {
      prisma.settlement.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.batchApprove(tenantId, ['stl-1', 'stl-2'], 42);

      expect(result.approved).toBe(2);
      expect(result.skipped).toBe(0);
      expect(prisma.settlement.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'DRAFT',
          }),
          data: expect.objectContaining({
            status: 'APPROVED',
            approvedBy: 42,
          }),
        }),
      );
    });

    it('should report skipped non-DRAFT settlements', async () => {
      prisma.settlement.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.batchApprove(tenantId, ['stl-1', 'stl-2']);

      expect(result.approved).toBe(1);
      expect(result.skipped).toBe(1);
    });
  });

  // ─── batchPay ──────────────────────────────────────────────

  describe('batchPay', () => {
    it('should mark approved settlements as paid', async () => {
      prisma.settlement.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.batchPay(tenantId, ['stl-1', 'stl-2', 'stl-3']);

      expect(result.paid).toBe(3);
      expect(result.skipped).toBe(0);
    });

    it('should report skipped non-APPROVED settlements', async () => {
      prisma.settlement.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.batchPay(tenantId, ['stl-1']);

      expect(result.paid).toBe(0);
      expect(result.skipped).toBe(1);
    });
  });

  // ─── batchVoid ─────────────────────────────────────────────

  describe('batchVoid', () => {
    it('should void non-VOID, non-PAID settlements', async () => {
      prisma.settlement.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.batchVoid(tenantId, ['stl-1', 'stl-2']);

      expect(result.voided).toBe(2);
      expect(result.skipped).toBe(0);
    });
  });

  // ─── getSummary ────────────────────────────────────────────

  describe('getSummary', () => {
    it('should return summary stats', async () => {
      prisma.settlement.aggregate = jest
        .fn()
        .mockResolvedValueOnce({ _count: 3, _sum: { netPayCents: 150000 } })
        .mockResolvedValueOnce({ _count: 2, _sum: { netPayCents: 100000 } })
        .mockResolvedValueOnce({ _sum: { netPayCents: 200000 } })
        .mockResolvedValueOnce({ _avg: { netPayCents: 75000 } });
      prisma.settlement.groupBy.mockResolvedValue([{ driverId: 1 }, { driverId: 2 }]);

      const result = await service.getSummary(tenantId);

      expect(result.pendingApproval).toBe(3);
      expect(result.pendingApprovalCents).toBe(150000);
      expect(result.readyToPay).toBe(2);
      expect(result.readyToPayCents).toBe(100000);
      expect(result.paidThisMonthCents).toBe(200000);
      expect(result.activeDrivers).toBe(2);
      expect(result.avgSettlementCents).toBe(75000);
    });

    it('should handle null aggregates', async () => {
      prisma.settlement.aggregate = jest
        .fn()
        .mockResolvedValueOnce({ _count: 0, _sum: { netPayCents: null } })
        .mockResolvedValueOnce({ _count: 0, _sum: { netPayCents: null } })
        .mockResolvedValueOnce({ _sum: { netPayCents: null } })
        .mockResolvedValueOnce({ _avg: { netPayCents: null } });
      prisma.settlement.groupBy.mockResolvedValue([]);

      const result = await service.getSummary(tenantId);

      expect(result.pendingApprovalCents).toBe(0);
      expect(result.readyToPayCents).toBe(0);
      expect(result.paidThisMonthCents).toBe(0);
      expect(result.activeDrivers).toBe(0);
      expect(result.avgSettlementCents).toBe(0);
    });
  });

  // ─── updateNotes ───────────────────────────────────────────

  describe('updateNotes', () => {
    it('should update settlement notes', async () => {
      const settlement = makeSettlement({
        settlementId: 'stl-001',
        periodStart: new Date('2026-03-01'),
        periodEnd: new Date('2026-03-15'),
        deductions: [],
      });
      prisma.settlement.findFirst.mockResolvedValue(settlement);
      prisma.settlement.update.mockResolvedValue({
        ...settlement,
        notes: 'Updated notes',
      });

      await service.updateNotes(tenantId, 'stl-001', 'Updated notes');

      expect(prisma.settlement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { notes: 'Updated notes' },
        }),
      );
    });
  });

  // ─── previewBatch ───────────────────────────────────────────

  describe('previewBatch', () => {
    it('should return driver eligibility and estimated pay', async () => {
      const driver = driverWithPayStructure({
        type: 'PER_MILE',
        ratePerMileCents: 55,
      });
      prisma.driver.findMany.mockResolvedValue([driver]);
      prisma.load.findMany.mockResolvedValue([loadWithRoute(500)]);

      const result = await service.previewBatch(tenantId, {
        periodStart,
        periodEnd,
      });

      expect(result.drivers).toHaveLength(1);
      expect(result.drivers[0].eligible).toBe(true);
      expect(result.drivers[0].loadCount).toBe(1);
      expect(result.drivers[0].estimatedPayCents).toBe(Math.round(500 * 55));
    });

    it('should mark driver as ineligible when no pay structure', async () => {
      prisma.driver.findMany.mockResolvedValue([makeDriver({ payStructure: null })]);

      const result = await service.previewBatch(tenantId, {
        periodStart,
        periodEnd,
      });

      expect(result.drivers[0].eligible).toBe(false);
      expect(result.drivers[0].warning).toBe('No pay structure configured');
    });

    it('should mark driver as ineligible when no delivered loads', async () => {
      const driver = driverWithPayStructure();
      prisma.driver.findMany.mockResolvedValue([driver]);
      prisma.load.findMany.mockResolvedValue([]);

      const result = await service.previewBatch(tenantId, {
        periodStart,
        periodEnd,
      });

      expect(result.drivers[0].eligible).toBe(false);
      expect(result.drivers[0].warning).toBe('No delivered loads in period');
    });

    it('should calculate PERCENTAGE pay in preview', async () => {
      const driver = driverWithPayStructure({
        type: 'PERCENTAGE',
        percentage: 25,
      });
      prisma.driver.findMany.mockResolvedValue([driver]);
      prisma.load.findMany.mockResolvedValue([loadWithRoute(800, 400000)]);

      const result = await service.previewBatch(tenantId, {
        periodStart,
        periodEnd,
      });

      expect(result.drivers[0].estimatedPayCents).toBe(Math.round((400000 * 25) / 100));
    });

    it('should calculate FLAT_RATE pay in preview', async () => {
      const driver = driverWithPayStructure({
        type: 'FLAT_RATE',
        flatRateCents: 50000,
      });
      prisma.driver.findMany.mockResolvedValue([driver]);
      prisma.load.findMany.mockResolvedValue([loadWithRoute(800), loadWithRoute(600)]);

      const result = await service.previewBatch(tenantId, {
        periodStart,
        periodEnd,
      });

      expect(result.drivers[0].estimatedPayCents).toBe(100000);
    });

    it('should calculate HYBRID pay in preview', async () => {
      const driver = driverWithPayStructure({
        type: 'HYBRID',
        hybridBaseCents: 10000,
        hybridPercent: 10,
      });
      prisma.driver.findMany.mockResolvedValue([driver]);
      prisma.load.findMany.mockResolvedValue([loadWithRoute(800, 300000)]);

      const result = await service.previewBatch(tenantId, {
        periodStart,
        periodEnd,
      });

      // 10000 + round(300000 * 10/100) = 40000
      expect(result.drivers[0].estimatedPayCents).toBe(40000);
    });
  });

  // ─── findAll with search and sort ──────────────────────────

  describe('findAll advanced filters', () => {
    it('should filter by period start and end', async () => {
      prisma.settlement.findMany.mockResolvedValue([]);

      await service.findAll(tenantId, {
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
      });

      const call = prisma.settlement.findMany.mock.calls[0][0];
      expect(call.where.periodStart).toEqual({
        gte: new Date('2026-01-01'),
      });
      expect(call.where.periodEnd).toEqual({
        lte: new Date('2026-01-31'),
      });
    });

    it('should apply search filter', async () => {
      prisma.settlement.findMany.mockResolvedValue([]);

      await service.findAll(tenantId, { search: 'STL-2026' });

      const call = prisma.settlement.findMany.mock.calls[0][0];
      expect(call.where.OR).toHaveLength(2);
    });

    it('should sort by netPay', async () => {
      prisma.settlement.findMany.mockResolvedValue([]);

      await service.findAll(tenantId, {
        sortBy: 'netPay',
        sortOrder: 'asc',
      });

      const call = prisma.settlement.findMany.mock.calls[0][0];
      expect(call.orderBy).toEqual({ netPayCents: 'asc' });
    });

    it('should sort by driverName', async () => {
      prisma.settlement.findMany.mockResolvedValue([]);

      await service.findAll(tenantId, {
        sortBy: 'driverName',
        sortOrder: 'desc',
      });

      const call = prisma.settlement.findMany.mock.calls[0][0];
      expect(call.orderBy).toEqual({ driver: { name: 'desc' } });
    });

    it('should default to createdAt desc when sortBy is unknown', async () => {
      prisma.settlement.findMany.mockResolvedValue([]);

      await service.findAll(tenantId, { sortBy: 'unknownField' });

      const call = prisma.settlement.findMany.mock.calls[0][0];
      expect(call.orderBy).toEqual({ createdAt: 'desc' });
    });
  });

  // ─── getSummary with period filters ────────────────────────

  describe('getSummary with filters', () => {
    it('should apply period filters to summary queries', async () => {
      prisma.settlement.aggregate = jest
        .fn()
        .mockResolvedValueOnce({ _count: 0, _sum: { netPayCents: null } })
        .mockResolvedValueOnce({ _count: 0, _sum: { netPayCents: null } })
        .mockResolvedValueOnce({ _sum: { netPayCents: null } })
        .mockResolvedValueOnce({ _avg: { netPayCents: null } });
      prisma.settlement.groupBy.mockResolvedValue([]);

      await service.getSummary(tenantId, {
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
      });

      // Verify aggregate was called with period filters
      expect(prisma.settlement.aggregate).toHaveBeenCalledTimes(4);
    });
  });

  // ─── markPaid with driver notification ─────────────────────

  describe('markPaid with driver notification', () => {
    it('should notify driver when driver user exists', async () => {
      const settlement = makeSettlement({
        settlementId: 'stl-001',
        status: 'APPROVED',
        periodStart: new Date('2026-03-01'),
        periodEnd: new Date('2026-03-15'),
        deductions: [],
      });
      prisma.settlement.findFirst.mockResolvedValue(settlement);
      prisma.settlement.update.mockResolvedValue({
        ...settlement,
        status: 'PAID',
        driver: makeDriver(),
      });
      prisma.user.findFirst.mockResolvedValue({ id: 99 });

      await service.markPaid(tenantId, 'stl-001');

      expect(notificationTriggers.driverPaymentProcessed).toHaveBeenCalledWith(
        tenantId,
        99,
        settlement.settlementNumber,
        expect.any(String),
      );
    });
  });

  // ─── removeDeduction ───────────────────────────────────────

  describe('removeDeduction', () => {
    it('should remove deduction and update totals', async () => {
      const settlement = makeSettlement({
        settlementId: 'stl-001',
        status: 'DRAFT',
        grossPayCents: 100000,
        deductionsCents: 5000,
        netPayCents: 95000,
        periodStart: new Date('2026-03-01'),
        periodEnd: new Date('2026-03-15'),
        deductions: [{ id: 1, amountCents: 3000 }],
      });
      prisma.settlement.findFirst.mockResolvedValue(settlement);
      prisma.$transaction.mockResolvedValue([]);

      await service.removeDeduction(tenantId, 'stl-001', 1);

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should throw when deduction not found', async () => {
      const settlement = makeSettlement({
        settlementId: 'stl-001',
        status: 'DRAFT',
        periodStart: new Date('2026-03-01'),
        periodEnd: new Date('2026-03-15'),
        deductions: [],
      });
      prisma.settlement.findFirst.mockResolvedValue(settlement);

      await expect(service.removeDeduction(tenantId, 'stl-001', 999)).rejects.toThrow('Deduction not found');
    });

    it('should throw when settlement is not DRAFT', async () => {
      const settlement = makeSettlement({
        settlementId: 'stl-001',
        status: 'APPROVED',
        periodStart: new Date('2026-03-01'),
        periodEnd: new Date('2026-03-15'),
        deductions: [{ id: 1, amountCents: 3000 }],
      });
      prisma.settlement.findFirst.mockResolvedValue(settlement);

      await expect(service.removeDeduction(tenantId, 'stl-001', 1)).rejects.toThrow(
        'Can only remove deductions from draft settlements',
      );
    });
  });

  // ─── Phase 4C — driver pay timing gate ──────────────────────────────────

  describe('calculate — driver pay timing gate (Phase 4C)', () => {
    const driverId = 'drv-test-001';

    function setupCalculateBaseline() {
      const driver = driverWithPayStructure({ type: 'PER_MILE', ratePerMileCents: 55 });
      prisma.driver.findFirst.mockResolvedValue(driver);
      prisma.load.findMany.mockResolvedValue([loadWithRoute(800)]);
      prisma.settlement.findFirst.mockResolvedValue(null);
      prisma.settlement.count.mockResolvedValue(0);
      prisma.settlement.create.mockImplementation(async (args: any) => ({
        ...makeSettlement(),
        ...args.data,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        lineItems: [],
        driver,
      }));
    }

    it('does NOT gate when tenant.driverPayTiming = ON_DELIVERY (default)', async () => {
      setupCalculateBaseline();
      prisma.tenant.findUnique.mockResolvedValue({
        driverPayTiming: 'ON_DELIVERY',
      });
      // Even if invoice query were called, return empty — but it shouldn't be called.
      prisma.invoice.findMany.mockResolvedValue([]);

      await expect(service.calculate(tenantId, { driverId, periodStart, periodEnd })).resolves.toBeDefined();
      // Gate only runs when ON_FACTOR_FUND
      expect(prisma.invoice.findMany).not.toHaveBeenCalled();
    });

    it('BLOCKS with clear error when ON_FACTOR_FUND + advance not received', async () => {
      setupCalculateBaseline();
      prisma.tenant.findUnique.mockResolvedValue({
        driverPayTiming: 'ON_FACTOR_FUND',
      });
      prisma.invoice.findMany.mockResolvedValue([{ invoiceNumber: 'INV-001', loadId: 1 }]);

      await expect(service.calculate(tenantId, { driverId, periodStart, periodEnd })).rejects.toThrow(
        /not yet funded by factor/,
      );
      expect(prisma.settlement.create).not.toHaveBeenCalled();
    });

    it('passes through when ON_FACTOR_FUND + all advances received', async () => {
      setupCalculateBaseline();
      prisma.tenant.findUnique.mockResolvedValue({
        driverPayTiming: 'ON_FACTOR_FUND',
      });
      // Empty array = no factored invoices missing advance.
      prisma.invoice.findMany.mockResolvedValue([]);

      await expect(service.calculate(tenantId, { driverId, periodStart, periodEnd })).resolves.toBeDefined();
      expect(prisma.settlement.create).toHaveBeenCalled();
    });
  });
});

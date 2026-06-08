import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CloseOutService } from '../close-out.service';
import { BillingReadinessService } from '../billing-readiness.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { LoadEventsService } from '../../../fleet/loads/services/load-events.service';
import { createMockPrisma, createMockCache } from '../../../../test/mocks';
import { makeDeliveredLoad } from '../../../../test/factories';

describe('CloseOutService', () => {
  let service: CloseOutService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let cache: ReturnType<typeof createMockCache>;
  let readinessService: { evaluate: jest.Mock };
  let loadEventsService: { logEvent: jest.Mock };
  let domainEventService: { emit: jest.Mock };

  beforeEach(async () => {
    prisma = createMockPrisma();
    cache = createMockCache();
    readinessService = { evaluate: jest.fn() };
    loadEventsService = { logEvent: jest.fn().mockResolvedValue(undefined) };
    domainEventService = { emit: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CloseOutService,
        { provide: PrismaService, useValue: prisma },
        { provide: SallyCacheService, useValue: cache },
        { provide: BillingReadinessService, useValue: readinessService },
        { provide: LoadEventsService, useValue: loadEventsService },
        { provide: DomainEventService, useValue: domainEventService },
      ],
    }).compile();

    service = module.get<CloseOutService>(CloseOutService);
  });

  const tenantId = 1;

  // ─── getSummary ──────────────────────────────────────────────

  describe('getSummary', () => {
    it('should aggregate counts by billing status', async () => {
      prisma.fleetOperationsSettings.findUnique.mockResolvedValue({
        podGracePeriodHours: 48,
      });
      prisma.load.count
        .mockResolvedValueOnce(3) // PENDING_DOCUMENTS
        .mockResolvedValueOnce(5) // READY_FOR_REVIEW
        .mockResolvedValueOnce(2) // APPROVED
        .mockResolvedValueOnce(1); // overdue PODs
      prisma.loadCharge.aggregate.mockResolvedValue({
        _sum: { totalCents: 500000 },
      });

      const result = await service.getSummary(tenantId);

      expect(result.needsDocs).toBe(3);
      expect(result.readyForReview).toBe(5);
      expect(result.readyToBill).toBe(2);
      expect(result.readyToBillTotalCents).toBe(500000);
      expect(result.overduePods).toBe(1);
      expect(result.total).toBe(10); // 3 + 5 + 2
    });

    it('should default podGracePeriodHours to 48 when no settings', async () => {
      prisma.fleetOperationsSettings.findUnique.mockResolvedValue(null);
      prisma.load.count.mockResolvedValue(0);
      prisma.loadCharge.aggregate.mockResolvedValue({
        _sum: { totalCents: null },
      });

      const result = await service.getSummary(tenantId);

      expect(result.readyToBillTotalCents).toBe(0);
    });
  });

  // ─── list ───────────────────────────────────────────────────

  describe('list', () => {
    it('should return delivered loads in close-out queue', async () => {
      const load = makeDeliveredLoad({
        billingStatus: 'READY_FOR_REVIEW',
        charges: [{ totalCents: 100000 }],
        driver: { name: 'John' },
        vehicle: { unitNumber: 'T-001' },
        stops: [],
      });
      prisma.load.findMany.mockResolvedValue([load]);
      prisma.load.count.mockResolvedValue(1);

      const result = await service.list(tenantId);

      expect(result.loads).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.loads[0].chargeTotalCents).toBe(100000);
    });

    it('should throw BadRequestException for invalid billingStatus filter', async () => {
      await expect(service.list(tenantId, { billingStatus: 'INVALID' })).rejects.toThrow(BadRequestException);
    });

    it('should clamp pagination to max 100', async () => {
      prisma.load.findMany.mockResolvedValue([]);
      prisma.load.count.mockResolvedValue(0);

      await service.list(tenantId, { limit: 200 });

      const call = prisma.load.findMany.mock.calls[0][0];
      expect(call.take).toBe(100);
    });

    it('should apply search filter', async () => {
      prisma.load.findMany.mockResolvedValue([]);
      prisma.load.count.mockResolvedValue(0);

      await service.list(tenantId, { search: 'LD-1001' });

      const call = prisma.load.findMany.mock.calls[0][0];
      expect(call.where.OR).toHaveLength(3);
    });
  });

  // ─── approveForBilling ──────────────────────────────────────

  describe('approveForBilling', () => {
    it('should approve load when readiness score is 100', async () => {
      const load = makeDeliveredLoad({
        loadNumber: 'ld-001',
        billingStatus: 'READY_FOR_REVIEW',
      });
      prisma.load.findFirst.mockResolvedValue(load);
      readinessService.evaluate.mockResolvedValue({
        score: 100,
        overrideAllowed: false,
        items: [],
      });
      prisma.load.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.approveForBilling(tenantId, 'ld-001');

      expect(result.billingStatus).toBe('APPROVED');
      expect(prisma.load.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { billingStatus: 'APPROVED' },
        }),
      );
      expect(domainEventService.emit).toHaveBeenCalled();
    });

    it('should throw when load not found', async () => {
      prisma.load.findFirst.mockResolvedValue(null);
      await expect(service.approveForBilling(tenantId, 'missing')).rejects.toThrow(NotFoundException);
    });

    it('should throw when load not delivered', async () => {
      prisma.load.findFirst.mockResolvedValue(makeDeliveredLoad({ loadNumber: 'ld-001', status: 'IN_TRANSIT' }));
      await expect(service.approveForBilling(tenantId, 'ld-001')).rejects.toThrow(
        'Load must be delivered to approve for billing',
      );
    });

    it('should throw when load already INVOICED', async () => {
      prisma.load.findFirst.mockResolvedValue(makeDeliveredLoad({ loadNumber: 'ld-001', billingStatus: 'INVOICED' }));
      await expect(service.approveForBilling(tenantId, 'ld-001')).rejects.toThrow('Load is already invoiced');
    });

    it('should throw when load already APPROVED', async () => {
      prisma.load.findFirst.mockResolvedValue(makeDeliveredLoad({ loadNumber: 'ld-001', billingStatus: 'APPROVED' }));
      await expect(service.approveForBilling(tenantId, 'ld-001')).rejects.toThrow('Load is already approved');
    });

    it('should throw when readiness < 100 and no override reason', async () => {
      prisma.load.findFirst.mockResolvedValue(
        makeDeliveredLoad({
          loadNumber: 'ld-001',
          billingStatus: 'PENDING_DOCUMENTS',
        }),
      );
      readinessService.evaluate.mockResolvedValue({
        score: 50,
        overrideAllowed: true,
        items: [
          {
            type: 'POD',
            label: 'Proof of Delivery',
            enforcement: 'required',
            status: 'missing',
          },
        ],
      });

      await expect(service.approveForBilling(tenantId, 'ld-001')).rejects.toThrow(/Cannot approve: missing/);
    });

    it('should allow override when readiness < 100, override allowed, and reason given', async () => {
      const load = makeDeliveredLoad({
        loadNumber: 'ld-001',
        billingStatus: 'PENDING_DOCUMENTS',
      });
      prisma.load.findFirst.mockResolvedValue(load);
      readinessService.evaluate.mockResolvedValue({
        score: 50,
        overrideAllowed: true,
        items: [
          {
            type: 'POD',
            label: 'Proof of Delivery',
            enforcement: 'required',
            status: 'missing',
          },
        ],
      });
      prisma.billingOverride.create.mockResolvedValue({});
      prisma.load.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.approveForBilling(
        tenantId,
        'ld-001',
        42, // userId
        'Customer confirmed delivery verbally',
      );

      expect(result.billingStatus).toBe('APPROVED');
      expect(prisma.billingOverride.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            overriddenBy: 42,
            reason: 'Customer confirmed delivery verbally',
          }),
        }),
      );
    });

    it('should throw when optimistic lock fails (status changed concurrently)', async () => {
      const load = makeDeliveredLoad({
        loadNumber: 'ld-001',
        billingStatus: 'READY_FOR_REVIEW',
      });
      prisma.load.findFirst.mockResolvedValue(load);
      readinessService.evaluate.mockResolvedValue({ score: 100, items: [] });
      prisma.load.updateMany.mockResolvedValue({ count: 0 }); // concurrent change

      await expect(service.approveForBilling(tenantId, 'ld-001')).rejects.toThrow('Load status changed');
    });
  });

  // ─── list with date filters ─────────────────────────────────

  describe('list with date filters', () => {
    it('should apply dateFrom and dateTo filters', async () => {
      prisma.load.findMany.mockResolvedValue([]);
      prisma.load.count.mockResolvedValue(0);

      await service.list(tenantId, {
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
      });

      const call = prisma.load.findMany.mock.calls[0][0];
      expect(call.where.deliveredAt.gte).toEqual(new Date('2026-01-01'));
      expect(call.where.deliveredAt.lte).toBeDefined();
    });

    it('should apply only dateFrom when dateTo is absent', async () => {
      prisma.load.findMany.mockResolvedValue([]);
      prisma.load.count.mockResolvedValue(0);

      await service.list(tenantId, { dateFrom: '2026-01-01' });

      const call = prisma.load.findMany.mock.calls[0][0];
      expect(call.where.deliveredAt.gte).toEqual(new Date('2026-01-01'));
      expect(call.where.deliveredAt.lte).toBeUndefined();
    });

    it('should enforce minimum limit of 1', async () => {
      prisma.load.findMany.mockResolvedValue([]);
      prisma.load.count.mockResolvedValue(0);

      await service.list(tenantId, { limit: 0 });

      const call = prisma.load.findMany.mock.calls[0][0];
      expect(call.take).toBe(1);
    });

    it('should enforce minimum offset of 0', async () => {
      prisma.load.findMany.mockResolvedValue([]);
      prisma.load.count.mockResolvedValue(0);

      await service.list(tenantId, { offset: -5 });

      const call = prisma.load.findMany.mock.calls[0][0];
      expect(call.skip).toBe(0);
    });

    it('should filter by valid billingStatus', async () => {
      prisma.load.findMany.mockResolvedValue([]);
      prisma.load.count.mockResolvedValue(0);

      await service.list(tenantId, { billingStatus: 'APPROVED' });

      const call = prisma.load.findMany.mock.calls[0][0];
      expect(call.where.billingStatus).toBe('APPROVED');
    });
  });

  // ─── approveForBilling edge cases ──────────────────────────

  describe('approveForBilling edge cases', () => {
    it('should throw when readiness < 100 and override not allowed', async () => {
      const load = makeDeliveredLoad({
        loadNumber: 'ld-001',
        billingStatus: 'PENDING_DOCUMENTS',
      });
      prisma.load.findFirst.mockResolvedValue(load);
      readinessService.evaluate.mockResolvedValue({
        score: 50,
        overrideAllowed: false,
        items: [
          {
            type: 'POD',
            label: 'Proof of Delivery',
            enforcement: 'required',
            status: 'missing',
          },
        ],
      });

      await expect(service.approveForBilling(tenantId, 'ld-001', 42, 'override reason')).rejects.toThrow(
        /Cannot approve: missing/,
      );
    });

    it('should throw when override is allowed but no userId', async () => {
      const load = makeDeliveredLoad({
        loadNumber: 'ld-001',
        billingStatus: 'PENDING_DOCUMENTS',
      });
      prisma.load.findFirst.mockResolvedValue(load);
      readinessService.evaluate.mockResolvedValue({
        score: 50,
        overrideAllowed: true,
        items: [
          {
            type: 'POD',
            label: 'Proof of Delivery',
            enforcement: 'required',
            status: 'missing',
          },
        ],
      });

      await expect(service.approveForBilling(tenantId, 'ld-001', undefined, 'override reason')).rejects.toThrow(
        'User ID is required for billing override',
      );
    });
  });

  // ─── sendBack ───────────────────────────────────────────────

  describe('sendBack', () => {
    it('should send APPROVED load back to READY_FOR_REVIEW', async () => {
      const load = makeDeliveredLoad({
        loadNumber: 'ld-001',
        billingStatus: 'APPROVED',
      });
      prisma.load.findFirst.mockResolvedValue(load);
      prisma.load.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.sendBack(tenantId, 'ld-001', 'Charges incorrect');

      expect(result.billingStatus).toBe('READY_FOR_REVIEW');
      expect(domainEventService.emit).toHaveBeenCalled();
    });

    it('should throw when load is INVOICED', async () => {
      prisma.load.findFirst.mockResolvedValue(makeDeliveredLoad({ loadNumber: 'ld-001', billingStatus: 'INVOICED' }));
      await expect(service.sendBack(tenantId, 'ld-001', 'reason')).rejects.toThrow(
        'Cannot send back: invoice already generated',
      );
    });

    it('should throw when load is not APPROVED', async () => {
      prisma.load.findFirst.mockResolvedValue(
        makeDeliveredLoad({
          loadNumber: 'ld-001',
          billingStatus: 'READY_FOR_REVIEW',
        }),
      );
      await expect(service.sendBack(tenantId, 'ld-001', 'reason')).rejects.toThrow('Load is not in approved status');
    });

    it('should throw when load not found', async () => {
      prisma.load.findFirst.mockResolvedValue(null);
      await expect(service.sendBack(tenantId, 'missing', 'reason')).rejects.toThrow(NotFoundException);
    });

    it('should throw when optimistic lock fails on sendBack', async () => {
      const load = makeDeliveredLoad({
        loadNumber: 'ld-001',
        billingStatus: 'APPROVED',
      });
      prisma.load.findFirst.mockResolvedValue(load);
      prisma.load.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.sendBack(tenantId, 'ld-001', 'Charges incorrect')).rejects.toThrow('Load status changed');
    });
  });

  // ─── formatCloseOutLoad ────────────────────────────────────

  describe('list formatting', () => {
    it('should format load with null charges, stops, driver, and vehicle', async () => {
      const load = makeDeliveredLoad({
        billingStatus: 'READY_FOR_REVIEW',
        charges: null,
        driver: null,
        vehicle: null,
        stops: null,
        deliveredAt: new Date('2026-03-15'),
      });
      prisma.load.findMany.mockResolvedValue([load]);
      prisma.load.count.mockResolvedValue(1);

      const result = await service.list(tenantId);

      expect(result.loads[0].chargeTotalCents).toBe(0);
      expect(result.loads[0].driverName).toBeNull();
      expect(result.loads[0].vehicleNumber).toBeNull();
      expect(result.loads[0].stops).toEqual([]);
      expect(result.loads[0].charges).toEqual([]);
    });

    it('should format stops and charges correctly', async () => {
      const load = makeDeliveredLoad({
        billingStatus: 'READY_FOR_REVIEW',
        charges: [
          {
            id: 1,
            chargeType: 'linehaul',
            description: 'LH',
            quantity: 1,
            unitPriceCents: 200000,
            totalCents: 200000,
            isBillable: true,
            isPayable: false,
          },
        ],
        driver: { name: 'John' },
        vehicle: { unitNumber: 'T-100' },
        stops: [
          {
            id: 1,
            sequenceOrder: 0,
            actionType: 'pickup',
            status: 'completed',
            completedAt: new Date('2026-03-14'),
          },
        ],
        deliveredAt: new Date('2026-03-15'),
      });
      prisma.load.findMany.mockResolvedValue([load]);
      prisma.load.count.mockResolvedValue(1);

      const result = await service.list(tenantId);

      expect(result.loads[0].chargeTotalCents).toBe(200000);
      expect(result.loads[0].driverName).toBe('John');
      expect(result.loads[0].vehicleNumber).toBe('T-100');
      expect(result.loads[0].stops).toHaveLength(1);
      expect(result.loads[0].charges).toHaveLength(1);
    });
  });
});

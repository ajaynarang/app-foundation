import { Test, TestingModule } from '@nestjs/testing';
import { BillingReadinessService } from '../billing-readiness.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { NotFoundException } from '@nestjs/common';

describe('BillingReadinessService', () => {
  let service: BillingReadinessService;
  let prisma: {
    load: { findFirst: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    document: { findMany: jest.Mock };
    fleetOperationsSettings: { findUnique: jest.Mock };
    billingOverride: { findFirst: jest.Mock };
  };

  const defaultSettings = {
    bolEnforcement: 'required',
    podEnforcement: 'required',
    rateConEnforcement: 'recommended',
    lumperReceiptEnforcement: 'when_applicable',
    scaleTicketEnforcement: 'not_required',
    podGracePeriodHours: 48,
    requireBillableCharge: true,
    allowBillingOverride: false,
  };

  beforeEach(async () => {
    prisma = {
      load: {
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      document: { findMany: jest.fn() },
      fleetOperationsSettings: { findUnique: jest.fn() },
      billingOverride: { findFirst: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingReadinessService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: DomainEventService,
          useValue: { emit: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<BillingReadinessService>(BillingReadinessService);
  });

  describe('evaluate', () => {
    it('should throw NotFoundException when load not found', async () => {
      prisma.load.findFirst.mockResolvedValue(null);
      await expect(service.evaluate('LD-NOTFOUND', 1)).rejects.toThrow(NotFoundException);
    });

    it('should return 100% score when no required items and no stops', async () => {
      prisma.load.findFirst.mockResolvedValue({
        id: 1,
        loadNumber: 'LD-0001',
        tenantId: 1,
        status: 'DELIVERED',
        billingStatus: 'PENDING_DOCUMENTS',
        stops: [],
        charges: [],
      });
      prisma.document.findMany.mockResolvedValue([]);
      prisma.fleetOperationsSettings.findUnique.mockResolvedValue({
        ...defaultSettings,
        bolEnforcement: 'not_required',
        podEnforcement: 'not_required',
        rateConEnforcement: 'not_required',
        lumperReceiptEnforcement: 'not_required',
        requireBillableCharge: false,
      });
      prisma.billingOverride.findFirst.mockResolvedValue(null);

      const result = await service.evaluate('LD-0001', 1);
      expect(result.score).toBe(100);
      expect(result.readyToApprove).toBe(true);
    });

    it('should include BOL as required when enforcement is required and stop is completed pickup', async () => {
      prisma.load.findFirst.mockResolvedValue({
        id: 1,
        loadNumber: 'LD-0001',
        tenantId: 1,
        status: 'DELIVERED',
        billingStatus: 'PENDING_DOCUMENTS',
        stops: [
          {
            id: 10,
            actionType: 'pickup',
            status: 'COMPLETED',
            sequenceOrder: 1,
            stop: { name: 'Walmart DC' },
            completedAt: new Date(),
          },
        ],
        charges: [
          {
            id: 1,
            chargeType: 'linehaul',
            isBillable: true,
            totalCents: 250000,
          },
        ],
      });
      prisma.document.findMany.mockResolvedValue([]);
      prisma.fleetOperationsSettings.findUnique.mockResolvedValue(defaultSettings);
      prisma.billingOverride.findFirst.mockResolvedValue(null);

      const result = await service.evaluate('LD-0001', 1);
      const bolItem = result.items.find((i) => i.type === 'bol');
      expect(bolItem).toBeDefined();
      expect(bolItem.enforcement).toBe('required');
      expect(bolItem.status).toBe('missing');
    });

    it('should mark BOL as satisfied when document exists', async () => {
      prisma.load.findFirst.mockResolvedValue({
        id: 1,
        loadNumber: 'LD-0001',
        tenantId: 1,
        status: 'DELIVERED',
        billingStatus: 'PENDING_DOCUMENTS',
        stops: [
          {
            id: 10,
            actionType: 'pickup',
            status: 'COMPLETED',
            sequenceOrder: 1,
            stop: { name: 'Walmart DC' },
            completedAt: new Date(),
          },
        ],
        charges: [
          {
            id: 1,
            chargeType: 'linehaul',
            isBillable: true,
            totalCents: 250000,
          },
        ],
      });
      prisma.document.findMany.mockResolvedValue([
        {
          id: 100,
          documentType: 'bol',
          relatedStopId: 10,
          fileName: 'bol.pdf',
          createdAt: new Date(),
          status: 'CONFIRMED',
        },
      ]);
      prisma.fleetOperationsSettings.findUnique.mockResolvedValue(defaultSettings);
      prisma.billingOverride.findFirst.mockResolvedValue(null);

      const result = await service.evaluate('LD-0001', 1);
      const bolItem = result.items.find((i) => i.type === 'bol');
      expect(bolItem.status).toBe('satisfied');
    });

    it('should mark POD as overdue when past grace period', async () => {
      const pastDeadline = new Date(Date.now() - 72 * 60 * 60 * 1000); // 72h ago
      prisma.load.findFirst.mockResolvedValue({
        id: 1,
        loadNumber: 'LD-0001',
        tenantId: 1,
        status: 'DELIVERED',
        billingStatus: 'PENDING_DOCUMENTS',
        stops: [
          {
            id: 20,
            actionType: 'delivery',
            status: 'COMPLETED',
            sequenceOrder: 2,
            stop: { name: 'Houston DC' },
            completedAt: pastDeadline,
          },
        ],
        charges: [
          {
            id: 1,
            chargeType: 'linehaul',
            isBillable: true,
            totalCents: 250000,
          },
        ],
      });
      prisma.document.findMany.mockResolvedValue([]);
      prisma.fleetOperationsSettings.findUnique.mockResolvedValue(defaultSettings);
      prisma.billingOverride.findFirst.mockResolvedValue(null);

      const result = await service.evaluate('LD-0001', 1);
      const podItem = result.items.find((i) => i.type === 'pod');
      expect(podItem.status).toBe('overdue');
      expect(result.hasBlockers).toBe(true);
    });

    it('should use configured grace period instead of hardcoded 48h', async () => {
      const recentDelivery = new Date(Date.now() - 50 * 60 * 60 * 1000); // 50h ago
      prisma.load.findFirst.mockResolvedValue({
        id: 1,
        loadNumber: 'LD-0001',
        tenantId: 1,
        status: 'DELIVERED',
        billingStatus: 'PENDING_DOCUMENTS',
        stops: [
          {
            id: 20,
            actionType: 'delivery',
            status: 'COMPLETED',
            sequenceOrder: 2,
            stop: { name: 'Houston DC' },
            completedAt: recentDelivery,
          },
        ],
        charges: [
          {
            id: 1,
            chargeType: 'linehaul',
            isBillable: true,
            totalCents: 250000,
          },
        ],
      });
      prisma.document.findMany.mockResolvedValue([]);
      // 72-hour grace period — 50h delivery should NOT be overdue
      prisma.fleetOperationsSettings.findUnique.mockResolvedValue({
        ...defaultSettings,
        podGracePeriodHours: 72,
      });
      prisma.billingOverride.findFirst.mockResolvedValue(null);

      const result = await service.evaluate('LD-0001', 1);
      const podItem = result.items.find((i) => i.type === 'pod');
      expect(podItem.status).toBe('missing'); // NOT overdue — within 72h grace
    });

    it('should include rate_confirmation as recommended when configured', async () => {
      prisma.load.findFirst.mockResolvedValue({
        id: 1,
        loadNumber: 'LD-0001',
        tenantId: 1,
        status: 'DELIVERED',
        billingStatus: 'PENDING_DOCUMENTS',
        stops: [],
        charges: [
          {
            id: 1,
            chargeType: 'linehaul',
            isBillable: true,
            totalCents: 250000,
          },
        ],
      });
      prisma.document.findMany.mockResolvedValue([]);
      prisma.fleetOperationsSettings.findUnique.mockResolvedValue({
        ...defaultSettings,
        lumperReceiptEnforcement: 'not_required',
      });
      prisma.billingOverride.findFirst.mockResolvedValue(null);

      const result = await service.evaluate('LD-0001', 1);
      const rateCon = result.items.find((i) => i.type === 'rate_confirmation');
      expect(rateCon).toBeDefined();
      expect(rateCon.enforcement).toBe('recommended');
      // Recommended items should NOT count toward required total
      expect(result.totalRequired).not.toBeGreaterThan(
        result.items.filter((i) => i.enforcement !== 'recommended').length,
      );
    });

    it('should skip document types with not_required enforcement', async () => {
      prisma.load.findFirst.mockResolvedValue({
        id: 1,
        loadNumber: 'LD-0001',
        tenantId: 1,
        status: 'DELIVERED',
        billingStatus: 'PENDING_DOCUMENTS',
        stops: [],
        charges: [
          {
            id: 1,
            chargeType: 'linehaul',
            isBillable: true,
            totalCents: 250000,
          },
        ],
      });
      prisma.document.findMany.mockResolvedValue([]);
      prisma.fleetOperationsSettings.findUnique.mockResolvedValue({
        ...defaultSettings,
        rateConEnforcement: 'not_required',
      });
      prisma.billingOverride.findFirst.mockResolvedValue(null);

      const result = await service.evaluate('LD-0001', 1);
      const rateCon = result.items.find((i) => i.type === 'rate_confirmation');
      expect(rateCon).toBeUndefined();
    });

    it('should require billable charge when setting enabled', async () => {
      prisma.load.findFirst.mockResolvedValue({
        id: 1,
        loadNumber: 'LD-0001',
        tenantId: 1,
        status: 'DELIVERED',
        billingStatus: 'PENDING_DOCUMENTS',
        stops: [],
        charges: [],
      });
      prisma.document.findMany.mockResolvedValue([]);
      prisma.fleetOperationsSettings.findUnique.mockResolvedValue(defaultSettings);
      prisma.billingOverride.findFirst.mockResolvedValue(null);

      const result = await service.evaluate('LD-0001', 1);
      const chargeItem = result.items.find((i) => i.type === 'billable_charge');
      expect(chargeItem).toBeDefined();
      expect(chargeItem.status).toBe('missing');
      expect(chargeItem.enforcement).toBe('required');
    });

    it('should mark billable charge as satisfied when charge exists', async () => {
      prisma.load.findFirst.mockResolvedValue({
        id: 1,
        loadNumber: 'LD-0001',
        tenantId: 1,
        status: 'DELIVERED',
        billingStatus: 'PENDING_DOCUMENTS',
        stops: [],
        charges: [
          {
            id: 5,
            chargeType: 'linehaul',
            isBillable: true,
            totalCents: 250000,
          },
        ],
      });
      prisma.document.findMany.mockResolvedValue([]);
      prisma.fleetOperationsSettings.findUnique.mockResolvedValue(defaultSettings);
      prisma.billingOverride.findFirst.mockResolvedValue(null);

      const result = await service.evaluate('LD-0001', 1);
      const chargeItem = result.items.find((i) => i.type === 'billable_charge');
      expect(chargeItem.status).toBe('satisfied');
    });

    it('should calculate correct score based on required items only', async () => {
      prisma.load.findFirst.mockResolvedValue({
        id: 1,
        loadNumber: 'LD-0001',
        tenantId: 1,
        status: 'DELIVERED',
        billingStatus: 'PENDING_DOCUMENTS',
        stops: [
          {
            id: 10,
            actionType: 'pickup',
            status: 'COMPLETED',
            sequenceOrder: 1,
            stop: { name: 'Origin' },
            completedAt: new Date(),
          },
          {
            id: 20,
            actionType: 'delivery',
            status: 'COMPLETED',
            sequenceOrder: 2,
            stop: { name: 'Dest' },
            completedAt: new Date(),
          },
        ],
        charges: [
          {
            id: 1,
            chargeType: 'linehaul',
            isBillable: true,
            totalCents: 250000,
          },
        ],
      });
      // Only BOL uploaded — POD missing, charge present
      prisma.document.findMany.mockResolvedValue([
        {
          id: 100,
          documentType: 'bol',
          relatedStopId: 10,
          fileName: 'bol.pdf',
          createdAt: new Date(),
          status: 'CONFIRMED',
        },
      ]);
      prisma.fleetOperationsSettings.findUnique.mockResolvedValue(defaultSettings);
      prisma.billingOverride.findFirst.mockResolvedValue(null);

      const result = await service.evaluate('LD-0001', 1);
      // Required: BOL (satisfied), POD (missing), charge (satisfied) = 2/3 ≈ 67%
      // lumper_receipt is when_applicable but requires a 'lumper' charge — not present, so skipped
      expect(result.totalRequired).toBe(3);
      expect(result.totalSatisfied).toBe(2);
      expect(result.score).toBe(67);
      expect(result.readyToApprove).toBe(false);
    });

    it('should set readyToApprove true when all required items satisfied', async () => {
      prisma.load.findFirst.mockResolvedValue({
        id: 1,
        loadNumber: 'LD-0001',
        tenantId: 1,
        status: 'DELIVERED',
        billingStatus: 'PENDING_DOCUMENTS',
        stops: [
          {
            id: 10,
            actionType: 'pickup',
            status: 'COMPLETED',
            sequenceOrder: 1,
            stop: { name: 'Origin' },
            completedAt: new Date(),
          },
          {
            id: 20,
            actionType: 'delivery',
            status: 'COMPLETED',
            sequenceOrder: 2,
            stop: { name: 'Dest' },
            completedAt: new Date(),
          },
        ],
        charges: [
          {
            id: 1,
            chargeType: 'linehaul',
            isBillable: true,
            totalCents: 250000,
          },
        ],
      });
      prisma.document.findMany.mockResolvedValue([
        {
          id: 100,
          documentType: 'bol',
          relatedStopId: 10,
          fileName: 'bol.pdf',
          createdAt: new Date(),
          status: 'CONFIRMED',
        },
        {
          id: 101,
          documentType: 'pod',
          relatedStopId: 20,
          fileName: 'pod.pdf',
          createdAt: new Date(),
          status: 'CONFIRMED',
        },
      ]);
      prisma.fleetOperationsSettings.findUnique.mockResolvedValue({
        ...defaultSettings,
        lumperReceiptEnforcement: 'not_required',
      });
      prisma.billingOverride.findFirst.mockResolvedValue(null);

      const result = await service.evaluate('LD-0001', 1);
      expect(result.score).toBe(100);
      expect(result.readyToApprove).toBe(true);
    });

    it('should include override info when override exists', async () => {
      prisma.load.findFirst.mockResolvedValue({
        id: 1,
        loadNumber: 'LD-0001',
        tenantId: 1,
        status: 'DELIVERED',
        billingStatus: 'PENDING_DOCUMENTS',
        stops: [],
        charges: [],
      });
      prisma.document.findMany.mockResolvedValue([]);
      prisma.fleetOperationsSettings.findUnique.mockResolvedValue({
        ...defaultSettings,
        requireBillableCharge: false,
      });
      prisma.billingOverride.findFirst.mockResolvedValue({
        overriddenBy: 5,
        reason: 'Cash flow urgent',
        createdAt: new Date(),
        user: { firstName: 'Jane', lastName: 'Doe' },
      });

      const result = await service.evaluate('LD-0001', 1);
      expect(result.overrideExists).toBeDefined();
      expect(result.overrideExists.reason).toBe('Cash flow urgent');
      expect(result.overrideExists.overriddenBy).toBe('Jane Doe');
    });

    it('should evaluate lumper_receipt when enforcement is when_applicable', async () => {
      prisma.load.findFirst.mockResolvedValue({
        id: 1,
        loadNumber: 'LD-0001',
        tenantId: 1,
        status: 'DELIVERED',
        billingStatus: 'PENDING_DOCUMENTS',
        stops: [],
        charges: [
          {
            id: 1,
            chargeType: 'linehaul',
            isBillable: true,
            totalCents: 250000,
          },
          {
            id: 2,
            chargeType: 'lumper',
            isBillable: false,
            totalCents: 5000,
          },
        ],
      });
      prisma.document.findMany.mockResolvedValue([]);
      prisma.fleetOperationsSettings.findUnique.mockResolvedValue(defaultSettings);
      prisma.billingOverride.findFirst.mockResolvedValue(null);

      const result = await service.evaluate('LD-0001', 1);
      const lumperItem = result.items.find((i) => i.type === 'lumper_receipt');
      expect(lumperItem).toBeDefined();
      expect(lumperItem.enforcement).toBe('when_applicable');
      expect(lumperItem.status).toBe('missing');
    });

    it('should NOT evaluate scale_ticket when enforcement is not_required (default)', async () => {
      prisma.load.findFirst.mockResolvedValue({
        id: 1,
        loadNumber: 'LD-0001',
        tenantId: 1,
        status: 'DELIVERED',
        billingStatus: 'PENDING_DOCUMENTS',
        stops: [],
        charges: [
          {
            id: 1,
            chargeType: 'linehaul',
            isBillable: true,
            totalCents: 250000,
          },
        ],
      });
      prisma.document.findMany.mockResolvedValue([]);
      prisma.fleetOperationsSettings.findUnique.mockResolvedValue(defaultSettings);
      prisma.billingOverride.findFirst.mockResolvedValue(null);

      const result = await service.evaluate('LD-0001', 1);
      const scaleItem = result.items.find((i) => i.type === 'scale_ticket');
      expect(scaleItem).toBeUndefined();
    });

    it('should evaluate scale_ticket when tenant overrides enforcement to required', async () => {
      prisma.load.findFirst.mockResolvedValue({
        id: 1,
        loadNumber: 'LD-0001',
        tenantId: 1,
        status: 'DELIVERED',
        billingStatus: 'PENDING_DOCUMENTS',
        stops: [],
        charges: [
          {
            id: 1,
            chargeType: 'linehaul',
            isBillable: true,
            totalCents: 250000,
          },
        ],
      });
      prisma.document.findMany.mockResolvedValue([]);
      prisma.fleetOperationsSettings.findUnique.mockResolvedValue({
        ...defaultSettings,
        scaleTicketEnforcement: 'required',
      });
      prisma.billingOverride.findFirst.mockResolvedValue(null);

      const result = await service.evaluate('LD-0001', 1);
      const scaleItem = result.items.find((i) => i.type === 'scale_ticket');
      expect(scaleItem).toBeDefined();
      expect(scaleItem.enforcement).toBe('required');
      expect(scaleItem.status).toBe('missing');
    });

    it('should handle stop with actionType both for BOL and POD', async () => {
      prisma.load.findFirst.mockResolvedValue({
        id: 1,
        loadNumber: 'LD-0001',
        tenantId: 1,
        status: 'DELIVERED',
        billingStatus: 'PENDING_DOCUMENTS',
        stops: [
          {
            id: 10,
            actionType: 'both',
            status: 'COMPLETED',
            sequenceOrder: 1,
            stop: { name: 'Cross-dock' },
            completedAt: new Date(),
          },
        ],
        charges: [
          {
            id: 1,
            chargeType: 'linehaul',
            isBillable: true,
            totalCents: 250000,
          },
        ],
      });
      prisma.document.findMany.mockResolvedValue([]);
      prisma.fleetOperationsSettings.findUnique.mockResolvedValue(defaultSettings);
      prisma.billingOverride.findFirst.mockResolvedValue(null);

      const result = await service.evaluate('LD-0001', 1);
      const bolItem = result.items.find((i) => i.type === 'bol');
      const podItem = result.items.find((i) => i.type === 'pod');
      expect(bolItem).toBeDefined();
      expect(podItem).toBeDefined();
      expect(bolItem.relatedStopId).toBe(10);
      expect(podItem.relatedStopId).toBe(10);
    });

    it('should report overrideAllowed from settings', async () => {
      prisma.load.findFirst.mockResolvedValue({
        id: 1,
        loadNumber: 'LD-0001',
        tenantId: 1,
        status: 'DELIVERED',
        billingStatus: 'PENDING_DOCUMENTS',
        stops: [],
        charges: [],
      });
      prisma.document.findMany.mockResolvedValue([]);
      prisma.fleetOperationsSettings.findUnique.mockResolvedValue({
        ...defaultSettings,
        allowBillingOverride: true,
        requireBillableCharge: false,
      });
      prisma.billingOverride.findFirst.mockResolvedValue(null);

      const result = await service.evaluate('LD-0001', 1);
      expect(result.overrideAllowed).toBe(true);
    });
  });
});

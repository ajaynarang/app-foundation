import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { DomainEventService } from '../../../../../infrastructure/events/domain-event.service';
import { LoadReversalService } from '../load-reversal.service';
import { LoadEventsService } from '../load-events.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

describe('LoadReversalService', () => {
  let service: LoadReversalService;
  let prisma: any;
  let eventEmitter: jest.Mocked<DomainEventService>;
  let loadEventsService: jest.Mocked<LoadEventsService>;

  const TENANT_ID = 1;
  const USER_ID = 10;

  const makeLoad = (overrides: Record<string, any> = {}) => ({
    id: 100,
    loadNumber: 'LD-001',
    tenantId: TENANT_ID,
    status: 'IN_TRANSIT',
    inTransitAt: new Date(),
    deliveredAt: null,
    cancelledAt: null,
    tonuAt: null,
    assignedAt: new Date('2026-03-01'),
    driverId: 5,
    vehicleId: 3,
    billingStatus: null,
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      load: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      invoice: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      settlementLineItem: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      loadStop: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      routePlanLoad: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      routePlan: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn((fn) => fn(prisma)),
    };

    loadEventsService = {
      logEvent: jest.fn().mockResolvedValue({}),
      getEvents: jest.fn(),
    } as any;

    eventEmitter = {
      emit: jest.fn().mockResolvedValue(undefined),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoadReversalService,
        { provide: PrismaService, useValue: prisma },
        { provide: DomainEventService, useValue: eventEmitter },
        { provide: LoadEventsService, useValue: loadEventsService },
      ],
    }).compile();

    service = module.get<LoadReversalService>(LoadReversalService);
  });

  // ── previewReversal ──────────────────────────────────────

  describe('previewReversal', () => {
    it('should throw NotFoundException for non-existent load', async () => {
      prisma.load.findFirst.mockResolvedValue(null);

      await expect(service.previewReversal(TENANT_ID, 'LD-999', 'ASSIGNED')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for invalid reversal path', async () => {
      prisma.load.findFirst.mockResolvedValue(makeLoad({ status: 'DRAFT' }));

      await expect(service.previewReversal(TENANT_ID, 'LD-001', 'DELIVERED')).rejects.toThrow(BadRequestException);
    });

    it('should return blocked: true when invoice is SENT', async () => {
      prisma.load.findFirst.mockResolvedValue(makeLoad({ status: 'DELIVERED', deliveredAt: new Date() }));
      prisma.invoice.findMany
        // First call: blocking invoices check
        .mockResolvedValueOnce([
          {
            id: 1,
            invoiceNumber: 'INV-001',
            status: 'SENT',
            totalCents: 50000,
          },
        ])
        // Second call: affected draft invoices
        .mockResolvedValueOnce([]);

      const result = await service.previewReversal(TENANT_ID, 'LD-001', 'IN_TRANSIT');

      expect(result.blocked).toBe(true);
      expect(result.blockReason).toContain('invoice');
    });

    it('should show warning when time window exceeded for cancelled load', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 14); // 14 days ago

      prisma.load.findFirst.mockResolvedValue(makeLoad({ status: 'CANCELLED', cancelledAt: oldDate }));

      const result = await service.previewReversal(TENANT_ID, 'LD-001', 'PENDING');

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('days');
      expect(result.warnings[0]).toContain('ADMIN');
    });

    it('should return blocked: false when no blocking invoices exist', async () => {
      prisma.load.findFirst.mockResolvedValue(makeLoad({ status: 'IN_TRANSIT' }));

      const result = await service.previewReversal(TENANT_ID, 'LD-001', 'ASSIGNED');

      expect(result.blocked).toBe(false);
      expect(result.blockReason).toBeNull();
    });
  });

  // ── executeReversal ──────────────────────────────────────

  describe('executeReversal', () => {
    const execArgs = (role = 'DISPATCHER', loadId = 'LD-001', target = 'ASSIGNED') =>
      [TENANT_ID, loadId, target, 'dispatch_error', 'Wrong driver assigned', USER_ID, role] as const;

    // Set up findUnique for optimistic lock check inside transaction
    beforeEach(() => {
      prisma.load.findUnique.mockImplementation(({ where: _where }: any) => {
        // Return the status matching what findFirst returned
        const lastLoad = prisma.load.findFirst.mock.results?.[0]?.value;
        return Promise.resolve(lastLoad ? { status: lastLoad.status } : null);
      });
    });

    it('should successfully execute in_transit→assigned reversal', async () => {
      const load = makeLoad({ status: 'IN_TRANSIT' });
      prisma.load.findFirst.mockResolvedValue(load);
      prisma.load.findUnique.mockResolvedValue({ status: 'IN_TRANSIT' });
      prisma.load.update.mockResolvedValue({ ...load, status: 'ASSIGNED' });

      await service.executeReversal(...execArgs());

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.load.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: load.id },
          data: expect.objectContaining({
            status: 'ASSIGNED',
            inTransitAt: null,
          }),
        }),
      );
    });

    it('should throw ForbiddenException for DRIVER role', async () => {
      prisma.load.findFirst.mockResolvedValue(makeLoad({ status: 'IN_TRANSIT' }));

      await expect(service.executeReversal(...execArgs('DRIVER'))).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when time window exceeded and role is DISPATCHER', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 14);

      prisma.load.findFirst.mockResolvedValue(makeLoad({ status: 'CANCELLED', cancelledAt: oldDate }));

      await expect(
        service.executeReversal(
          TENANT_ID,
          'LD-001',
          'PENDING',
          'reactivation',
          'Customer wants it back',
          USER_ID,
          'DISPATCHER',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow ADMIN role when time window exceeded', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 14);

      const load = makeLoad({ status: 'CANCELLED', cancelledAt: oldDate });
      prisma.load.findFirst.mockResolvedValue(load);
      prisma.load.findUnique.mockResolvedValue({ status: 'CANCELLED' });
      prisma.load.update.mockResolvedValue({ ...load, status: 'PENDING' });

      await expect(
        service.executeReversal(
          TENANT_ID,
          'LD-001',
          'PENDING',
          'reactivation',
          'Customer wants it back',
          USER_ID,
          'ADMIN',
        ),
      ).resolves.toBeDefined();
    });

    it('should throw ConflictException when invoice is SENT (delivered→in_transit)', async () => {
      prisma.load.findFirst.mockResolvedValue(makeLoad({ status: 'DELIVERED', deliveredAt: new Date() }));
      prisma.invoice.findMany.mockResolvedValue([{ invoiceNumber: 'INV-001', status: 'SENT' }]);

      await expect(
        service.executeReversal(
          TENANT_ID,
          'LD-001',
          'IN_TRANSIT',
          'data_correction',
          'Wrong delivery',
          USER_ID,
          'DISPATCHER',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should log reversal event after execution', async () => {
      const load = makeLoad({ status: 'IN_TRANSIT' });
      prisma.load.findFirst.mockResolvedValue(load);
      prisma.load.findUnique.mockResolvedValue({ status: 'IN_TRANSIT' });
      prisma.load.update.mockResolvedValue({ ...load, status: 'ASSIGNED' });

      await service.executeReversal(...execArgs());

      expect(loadEventsService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          loadId: load.id,
          eventType: 'status_reversal',
          fromValue: 'IN_TRANSIT',
          toValue: 'ASSIGNED',
        }),
      );
    });

    it('should emit domain event after execution', async () => {
      const load = makeLoad({ status: 'IN_TRANSIT' });
      prisma.load.findFirst.mockResolvedValue(load);
      prisma.load.findUnique.mockResolvedValue({ status: 'IN_TRANSIT' });
      prisma.load.update.mockResolvedValue({ ...load, status: 'ASSIGNED' });

      await service.executeReversal(...execArgs());

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'sally.load.status-reversed',
        expect.anything(), // tenantId
        expect.objectContaining({
          fromStatus: 'IN_TRANSIT',
          toStatus: 'ASSIGNED',
        }),
      );
    });

    it('should throw NotFoundException for non-existent load', async () => {
      prisma.load.findFirst.mockResolvedValue(null);

      await expect(service.executeReversal(...execArgs())).rejects.toThrow(NotFoundException);
    });

    it('should execute delivered→in_transit reversal with all cascade actions', async () => {
      const load = makeLoad({
        status: 'DELIVERED',
        deliveredAt: new Date(),
        billingStatus: 'PENDING_DOCUMENTS',
      });
      prisma.load.findFirst.mockResolvedValue(load);
      prisma.load.findUnique.mockResolvedValue({ status: 'DELIVERED' });
      prisma.load.update.mockResolvedValue({ ...load, status: 'IN_TRANSIT' });
      prisma.invoice.findMany.mockResolvedValue([]);

      await service.executeReversal(
        TENANT_ID,
        'LD-001',
        'IN_TRANSIT',
        'dispatcher_correction',
        'Wrong delivery',
        USER_ID,
        'DISPATCHER',
      );

      // reset_delivery_stop cascade — stops revert to ARRIVED
      // (IN_TRANSIT is a load-level state, not a stop-level state).
      expect(prisma.loadStop.updateMany).toHaveBeenCalledWith({
        where: { loadId: 100, status: 'COMPLETED' },
        data: { status: 'ARRIVED', completedAt: null },
      });
      // clear_pod cascade
      expect(prisma.loadStop.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { loadId: 100 },
          data: expect.objectContaining({
            podSignedAt: null,
            podSignedBy: null,
          }),
        }),
      );
      // void_draft_invoice cascade
      expect(prisma.invoice.updateMany).toHaveBeenCalledWith({
        where: { loadId: 100, status: 'DRAFT' },
        data: { status: 'VOID' },
      });
    });

    it('should execute delivered→in_transit and remove draft settlement lines', async () => {
      const load = makeLoad({
        status: 'DELIVERED',
        deliveredAt: new Date(),
      });
      prisma.load.findFirst.mockResolvedValue(load);
      prisma.load.findUnique.mockResolvedValue({ status: 'DELIVERED' });
      prisma.load.update.mockResolvedValue({ ...load, status: 'IN_TRANSIT' });
      prisma.invoice.findMany.mockResolvedValue([]);
      prisma.settlementLineItem.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);

      await service.executeReversal(
        TENANT_ID,
        'LD-001',
        'IN_TRANSIT',
        'dispatcher_correction',
        'Wrong delivery',
        USER_ID,
        'DISPATCHER',
      );

      expect(prisma.settlementLineItem.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: [1, 2] } },
      });
    });

    it('should execute in_transit→assigned with supersede_route_plan cascade', async () => {
      const load = makeLoad({
        status: 'IN_TRANSIT',
        inTransitAt: new Date(),
      });
      prisma.load.findFirst.mockResolvedValue(load);
      prisma.load.findUnique.mockResolvedValue({ status: 'IN_TRANSIT' });
      prisma.load.update.mockResolvedValue({ ...load, status: 'ASSIGNED' });
      prisma.routePlanLoad.findMany.mockResolvedValue([{ planId: 100 }, { planId: 200 }]);

      await service.executeReversal(
        TENANT_ID,
        'LD-001',
        'ASSIGNED',
        'dispatcher_correction',
        'Wrong pickup',
        USER_ID,
        'DISPATCHER',
      );

      expect(prisma.routePlan.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [100, 200] }, isActive: true },
        data: { isActive: false, status: 'SUPERSEDED' },
      });
    });
  });
});

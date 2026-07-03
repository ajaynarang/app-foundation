import { Test, TestingModule } from '@nestjs/testing';
import { DunningService } from '../dunning.service';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { PlansService } from '@appshore/platform/domains/plans/plans.service';

const mockPrisma = {
  billingCustomer: { findUnique: jest.fn() },
  billingSubscription: {
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  tenantPlanEvent: { count: jest.fn(), create: jest.fn() },
  tenant: { findUnique: jest.fn() },
};

const mockPlansService = {
  assignPlan: jest.fn().mockResolvedValue(undefined),
};

describe('DunningService', () => {
  let service: DunningService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DunningService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PlansService, useValue: mockPlansService },
      ],
    }).compile();
    service = module.get<DunningService>(DunningService);
  });

  describe('handlePaymentFailed', () => {
    it('should return early if no customer ID in event', async () => {
      await service.handlePaymentFailed({
        data: {},
        providerEventId: 'evt_1',
      } as any);
      expect(mockPrisma.billingCustomer.findUnique).not.toHaveBeenCalled();
    });

    it('should return early if billing customer not found', async () => {
      mockPrisma.billingCustomer.findUnique.mockResolvedValue(null);
      await service.handlePaymentFailed({
        data: { customer: 'cus_1' },
        providerEventId: 'evt_1',
      } as any);
      expect(mockPrisma.billingSubscription.findFirst).not.toHaveBeenCalled();
    });

    it('should mark subscription as PAST_DUE', async () => {
      mockPrisma.billingCustomer.findUnique.mockResolvedValue({
        tenantId: 1,
        tenant: { tenantId: 'TNT-1', id: 1 },
      });
      mockPrisma.billingSubscription.findFirst.mockResolvedValue({
        id: 1,
        plan: 'STARTER',
        currentPeriodStart: new Date(),
      });
      mockPrisma.billingSubscription.update.mockResolvedValue({});
      mockPrisma.tenantPlanEvent.count.mockResolvedValue(0); // first failure
      mockPrisma.tenantPlanEvent.create.mockResolvedValue({});

      await service.handlePaymentFailed({
        data: { customer: 'cus_1' },
        providerEventId: 'evt_1',
      } as any);

      expect(mockPrisma.billingSubscription.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'PAST_DUE' },
      });
    });

    it('should suspend tenant after max retries', async () => {
      mockPrisma.billingCustomer.findUnique.mockResolvedValue({
        tenantId: 1,
        tenant: { tenantId: 'TNT-1', id: 1 },
      });
      mockPrisma.billingSubscription.findFirst.mockResolvedValue({
        id: 1,
        plan: 'STARTER',
        currentPeriodStart: new Date(),
      });
      mockPrisma.billingSubscription.update.mockResolvedValue({});
      mockPrisma.tenantPlanEvent.count.mockResolvedValue(2); // 3rd attempt (0-indexed count + 1 = 3 >= MAX 3)
      mockPrisma.tenantPlanEvent.create.mockResolvedValue({});
      mockPrisma.tenant.findUnique.mockResolvedValue({
        tenantId: 'TNT-1',
        plan: 'STARTER',
      });
      mockPrisma.billingSubscription.updateMany.mockResolvedValue({});

      await service.handlePaymentFailed({
        data: { customer: 'cus_1' },
        providerEventId: 'evt_1',
      } as any);

      expect(mockPlansService.assignPlan).toHaveBeenCalledWith(
        'TNT-1',
        'SUSPENDED',
        'billing-system',
        expect.stringContaining('payment failures'),
      );
    });
  });

  describe('handlePaymentSucceeded', () => {
    it('should restore PAST_DUE subscription to ACTIVE', async () => {
      mockPrisma.billingCustomer.findUnique.mockResolvedValue({ tenantId: 1 });
      mockPrisma.billingSubscription.findFirst.mockResolvedValue({
        id: 1,
        status: 'PAST_DUE',
      });
      mockPrisma.billingSubscription.update.mockResolvedValue({});

      await service.handlePaymentSucceeded({
        data: { customer: 'cus_1' },
      } as any);

      expect(mockPrisma.billingSubscription.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'ACTIVE' },
      });
    });

    it('should do nothing if no PAST_DUE subscription', async () => {
      mockPrisma.billingCustomer.findUnique.mockResolvedValue({ tenantId: 1 });
      mockPrisma.billingSubscription.findFirst.mockResolvedValue(null);

      await service.handlePaymentSucceeded({
        data: { customer: 'cus_1' },
      } as any);

      expect(mockPrisma.billingSubscription.update).not.toHaveBeenCalled();
    });
  });
});

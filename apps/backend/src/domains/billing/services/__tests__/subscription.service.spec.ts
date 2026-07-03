import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SubscriptionService } from '../subscription.service';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { PlansService } from '@appshore/platform/domains/platform/plans/plans.service';
import { PaymentProviderFactory } from '../../adapters/payment-provider.factory';

const mockAdapter = {
  createCustomer: jest.fn().mockResolvedValue('cus_123'),
  createCheckoutSession: jest.fn().mockResolvedValue('https://checkout.stripe.com/session'),
  getSubscription: jest.fn(),
  updateSubscription: jest.fn().mockResolvedValue(undefined),
  cancelSubscription: jest.fn().mockResolvedValue(undefined),
  reactivateSubscription: jest.fn().mockResolvedValue(undefined),
  getUpcomingInvoice: jest.fn(),
  addSubscriptionItem: jest.fn().mockResolvedValue('si_123'),
  removeSubscriptionItem: jest.fn().mockResolvedValue(undefined),
};

const mockPrisma = {
  planConfig: { findUnique: jest.fn(), findFirst: jest.fn() },
  billingCustomer: { findUnique: jest.fn(), create: jest.fn() },
  billingSubscription: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
  },
  tenant: { findUniqueOrThrow: jest.fn(), findUnique: jest.fn() },
  tenantPlanEvent: { create: jest.fn() },
  wallet: { findUnique: jest.fn() },
  paymentMethod: { findMany: jest.fn() },
  $transaction: jest.fn((args: any) => {
    if (Array.isArray(args)) return Promise.all(args);
    return args(mockPrisma);
  }),
};

const mockPlansService = {
  assignPlan: jest.fn().mockResolvedValue(undefined),
};

const mockProviderFactory = {
  getAdapter: jest.fn().mockReturnValue(mockAdapter),
};

describe('SubscriptionService', () => {
  let service: SubscriptionService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PlansService, useValue: mockPlansService },
        { provide: PaymentProviderFactory, useValue: mockProviderFactory },
      ],
    }).compile();
    service = module.get<SubscriptionService>(SubscriptionService);
  });

  describe('createSubscription', () => {
    it('should throw if plan not found', async () => {
      mockPrisma.planConfig.findUnique.mockResolvedValue(null);
      await expect(service.createSubscription('TNT-1', 1, 'STARTER' as any, 1, 'url', 'url')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw if plan has no Stripe price', async () => {
      mockPrisma.planConfig.findUnique.mockResolvedValue({
        providerPriceId: null,
      });
      await expect(service.createSubscription('TNT-1', 1, 'STARTER' as any, 1, 'url', 'url')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw if tenant already has active subscription', async () => {
      mockPrisma.planConfig.findUnique.mockResolvedValue({
        providerPriceId: 'price_1',
      });
      mockPrisma.billingCustomer.findUnique.mockResolvedValue({
        id: 1,
        providerCustomerId: 'cus_1',
      });
      mockPrisma.billingSubscription.findFirst.mockResolvedValue({
        id: 1,
        status: 'ACTIVE',
      });

      await expect(service.createSubscription('TNT-1', 1, 'STARTER' as any, 1, 'url', 'url')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should create billing customer if none exists', async () => {
      mockPrisma.planConfig.findUnique.mockResolvedValue({
        providerPriceId: 'price_1',
      });
      mockPrisma.billingCustomer.findUnique.mockResolvedValue(null);
      mockPrisma.tenant.findUniqueOrThrow.mockResolvedValue({
        companyName: 'Acme',
        contactEmail: 'a@a.com',
      });
      mockPrisma.billingCustomer.create.mockResolvedValue({
        id: 1,
        providerCustomerId: 'cus_123',
      });
      mockPrisma.billingSubscription.findFirst.mockResolvedValue(null);

      const result = await service.createSubscription('TNT-1', 1, 'STARTER', 1, 'success', 'cancel');

      expect(mockAdapter.createCustomer).toHaveBeenCalled();
      expect(result.checkoutUrl).toContain('checkout.stripe.com');
    });
  });

  describe('upgradePlan', () => {
    it('should throw if no active subscription', async () => {
      mockPrisma.billingSubscription.findFirst.mockResolvedValue(null);
      await expect(service.upgradePlan('TNT-1', 1, 'PROFESSIONAL' as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw if downgrading via upgrade endpoint', async () => {
      mockPrisma.billingSubscription.findFirst.mockResolvedValue({
        plan: 'PROFESSIONAL', // current
        quantity: 5,
      });
      await expect(service.upgradePlan('TNT-1', 1, 'STARTER' as any)).rejects.toThrow(BadRequestException);
    });

    it('should upgrade plan with proration', async () => {
      mockPrisma.billingSubscription.findFirst.mockResolvedValue({
        id: 1,
        plan: 'STARTER',
        quantity: 5,
        providerSubscriptionId: 'sub_1',
      });
      mockPrisma.planConfig.findUnique.mockResolvedValue({
        providerPriceId: 'price_pro',
        pricePerUnitCents: 5000,
      });
      mockPrisma.billingSubscription.update.mockResolvedValue({});

      await service.upgradePlan('TNT-1', 1, 'PROFESSIONAL');

      expect(mockAdapter.updateSubscription).toHaveBeenCalledWith(
        'sub_1',
        expect.objectContaining({ prorationBehavior: 'create_prorations' }),
      );
      expect(mockPlansService.assignPlan).toHaveBeenCalledWith(
        'TNT-1',
        'PROFESSIONAL',
        'billing-system',
        expect.any(String),
      );
    });
  });

  describe('downgradePlan', () => {
    it('should throw if upgrading via downgrade endpoint', async () => {
      mockPrisma.billingSubscription.findFirst.mockResolvedValue({
        plan: 'STARTER',
        quantity: 5,
      });
      await expect(service.downgradePlan('TNT-1', 1, 'PROFESSIONAL' as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel at period end', async () => {
      mockPrisma.billingSubscription.findFirst.mockResolvedValue({
        id: 1,
        plan: 'PROFESSIONAL',
        providerSubscriptionId: 'sub_1',
      });
      mockPrisma.billingSubscription.update.mockResolvedValue({});
      mockPrisma.tenantPlanEvent.create.mockResolvedValue({});

      await service.cancelSubscription('TNT-1', 1, 'Too expensive');

      expect(mockAdapter.cancelSubscription).toHaveBeenCalledWith('sub_1', {
        atPeriodEnd: true,
      });
    });
  });

  describe('reactivateSubscription', () => {
    it('should throw if no cancelable subscription', async () => {
      mockPrisma.billingSubscription.findFirst.mockResolvedValue(null);
      await expect(service.reactivateSubscription('TNT-1', 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('handleSubscriptionCanceled', () => {
    it('should handle downgrade when pendingDowngradePlan is set', async () => {
      mockPrisma.billingSubscription.findUnique.mockResolvedValue({
        plan: 'PROFESSIONAL',
        pendingDowngradePlan: 'STARTER',
        tenant: {
          tenantId: 'TNT-1',
          plan: 'PROFESSIONAL',
          planAssignedBy: null,
        },
      });
      mockPrisma.billingSubscription.update.mockResolvedValue({});

      await service.handleSubscriptionCanceled({
        data: { id: 'sub_1' },
      } as any);

      expect(mockPlansService.assignPlan).toHaveBeenCalledWith(
        'TNT-1',
        'STARTER',
        'billing-system',
        expect.stringContaining('Downgraded'),
      );
    });

    it('should revert to TRIAL_EXPIRED on true cancellation', async () => {
      mockPrisma.billingSubscription.findUnique.mockResolvedValue({
        plan: 'STARTER',
        pendingDowngradePlan: null,
        tenant: {
          tenantId: 'TNT-1',
          plan: 'STARTER',
          planAssignedBy: 'billing-system',
        },
      });
      mockPrisma.billingSubscription.update.mockResolvedValue({});

      await service.handleSubscriptionCanceled({
        data: { id: 'sub_1' },
      } as any);

      expect(mockPlansService.assignPlan).toHaveBeenCalledWith(
        'TNT-1',
        'TRIAL_EXPIRED',
        'billing-system',
        expect.any(String),
      );
    });
  });

  describe('addAddOnToSubscription', () => {
    it('should return null if no active subscription', async () => {
      mockPrisma.billingSubscription.findFirst.mockResolvedValue(null);
      const result = await service.addAddOnToSubscription(1, 'price_addon');
      expect(result).toBeNull();
    });

    it('should add subscription item', async () => {
      mockPrisma.billingSubscription.findFirst.mockResolvedValue({
        providerSubscriptionId: 'sub_1',
      });
      const result = await service.addAddOnToSubscription(1, 'price_addon');
      expect(result).toBe('si_123');
    });
  });
});

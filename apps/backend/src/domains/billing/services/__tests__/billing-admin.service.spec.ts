import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BillingAdminService } from '../billing-admin.service';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { PlansService } from '@appshore/platform/domains/plans/plans.service';
import { PaymentProviderFactory } from '../../adapters/payment-provider.factory';
import { WalletService } from '../wallet.service';

const mockAdapter = {
  createCustomer: jest.fn().mockResolvedValue('cus_new'),
  createSubscription: jest.fn().mockResolvedValue('sub_new'),
  getSubscription: jest.fn().mockResolvedValue({
    status: 'active',
    unitPriceCents: 5000,
    quantity: 1,
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(),
  }),
  updateSubscription: jest.fn(),
  cancelSubscription: jest.fn(),
  reactivateSubscription: jest.fn(),
  refund: jest.fn().mockResolvedValue('re_123'),
};

const mockPrisma = {
  planConfig: { findUnique: jest.fn() },
  billingCustomer: { findUnique: jest.fn(), create: jest.fn() },
  billingSubscription: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  },
  tenant: {
    findUniqueOrThrow: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
  },
  tenantPlanEvent: { create: jest.fn() },
  wallet: { findUnique: jest.fn() },
  paymentMethod: { findMany: jest.fn() },
  billingInvoice: { findMany: jest.fn() },
  tenantAddOn: { count: jest.fn() },
  $transaction: jest.fn((args: any) => {
    if (Array.isArray(args)) return Promise.all(args);
    return args(mockPrisma);
  }),
};

const mockPlansService = { assignPlan: jest.fn() };
const mockProviderFactory = {
  getAdapter: jest.fn().mockReturnValue(mockAdapter),
};
const mockWalletService = {
  addCredit: jest.fn(),
  refundToWallet: jest.fn(),
};

describe('BillingAdminService', () => {
  let service: BillingAdminService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingAdminService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PlansService, useValue: mockPlansService },
        { provide: PaymentProviderFactory, useValue: mockProviderFactory },
        { provide: WalletService, useValue: mockWalletService },
      ],
    }).compile();
    service = module.get<BillingAdminService>(BillingAdminService);
  });

  describe('extendTrial', () => {
    it('should throw if tenant not on TRIAL or TRIAL_EXPIRED', async () => {
      mockPrisma.tenant.findUniqueOrThrow.mockResolvedValue({
        tenantId: 'TNT-1',
        plan: 'STARTER',
        trialEndsAt: new Date(),
      });
      await expect(service.extendTrial(1, 30)).rejects.toThrow(BadRequestException);
    });

    it('should extend trial and restore TRIAL_EXPIRED to TRIAL', async () => {
      mockPrisma.tenant.findUniqueOrThrow.mockResolvedValue({
        tenantId: 'TNT-1',
        plan: 'TRIAL_EXPIRED',
        trialEndsAt: new Date('2025-01-01'),
      });
      mockPrisma.tenant.update = jest.fn().mockResolvedValue({});
      mockPrisma.tenantPlanEvent.create.mockResolvedValue({});

      await service.extendTrial(1, 30);

      expect(mockPlansService.assignPlan).toHaveBeenCalledWith(
        'TNT-1',
        'TRIAL',
        'billing-admin',
        expect.stringContaining('30 days'),
      );
    });
  });

  describe('forceSuspend', () => {
    it('should suspend subscriptions and assign SUSPENDED plan', async () => {
      mockPrisma.tenant.findUniqueOrThrow.mockResolvedValue({
        tenantId: 'TNT-1',
        plan: 'PROFESSIONAL',
      });
      mockPrisma.billingSubscription.updateMany.mockResolvedValue({});

      await service.forceSuspend(1, 'Fraud detected');

      expect(mockPlansService.assignPlan).toHaveBeenCalledWith(
        'TNT-1',
        'SUSPENDED',
        'billing-admin',
        expect.stringContaining('Fraud detected'),
      );
    });
  });

  describe('reactivate', () => {
    it('should throw if tenant not suspended', async () => {
      mockPrisma.tenant.findUniqueOrThrow.mockResolvedValue({
        tenantId: 'TNT-1',
        plan: 'ACTIVE',
      });
      await expect(service.reactivate(1)).rejects.toThrow(BadRequestException);
    });

    it('should restore to last subscription plan', async () => {
      mockPrisma.tenant.findUniqueOrThrow.mockResolvedValue({
        tenantId: 'TNT-1',
        plan: 'SUSPENDED',
      });
      mockPrisma.billingSubscription.findFirst.mockResolvedValue({
        id: 1,
        plan: 'PROFESSIONAL',
        providerSubscriptionId: 'sub_1',
      });
      mockPrisma.billingSubscription.update.mockResolvedValue({});

      await service.reactivate(1);

      expect(mockPlansService.assignPlan).toHaveBeenCalledWith(
        'TNT-1',
        'PROFESSIONAL',
        'billing-admin',
        expect.any(String),
      );
    });
  });

  describe('getRevenueStats', () => {
    it('should calculate MRR, ARR, ARPU, and churn', async () => {
      mockPrisma.billingSubscription.findMany.mockResolvedValue([
        { unitPriceCents: 5000, quantity: 2 },
        { unitPriceCents: 10000, quantity: 1 },
      ]);
      mockPrisma.billingSubscription.count.mockResolvedValue(1); // 1 canceled this month
      mockPrisma.tenant.count.mockResolvedValue(10);
      mockPrisma.tenantAddOn.count.mockResolvedValue(3);

      const result = await service.getRevenueStats();

      expect(result.mrrCents).toBe(20000); // 5000*2 + 10000*1
      expect(result.arrCents).toBe(240000);
      expect(result.arpuCents).toBe(10000); // 20000/2
      expect(result.activeSubscriptions).toBe(2);
      expect(result.canceledThisMonth).toBe(1);
      expect(result.totalTenants).toBe(10);
    });
  });

  describe('createSubscriptionForTenant', () => {
    it('should throw if plan has no provider price', async () => {
      mockPrisma.planConfig.findUnique.mockResolvedValue(null);
      await expect(service.createSubscriptionForTenant(1, 'PROFESSIONAL' as any, 3)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw if tenant already has active subscription', async () => {
      mockPrisma.planConfig.findUnique.mockResolvedValue({
        providerPriceId: 'price_1',
        pricePerUnitCents: 5000,
      });
      mockPrisma.billingSubscription.findFirst.mockResolvedValue({ id: 1 });
      await expect(service.createSubscriptionForTenant(1, 'PROFESSIONAL' as any, 3)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should create customer if not exists and create subscription', async () => {
      mockPrisma.planConfig.findUnique.mockResolvedValue({
        providerPriceId: 'price_1',
        pricePerUnitCents: 5000,
      });
      mockPrisma.billingSubscription.findFirst.mockResolvedValue(null);
      mockPrisma.billingCustomer.findUnique.mockResolvedValue(null);
      mockPrisma.tenant.findUniqueOrThrow.mockResolvedValue({
        tenantId: 'TNT-1',
        companyName: 'Test Co',
        contactEmail: 'test@example.com',
      });
      mockPrisma.billingCustomer.create.mockResolvedValue({
        id: 1,
        providerCustomerId: 'cus_new',
      });
      mockPrisma.billingSubscription.create.mockResolvedValue({});

      const result = await service.createSubscriptionForTenant(1, 'PROFESSIONAL', 3);

      expect(result).toEqual({ providerSubscriptionId: 'sub_new' });
      expect(mockAdapter.createCustomer).toHaveBeenCalled();
      expect(mockAdapter.createSubscription).toHaveBeenCalled();
      expect(mockPlansService.assignPlan).toHaveBeenCalledWith(
        'TNT-1',
        'PROFESSIONAL',
        'billing-admin',
        expect.any(String),
      );
    });

    it('should use existing billing customer', async () => {
      mockPrisma.planConfig.findUnique.mockResolvedValue({
        providerPriceId: 'price_1',
        pricePerUnitCents: 5000,
      });
      mockPrisma.billingSubscription.findFirst.mockResolvedValue(null);
      mockPrisma.billingCustomer.findUnique.mockResolvedValue({
        id: 1,
        providerCustomerId: 'cus_existing',
      });
      mockPrisma.billingSubscription.create.mockResolvedValue({});
      mockPrisma.tenant.findUniqueOrThrow.mockResolvedValue({
        tenantId: 'TNT-1',
      });

      await service.createSubscriptionForTenant(1, 'STARTER', 1);

      expect(mockAdapter.createCustomer).not.toHaveBeenCalled();
    });

    it('should log custom price when different from catalog', async () => {
      mockPrisma.planConfig.findUnique.mockResolvedValue({
        providerPriceId: 'price_1',
        pricePerUnitCents: 5000,
      });
      mockPrisma.billingSubscription.findFirst.mockResolvedValue(null);
      mockPrisma.billingCustomer.findUnique.mockResolvedValue({
        id: 1,
        providerCustomerId: 'cus_existing',
      });
      mockPrisma.billingSubscription.create.mockResolvedValue({});
      mockPrisma.tenant.findUniqueOrThrow.mockResolvedValue({
        tenantId: 'TNT-1',
      });

      const result = await service.createSubscriptionForTenant(1, 'PROFESSIONAL', 2, 3000);

      expect(result).toEqual({ providerSubscriptionId: 'sub_new' });
    });

    it('should wrap non-HTTP errors in BadRequestException', async () => {
      mockPrisma.planConfig.findUnique.mockResolvedValue({
        providerPriceId: 'price_1',
        pricePerUnitCents: 5000,
      });
      mockPrisma.billingSubscription.findFirst.mockResolvedValue(null);
      mockPrisma.billingCustomer.findUnique.mockResolvedValue({
        id: 1,
        providerCustomerId: 'cus_existing',
      });
      mockAdapter.createSubscription.mockRejectedValue(new Error('Stripe error'));

      await expect(service.createSubscriptionForTenant(1, 'PROFESSIONAL' as any, 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should re-throw BadRequestException as-is', async () => {
      mockPrisma.planConfig.findUnique.mockResolvedValue({
        providerPriceId: 'price_1',
        pricePerUnitCents: 5000,
      });
      mockPrisma.billingSubscription.findFirst.mockResolvedValue(null);
      mockPrisma.billingCustomer.findUnique.mockResolvedValue({
        id: 1,
        providerCustomerId: 'cus_existing',
      });
      mockAdapter.createSubscription.mockRejectedValue(new BadRequestException('Bad input'));

      await expect(service.createSubscriptionForTenant(1, 'PROFESSIONAL' as any, 1)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getTenantBilling', () => {
    it('should return full billing state', async () => {
      mockPrisma.tenant.findUniqueOrThrow.mockResolvedValue({
        tenantId: 'TNT-1',
        companyName: 'Test',
        plan: 'PROFESSIONAL',
      });
      mockPrisma.billingSubscription.findFirst.mockResolvedValue({
        id: 1,
        plan: 'PROFESSIONAL',
      });
      mockPrisma.wallet.findUnique.mockResolvedValue({
        balanceCents: 5000,
        transactions: [],
      });
      mockPrisma.paymentMethod.findMany.mockResolvedValue([{ id: 'pm_1' }]);
      mockPrisma.billingInvoice.findMany.mockResolvedValue([{ id: 'inv_1' }]);

      const result = await service.getTenantBilling(1);

      expect(result.tenant.tenantId).toBe('TNT-1');
      expect(result.subscription).toBeDefined();
      expect(result.wallet).toBeDefined();
      expect(result.paymentMethods).toHaveLength(1);
      expect(result.recentInvoices).toHaveLength(1);
    });
  });

  describe('overrideUnitPrice', () => {
    it('should throw if no active subscription', async () => {
      mockPrisma.billingSubscription.findFirst.mockResolvedValue(null);
      await expect(service.overrideUnitPrice(1, 3500)).rejects.toThrow(NotFoundException);
    });

    it('should throw if plan has no provider price', async () => {
      mockPrisma.billingSubscription.findFirst.mockResolvedValue({
        id: 1,
        plan: 'PROFESSIONAL',
        providerSubscriptionId: 'sub_1',
        quantity: 2,
      });
      mockPrisma.planConfig.findUnique.mockResolvedValue(null);
      await expect(service.overrideUnitPrice(1, 3500)).rejects.toThrow(BadRequestException);
    });

    it('should update price even if Stripe call fails', async () => {
      mockPrisma.billingSubscription.findFirst.mockResolvedValue({
        id: 1,
        plan: 'PROFESSIONAL',
        providerSubscriptionId: 'sub_1',
        quantity: 2,
      });
      mockPrisma.planConfig.findUnique.mockResolvedValue({
        providerPriceId: 'price_1',
      });
      mockAdapter.updateSubscription.mockRejectedValue(new Error('Stripe down'));
      mockPrisma.billingSubscription.update.mockResolvedValue({});

      await service.overrideUnitPrice(1, 3500);

      expect(mockPrisma.billingSubscription.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { unitPriceCents: 3500 },
      });
    });

    it('should update Stripe and local record on success', async () => {
      mockPrisma.billingSubscription.findFirst.mockResolvedValue({
        id: 1,
        plan: 'PROFESSIONAL',
        providerSubscriptionId: 'sub_1',
        quantity: 2,
      });
      mockPrisma.planConfig.findUnique.mockResolvedValue({
        providerPriceId: 'price_1',
      });
      mockAdapter.updateSubscription.mockResolvedValue(undefined);
      mockPrisma.billingSubscription.update.mockResolvedValue({});

      await service.overrideUnitPrice(1, 4500);

      expect(mockAdapter.updateSubscription).toHaveBeenCalled();
      expect(mockPrisma.billingSubscription.update).toHaveBeenCalled();
    });
  });

  describe('pauseBilling', () => {
    it('should throw if no active subscription', async () => {
      mockPrisma.billingSubscription.findFirst.mockResolvedValue(null);
      await expect(service.pauseBilling(1)).rejects.toThrow(NotFoundException);
    });

    it('should cancel at period end and update DB', async () => {
      mockPrisma.billingSubscription.findFirst.mockResolvedValue({
        id: 1,
        providerSubscriptionId: 'sub_1',
      });
      mockAdapter.cancelSubscription.mockResolvedValue(undefined);
      mockPrisma.billingSubscription.update.mockResolvedValue({});

      await service.pauseBilling(1);

      expect(mockAdapter.cancelSubscription).toHaveBeenCalledWith('sub_1', {
        atPeriodEnd: true,
      });
      expect(mockPrisma.billingSubscription.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { cancelAtPeriodEnd: true },
      });
    });
  });

  describe('resumeBilling', () => {
    it('should throw if no paused subscription', async () => {
      mockPrisma.billingSubscription.findFirst.mockResolvedValue(null);
      await expect(service.resumeBilling(1)).rejects.toThrow(NotFoundException);
    });

    it('should reactivate and update DB', async () => {
      mockPrisma.billingSubscription.findFirst.mockResolvedValue({
        id: 1,
        providerSubscriptionId: 'sub_1',
      });
      mockAdapter.reactivateSubscription.mockResolvedValue(undefined);
      mockPrisma.billingSubscription.update.mockResolvedValue({});

      await service.resumeBilling(1);

      expect(mockAdapter.reactivateSubscription).toHaveBeenCalledWith('sub_1');
      expect(mockPrisma.billingSubscription.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { cancelAtPeriodEnd: false },
      });
    });
  });

  describe('cancelSubscriptionImmediately', () => {
    it('should throw if no active subscription', async () => {
      mockPrisma.billingSubscription.findFirst.mockResolvedValue(null);
      await expect(service.cancelSubscriptionImmediately(1)).rejects.toThrow(NotFoundException);
    });

    it('should cancel immediately and transition plan', async () => {
      mockPrisma.billingSubscription.findFirst.mockResolvedValue({
        id: 1,
        providerSubscriptionId: 'sub_1',
      });
      mockPrisma.tenant.findUniqueOrThrow.mockResolvedValue({
        tenantId: 'TNT-1',
        plan: 'PROFESSIONAL',
        planAssignedBy: 'billing-system',
      });
      mockAdapter.cancelSubscription.mockResolvedValue(undefined);
      mockPrisma.billingSubscription.update.mockResolvedValue({});

      await service.cancelSubscriptionImmediately(1);

      expect(mockAdapter.cancelSubscription).toHaveBeenCalledWith('sub_1', {
        atPeriodEnd: false,
      });
      expect(mockPlansService.assignPlan).toHaveBeenCalledWith(
        'TNT-1',
        'TRIAL_EXPIRED',
        'billing-admin',
        'Subscription immediately canceled by admin',
      );
    });

    it('should note admin-assigned plan in reason', async () => {
      mockPrisma.billingSubscription.findFirst.mockResolvedValue({
        id: 1,
        providerSubscriptionId: 'sub_1',
      });
      mockPrisma.tenant.findUniqueOrThrow.mockResolvedValue({
        tenantId: 'TNT-1',
        plan: 'ENTERPRISE',
        planAssignedBy: 'admin-user-123',
      });
      mockAdapter.cancelSubscription.mockResolvedValue(undefined);
      mockPrisma.billingSubscription.update.mockResolvedValue({});

      await service.cancelSubscriptionImmediately(1);

      expect(mockPlansService.assignPlan).toHaveBeenCalledWith(
        'TNT-1',
        'TRIAL_EXPIRED',
        'billing-admin',
        expect.stringContaining('admin-user-123'),
      );
    });
  });

  describe('changeSubscriptionPlan', () => {
    it('should throw if plan has no provider price', async () => {
      mockPrisma.planConfig.findUnique.mockResolvedValue(null);
      await expect(service.changeSubscriptionPlan(1, 'ENTERPRISE' as any)).rejects.toThrow(BadRequestException);
    });

    it('should create subscription if none exists', async () => {
      mockPrisma.planConfig.findUnique.mockResolvedValue({
        providerPriceId: 'price_1',
        pricePerUnitCents: 5000,
      });
      mockPrisma.billingSubscription.findFirst
        .mockResolvedValueOnce(null) // no active sub in changeSubscriptionPlan
        .mockResolvedValueOnce(null); // no active sub check in createSubscriptionForTenant
      mockPrisma.billingCustomer.findUnique.mockResolvedValue({
        id: 1,
        providerCustomerId: 'cus_1',
      });
      mockAdapter.createSubscription.mockResolvedValue('sub_new');
      mockAdapter.getSubscription.mockResolvedValue({
        status: 'active',
        unitPriceCents: 5000,
        quantity: 1,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
      });
      mockPrisma.billingSubscription.create.mockResolvedValue({});
      mockPrisma.tenant.findUniqueOrThrow.mockResolvedValue({
        tenantId: 'TNT-1',
      });

      const result = await service.changeSubscriptionPlan(1, 'PROFESSIONAL');

      expect(result).toEqual({ action: 'created' });
    });

    it('should throw if already on the same plan', async () => {
      mockPrisma.planConfig.findUnique.mockResolvedValue({
        providerPriceId: 'price_1',
        pricePerUnitCents: 5000,
      });
      mockPrisma.billingSubscription.findFirst.mockResolvedValue({
        id: 1,
        plan: 'PROFESSIONAL',
        providerSubscriptionId: 'sub_1',
        quantity: 2,
      });
      mockPrisma.tenant.findUniqueOrThrow.mockResolvedValue({
        tenantId: 'TNT-1',
      });

      await expect(service.changeSubscriptionPlan(1, 'PROFESSIONAL' as any)).rejects.toThrow(BadRequestException);
    });

    it('should upgrade with proration', async () => {
      mockPrisma.planConfig.findUnique.mockResolvedValue({
        providerPriceId: 'price_ent',
        pricePerUnitCents: 10000,
      });
      mockPrisma.billingSubscription.findFirst.mockResolvedValue({
        id: 1,
        plan: 'STARTER',
        providerSubscriptionId: 'sub_1',
        quantity: 2,
      });
      mockPrisma.tenant.findUniqueOrThrow.mockResolvedValue({
        tenantId: 'TNT-1',
      });
      mockAdapter.updateSubscription.mockResolvedValue(undefined);
      mockPrisma.billingSubscription.update.mockResolvedValue({});

      const result = await service.changeSubscriptionPlan(1, 'ENTERPRISE', 5);

      expect(result).toEqual({ action: 'upgraded' });
      expect(mockAdapter.updateSubscription).toHaveBeenCalledWith(
        'sub_1',
        expect.objectContaining({ prorationBehavior: 'create_prorations' }),
      );
    });

    it('should downgrade without proration', async () => {
      mockPrisma.planConfig.findUnique.mockResolvedValue({
        providerPriceId: 'price_str',
        pricePerUnitCents: 3000,
      });
      mockPrisma.billingSubscription.findFirst.mockResolvedValue({
        id: 1,
        plan: 'ENTERPRISE',
        providerSubscriptionId: 'sub_1',
        quantity: 5,
      });
      mockPrisma.tenant.findUniqueOrThrow.mockResolvedValue({
        tenantId: 'TNT-1',
      });
      mockAdapter.updateSubscription.mockResolvedValue(undefined);
      mockPrisma.billingSubscription.update.mockResolvedValue({});

      const result = await service.changeSubscriptionPlan(1, 'STARTER');

      expect(result).toEqual({ action: 'downgraded' });
      expect(mockAdapter.updateSubscription).toHaveBeenCalledWith(
        'sub_1',
        expect.objectContaining({ prorationBehavior: 'none' }),
      );
    });
  });

  describe('addWalletCredit', () => {
    it('should delegate to wallet service', async () => {
      await service.addWalletCredit(1, 5000, 'Bonus', 'admin-1');
      expect(mockWalletService.addCredit).toHaveBeenCalledWith(1, 5000, 'Bonus', 'admin-1');
    });
  });

  describe('issueRefund', () => {
    it('should refund via provider', async () => {
      const result = await service.issueRefund(1, 'pi_1', 5000, 'Duplicate');
      expect(result.refundId).toBe('re_123');
    });

    it('should credit wallet when requested', async () => {
      await service.issueRefund(1, 'pi_1', 5000, 'Refund for top-up', true);
      expect(mockWalletService.refundToWallet).toHaveBeenCalledWith(1, 5000, 'Refund for top-up');
    });
  });
});

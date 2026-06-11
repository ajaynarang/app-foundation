import { Test, TestingModule } from '@nestjs/testing';
import { BillingAdminController } from '../billing-admin.controller';
import { BillingAdminService } from '../../services/billing-admin.service';

const mockBillingAdminService = {
  createSubscriptionForTenant: jest.fn().mockResolvedValue({ providerSubscriptionId: 'sub_new' }),
  getTenantBilling: jest.fn().mockResolvedValue({ tenant: {}, subscription: {} }),
  addWalletCredit: jest.fn().mockResolvedValue(undefined),
  issueRefund: jest.fn().mockResolvedValue({ refundId: 're_123' }),
  overrideUnitPrice: jest.fn().mockResolvedValue(undefined),
  pauseBilling: jest.fn().mockResolvedValue(undefined),
  resumeBilling: jest.fn().mockResolvedValue(undefined),
  changeSubscriptionPlan: jest.fn().mockResolvedValue({ action: 'upgraded' }),
  cancelSubscriptionImmediately: jest.fn().mockResolvedValue(undefined),
  extendTrial: jest.fn().mockResolvedValue(undefined),
  forceSuspend: jest.fn().mockResolvedValue(undefined),
  reactivate: jest.fn().mockResolvedValue(undefined),
  getRevenueStats: jest.fn().mockResolvedValue({ mrrCents: 50000 }),
};

describe('BillingAdminController', () => {
  let controller: BillingAdminController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BillingAdminController],
      providers: [{ provide: BillingAdminService, useValue: mockBillingAdminService }],
    }).compile();

    controller = module.get<BillingAdminController>(BillingAdminController);
  });

  describe('createSubscription', () => {
    it('should create subscription for tenant', async () => {
      const result = await controller.createSubscription(1, {
        plan: 'PROFESSIONAL',
        quantity: 3,
        customPriceCents: 4500,
      });
      expect(result).toEqual({ providerSubscriptionId: 'sub_new' });
      expect(mockBillingAdminService.createSubscriptionForTenant).toHaveBeenCalledWith(1, 'PROFESSIONAL', 3, 4500);
    });
  });

  describe('getTenantBilling', () => {
    it('should return tenant billing state', async () => {
      const result = await controller.getTenantBilling(1);
      expect(result).toEqual({ tenant: {}, subscription: {} });
    });
  });

  describe('addCredit', () => {
    it('should add wallet credit', async () => {
      const user = { userId: 'admin-1', email: 'admin@test.com' };
      const result = await controller.addCredit(1, { amountCents: 5000, reason: 'Bonus' }, user);
      expect(result).toEqual({ success: true });
      expect(mockBillingAdminService.addWalletCredit).toHaveBeenCalledWith(1, 5000, 'Bonus', 'admin-1');
    });

    it('should fall back to email when userId is absent', async () => {
      const user = { email: 'admin@test.com' };
      await controller.addCredit(1, { amountCents: 1000, reason: 'Gift' }, user);
      expect(mockBillingAdminService.addWalletCredit).toHaveBeenCalledWith(1, 1000, 'Gift', 'admin@test.com');
    });
  });

  describe('issueRefund', () => {
    it('should issue refund', async () => {
      const result = await controller.issueRefund(1, {
        paymentId: 'pi_1',
        amountCents: 2500,
        reason: 'Duplicate',
        creditWallet: false,
      });
      expect(result).toEqual({ refundId: 're_123' });
      expect(mockBillingAdminService.issueRefund).toHaveBeenCalledWith(1, 'pi_1', 2500, 'Duplicate', false);
    });
  });

  describe('overrideUnitPrice', () => {
    it('should override unit price', async () => {
      const result = await controller.overrideUnitPrice(1, {
        unitPriceCents: 3500,
      });
      expect(result).toEqual({ success: true });
      expect(mockBillingAdminService.overrideUnitPrice).toHaveBeenCalledWith(1, 3500);
    });
  });

  describe('pauseBilling', () => {
    it('should pause billing', async () => {
      const result = await controller.pauseBilling(1);
      expect(result).toEqual({ success: true });
      expect(mockBillingAdminService.pauseBilling).toHaveBeenCalledWith(1);
    });
  });

  describe('resumeBilling', () => {
    it('should resume billing', async () => {
      const result = await controller.resumeBilling(1);
      expect(result).toEqual({ success: true });
      expect(mockBillingAdminService.resumeBilling).toHaveBeenCalledWith(1);
    });
  });

  describe('changeSubscriptionPlan', () => {
    it('should change subscription plan', async () => {
      const result = await controller.changeSubscriptionPlan(1, {
        plan: 'ENTERPRISE',
        quantity: 5,
      });
      expect(result).toEqual({ action: 'upgraded' });
      expect(mockBillingAdminService.changeSubscriptionPlan).toHaveBeenCalledWith(1, 'ENTERPRISE', 5);
    });
  });

  describe('cancelImmediately', () => {
    it('should cancel subscription immediately', async () => {
      const result = await controller.cancelImmediately(1);
      expect(result).toEqual({ success: true });
      expect(mockBillingAdminService.cancelSubscriptionImmediately).toHaveBeenCalledWith(1);
    });
  });

  describe('extendTrial', () => {
    it('should extend trial', async () => {
      const result = await controller.extendTrial(1, { days: 14 });
      expect(result).toEqual({ success: true });
      expect(mockBillingAdminService.extendTrial).toHaveBeenCalledWith(1, 14);
    });
  });

  describe('forceSuspend', () => {
    it('should force suspend', async () => {
      const result = await controller.forceSuspend(1, { reason: 'Fraud' });
      expect(result).toEqual({ success: true });
      expect(mockBillingAdminService.forceSuspend).toHaveBeenCalledWith(1, 'Fraud');
    });
  });

  describe('reactivate', () => {
    it('should reactivate tenant', async () => {
      const result = await controller.reactivate(1);
      expect(result).toEqual({ success: true });
      expect(mockBillingAdminService.reactivate).toHaveBeenCalledWith(1);
    });
  });

  describe('getRevenueStats', () => {
    it('should return revenue stats', async () => {
      const result = await controller.getRevenueStats();
      expect(result).toEqual({ mrrCents: 50000 });
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { BillingController } from '../billing.controller';
import { SubscriptionService } from '../../services/subscription.service';
import { WalletService } from '../../services/wallet.service';
import { InvoiceService } from '../../services/invoice.service';
import { PaymentMethodService } from '../../services/payment-method.service';

const mockSubscriptionService = {
  getBillingOverview: jest.fn().mockResolvedValue({ plan: 'PROFESSIONAL' }),
  createSubscription: jest.fn().mockResolvedValue({ checkoutUrl: 'https://checkout.stripe.com' }),
  upgradePlan: jest.fn().mockResolvedValue(undefined),
  downgradePlan: jest.fn().mockResolvedValue(undefined),
  updateQuantity: jest.fn().mockResolvedValue(undefined),
  cancelSubscription: jest.fn().mockResolvedValue(undefined),
  reactivateSubscription: jest.fn().mockResolvedValue(undefined),
};

const mockWalletService = {
  getBalance: jest.fn().mockResolvedValue({ balanceCents: 10000 }),
  topUp: jest.fn().mockResolvedValue(undefined),
  updateAutoReload: jest.fn().mockResolvedValue(undefined),
  getTransactions: jest.fn().mockResolvedValue({ items: [], cursor: null }),
};

const mockInvoiceService = {
  listInvoices: jest.fn().mockResolvedValue({ items: [] }),
  getUpcomingInvoice: jest.fn().mockResolvedValue({ amountDueCents: 5000 }),
  downloadInvoice: jest.fn().mockResolvedValue({ url: 'https://pdf.com' }),
};

const mockPaymentMethodService = {
  addPaymentMethod: jest.fn().mockResolvedValue({ setupUrl: 'https://setup.com' }),
  listPaymentMethods: jest.fn().mockResolvedValue([]),
  setDefault: jest.fn().mockResolvedValue(undefined),
  removePaymentMethod: jest.fn().mockResolvedValue(undefined),
};

describe('BillingController', () => {
  let controller: BillingController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BillingController],
      providers: [
        { provide: SubscriptionService, useValue: mockSubscriptionService },
        { provide: WalletService, useValue: mockWalletService },
        { provide: InvoiceService, useValue: mockInvoiceService },
        { provide: PaymentMethodService, useValue: mockPaymentMethodService },
      ],
    }).compile();

    controller = module.get<BillingController>(BillingController);
  });

  // ─── Subscription ─────────────────────────────────────────────────

  describe('getOverview', () => {
    it('should return billing overview for tenant', async () => {
      const result = await controller.getOverview(1);
      expect(result).toEqual({ plan: 'PROFESSIONAL' });
      expect(mockSubscriptionService.getBillingOverview).toHaveBeenCalledWith(1);
    });
  });

  describe('createCheckout', () => {
    it('should create a checkout session', async () => {
      const user = { tenantId: 'TNT-1' };
      const dto = {
        plan: 'PROFESSIONAL' as any,
        quantity: 3,
        successUrl: 'https://app.com/success',
        cancelUrl: 'https://app.com/cancel',
      };

      const result = await controller.createCheckout(user, 1, dto);

      expect(result).toEqual({ checkoutUrl: 'https://checkout.stripe.com' });
      expect(mockSubscriptionService.createSubscription).toHaveBeenCalledWith(
        'TNT-1',
        1,
        'PROFESSIONAL',
        3,
        'https://app.com/success',
        'https://app.com/cancel',
      );
    });
  });

  describe('upgradePlan', () => {
    it('should upgrade plan and return success', async () => {
      const result = await controller.upgradePlan({ tenantId: 'TNT-1' }, 1, {
        newPlan: 'ENTERPRISE' as any,
        newQuantity: 5,
      });
      expect(result).toEqual({ success: true });
      expect(mockSubscriptionService.upgradePlan).toHaveBeenCalledWith('TNT-1', 1, 'ENTERPRISE', 5);
    });
  });

  describe('downgradePlan', () => {
    it('should downgrade plan and return success', async () => {
      const result = await controller.downgradePlan({ tenantId: 'TNT-1' }, 1, {
        newPlan: 'STARTER' as any,
      });
      expect(result).toEqual({ success: true });
      expect(mockSubscriptionService.downgradePlan).toHaveBeenCalledWith('TNT-1', 1, 'STARTER');
    });
  });

  describe('updateQuantity', () => {
    it('should update quantity and return success', async () => {
      const result = await controller.updateQuantity({ tenantId: 'TNT-1' }, 1, {
        quantity: 10,
      });
      expect(result).toEqual({ success: true });
      expect(mockSubscriptionService.updateQuantity).toHaveBeenCalledWith('TNT-1', 1, 10);
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel subscription with reason', async () => {
      const result = await controller.cancelSubscription({ tenantId: 'TNT-1' }, 1, { reason: 'Too expensive' });
      expect(result).toEqual({ success: true });
      expect(mockSubscriptionService.cancelSubscription).toHaveBeenCalledWith('TNT-1', 1, 'Too expensive');
    });
  });

  describe('reactivateSubscription', () => {
    it('should reactivate subscription', async () => {
      const result = await controller.reactivateSubscription({ tenantId: 'TNT-1' }, 1);
      expect(result).toEqual({ success: true });
      expect(mockSubscriptionService.reactivateSubscription).toHaveBeenCalledWith('TNT-1', 1);
    });
  });

  // ─── Wallet ───────────────────────────────────────────────────────

  describe('getWallet', () => {
    it('should return wallet balance', async () => {
      const result = await controller.getWallet(1);
      expect(result).toEqual({ balanceCents: 10000 });
    });
  });

  describe('topUpWallet', () => {
    it('should top up wallet', async () => {
      const result = await controller.topUpWallet(1, { amountCents: 5000 });
      expect(result).toEqual({ success: true });
      expect(mockWalletService.topUp).toHaveBeenCalledWith(1, 5000);
    });
  });

  describe('updateAutoReload', () => {
    it('should update auto-reload settings', async () => {
      const dto = {
        enabled: true,
        thresholdCents: 1000,
        reloadAmountCents: 5000,
      };
      const result = await controller.updateAutoReload(1, dto);
      expect(result).toEqual({ success: true });
      expect(mockWalletService.updateAutoReload).toHaveBeenCalledWith(1, {
        enabled: true,
        thresholdCents: 1000,
        reloadAmountCents: 5000,
      });
    });
  });

  describe('getTransactions', () => {
    it('should return paginated transactions', async () => {
      const query = { type: undefined, limit: 20, cursor: undefined } as any;
      const result = await controller.getTransactions(1, query);
      expect(result).toEqual({ items: [], cursor: null });
      expect(mockWalletService.getTransactions).toHaveBeenCalledWith(1, {
        type: undefined,
        limit: 20,
        cursor: undefined,
      });
    });
  });

  // ─── Invoices ─────────────────────────────────────────────────────

  describe('listInvoices', () => {
    it('should list invoices with pagination', async () => {
      const result = await controller.listInvoices(1, {
        limit: 10,
        cursor: 'cur_1',
      });
      expect(result).toEqual({ items: [] });
      expect(mockInvoiceService.listInvoices).toHaveBeenCalledWith(1, {
        limit: 10,
        cursor: 'cur_1',
      });
    });
  });

  describe('getUpcomingInvoice', () => {
    it('should return upcoming invoice', async () => {
      const result = await controller.getUpcomingInvoice(1);
      expect(result).toEqual({ amountDueCents: 5000 });
    });
  });

  describe('downloadInvoice', () => {
    it('should return download URL', async () => {
      const result = await controller.downloadInvoice(1, 'inv_123');
      expect(result).toEqual({ url: 'https://pdf.com' });
      expect(mockInvoiceService.downloadInvoice).toHaveBeenCalledWith(1, 'inv_123');
    });
  });

  // ─── Payment Methods ──────────────────────────────────────────────

  describe('setupPaymentMethod', () => {
    it('should create setup session', async () => {
      const result = await controller.setupPaymentMethod(1, {
        returnUrl: 'https://app.com/billing',
      });
      expect(result).toEqual({ setupUrl: 'https://setup.com' });
      expect(mockPaymentMethodService.addPaymentMethod).toHaveBeenCalledWith(1, 'https://app.com/billing');
    });
  });

  describe('listPaymentMethods', () => {
    it('should list payment methods', async () => {
      const result = await controller.listPaymentMethods(1);
      expect(result).toEqual([]);
    });
  });

  describe('setDefaultPaymentMethod', () => {
    it('should set default payment method', async () => {
      const result = await controller.setDefaultPaymentMethod(1, 'pm_123');
      expect(result).toEqual({ success: true });
      expect(mockPaymentMethodService.setDefault).toHaveBeenCalledWith(1, 'pm_123');
    });
  });

  describe('removePaymentMethod', () => {
    it('should remove payment method', async () => {
      const result = await controller.removePaymentMethod(1, 'pm_123');
      expect(result).toEqual({ success: true });
      expect(mockPaymentMethodService.removePaymentMethod).toHaveBeenCalledWith(1, 'pm_123');
    });
  });
});

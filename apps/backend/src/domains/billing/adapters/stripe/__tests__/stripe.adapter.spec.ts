import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { StripeAdapter } from '../stripe.adapter';

// Mock the stripe-webhook.handler
jest.mock('../stripe-webhook.handler', () => ({
  mapStripeEventType: jest.fn((type: string) => {
    const map: Record<string, string> = {
      'payment_intent.succeeded': 'payment.succeeded',
      'customer.subscription.created': 'subscription.created',
    };
    return map[type] ?? undefined;
  }),
}));

// Build a mock Stripe SDK
const mockCustomersCreate = jest.fn();
const mockCustomersUpdate = jest.fn();
const mockCustomersDel = jest.fn();
const mockCustomersRetrieve = jest.fn();
const mockCustomersListPaymentMethods = jest.fn();
const mockSubscriptionsCreate = jest.fn();
const mockSubscriptionsRetrieve = jest.fn();
const mockSubscriptionsUpdate = jest.fn();
const mockSubscriptionsCancel = jest.fn();
const mockSubscriptionItemsCreate = jest.fn();
const mockSubscriptionItemsDel = jest.fn();
const mockCheckoutSessionsCreate = jest.fn();
const mockPaymentIntentsCreate = jest.fn();
const mockRefundsCreate = jest.fn();
const mockPaymentMethodsDetach = jest.fn();
const mockInvoicesList = jest.fn();
const mockInvoicesRetrieveUpcoming = jest.fn();
const mockWebhooksConstructEvent = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    customers: {
      create: mockCustomersCreate,
      update: mockCustomersUpdate,
      del: mockCustomersDel,
      retrieve: mockCustomersRetrieve,
      listPaymentMethods: mockCustomersListPaymentMethods,
    },
    subscriptions: {
      create: mockSubscriptionsCreate,
      retrieve: mockSubscriptionsRetrieve,
      update: mockSubscriptionsUpdate,
      cancel: mockSubscriptionsCancel,
    },
    subscriptionItems: {
      create: mockSubscriptionItemsCreate,
      del: mockSubscriptionItemsDel,
    },
    checkout: {
      sessions: { create: mockCheckoutSessionsCreate },
    },
    paymentIntents: { create: mockPaymentIntentsCreate },
    refunds: { create: mockRefundsCreate },
    paymentMethods: { detach: mockPaymentMethodsDetach },
    invoices: {
      list: mockInvoicesList,
      retrieveUpcoming: mockInvoicesRetrieveUpcoming,
    },
    webhooks: { constructEvent: mockWebhooksConstructEvent },
  }));
});

describe('StripeAdapter', () => {
  let adapter: StripeAdapter;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeAdapter,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'stripe.secretKey') return 'sk_test_123';
              if (key === 'stripe.webhookSecret') return 'whsec_test';
              return '';
            }),
          },
        },
      ],
    }).compile();

    adapter = module.get<StripeAdapter>(StripeAdapter);
  });

  // ─── Constructor ────────────────────────────────────────────────────

  describe('constructor', () => {
    it('should warn and set stripe to null when no secret key', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          StripeAdapter,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn(() => ''),
            },
          },
        ],
      }).compile();

      const adapterNoKey = module.get<StripeAdapter>(StripeAdapter);
      // Trying to use it should throw InternalServerErrorException
      await expect(adapterNoKey.createCustomer({ email: 'a@b.com', name: 'Test' })).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ─── Customer ─────────────────────────────────────────────────────

  describe('createCustomer', () => {
    it('should create a Stripe customer and return the ID', async () => {
      mockCustomersCreate.mockResolvedValue({ id: 'cus_123' });

      const result = await adapter.createCustomer({
        email: 'test@example.com',
        name: 'Test Co',
        metadata: { tenantId: 'TNT-1' },
      });

      expect(result).toBe('cus_123');
      expect(mockCustomersCreate).toHaveBeenCalledWith({
        email: 'test@example.com',
        name: 'Test Co',
        metadata: { tenantId: 'TNT-1' },
      });
    });
  });

  describe('updateCustomer', () => {
    it('should update customer with provided fields', async () => {
      mockCustomersUpdate.mockResolvedValue({});

      await adapter.updateCustomer('cus_123', {
        email: 'new@example.com',
        name: 'New Name',
        metadata: { key: 'val' },
      });

      expect(mockCustomersUpdate).toHaveBeenCalledWith('cus_123', {
        email: 'new@example.com',
        name: 'New Name',
        metadata: { key: 'val' },
      });
    });

    it('should omit undefined fields', async () => {
      mockCustomersUpdate.mockResolvedValue({});

      await adapter.updateCustomer('cus_123', {});

      expect(mockCustomersUpdate).toHaveBeenCalledWith('cus_123', {});
    });
  });

  describe('deleteCustomer', () => {
    it('should delete the customer', async () => {
      mockCustomersDel.mockResolvedValue({});

      await adapter.deleteCustomer('cus_123');

      expect(mockCustomersDel).toHaveBeenCalledWith('cus_123');
    });
  });

  // ─── Subscription ─────────────────────────────────────────────────

  describe('getSubscription', () => {
    it('should retrieve and map subscription info', async () => {
      mockSubscriptionsRetrieve.mockResolvedValue({
        id: 'sub_123',
        customer: 'cus_123',
        status: 'active',
        items: {
          data: [{ price: { id: 'price_1', unit_amount: 5000 }, quantity: 2 }],
        },
        current_period_start: 1700000000,
        current_period_end: 1702592000,
        cancel_at_period_end: false,
        metadata: { plan: 'PROFESSIONAL' },
      });

      const result = await adapter.getSubscription('sub_123');

      expect(result.providerSubscriptionId).toBe('sub_123');
      expect(result.providerCustomerId).toBe('cus_123');
      expect(result.status).toBe('active');
      expect(result.priceId).toBe('price_1');
      expect(result.quantity).toBe(2);
      expect(result.unitPriceCents).toBe(5000);
      expect(result.cancelAtPeriodEnd).toBe(false);
    });

    it('should handle customer as object', async () => {
      mockSubscriptionsRetrieve.mockResolvedValue({
        id: 'sub_123',
        customer: { id: 'cus_obj_123' },
        status: 'active',
        items: { data: [] },
        current_period_start: 1700000000,
        current_period_end: 1702592000,
        cancel_at_period_end: false,
        metadata: {},
      });

      const result = await adapter.getSubscription('sub_123');
      expect(result.providerCustomerId).toBe('cus_obj_123');
      expect(result.priceId).toBeNull();
      expect(result.quantity).toBe(1);
      expect(result.unitPriceCents).toBe(0);
    });
  });

  describe('createSubscription', () => {
    it('should create a subscription with basic params', async () => {
      mockSubscriptionsCreate.mockResolvedValue({ id: 'sub_new' });

      const result = await adapter.createSubscription({
        providerCustomerId: 'cus_123',
        priceId: 'price_1',
        quantity: 3,
        metadata: { plan: 'STARTER' },
      });

      expect(result).toBe('sub_new');
      expect(mockSubscriptionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_123',
          items: [{ price: 'price_1', quantity: 3 }],
          metadata: { plan: 'STARTER' },
          payment_behavior: 'default_incomplete',
          proration_behavior: 'create_prorations',
        }),
      );
    });

    it('should include add-on price IDs', async () => {
      mockSubscriptionsCreate.mockResolvedValue({ id: 'sub_addons' });

      await adapter.createSubscription({
        providerCustomerId: 'cus_123',
        priceId: 'price_1',
        quantity: 1,
        addOnPriceIds: ['price_addon_1', 'price_addon_2'],
      });

      const call = mockSubscriptionsCreate.mock.calls[0][0];
      expect(call.items).toHaveLength(3);
      expect(call.items[1]).toEqual({ price: 'price_addon_1' });
      expect(call.items[2]).toEqual({ price: 'price_addon_2' });
    });

    it('should set collection_method to send_invoice', async () => {
      mockSubscriptionsCreate.mockResolvedValue({ id: 'sub_invoice' });

      await adapter.createSubscription({
        providerCustomerId: 'cus_123',
        priceId: 'price_1',
        quantity: 1,
        collectionMethod: 'send_invoice',
        daysUntilDue: 15,
      });

      const call = mockSubscriptionsCreate.mock.calls[0][0];
      expect(call.collection_method).toBe('send_invoice');
      expect(call.days_until_due).toBe(15);
    });

    it('should default daysUntilDue to 30 for send_invoice', async () => {
      mockSubscriptionsCreate.mockResolvedValue({ id: 'sub_default_due' });

      await adapter.createSubscription({
        providerCustomerId: 'cus_123',
        priceId: 'price_1',
        quantity: 1,
        collectionMethod: 'send_invoice',
      });

      const call = mockSubscriptionsCreate.mock.calls[0][0];
      expect(call.days_until_due).toBe(30);
    });

    it('should use custom paymentBehavior', async () => {
      mockSubscriptionsCreate.mockResolvedValue({ id: 'sub_custom' });

      await adapter.createSubscription({
        providerCustomerId: 'cus_123',
        priceId: 'price_1',
        quantity: 1,
        paymentBehavior: 'allow_incomplete',
      });

      const call = mockSubscriptionsCreate.mock.calls[0][0];
      expect(call.payment_behavior).toBe('allow_incomplete');
    });
  });

  describe('updateSubscription', () => {
    beforeEach(() => {
      mockSubscriptionsRetrieve.mockResolvedValue({
        id: 'sub_123',
        items: {
          data: [
            { id: 'si_1', price: { id: 'price_old' }, quantity: 1 },
            { id: 'si_2', price: { id: 'price_addon_old' }, quantity: 1 },
          ],
        },
      });
      mockSubscriptionsUpdate.mockResolvedValue({});
    });

    it('should update price and quantity on primary item', async () => {
      await adapter.updateSubscription('sub_123', {
        priceId: 'price_new',
        quantity: 5,
      });

      expect(mockSubscriptionsUpdate).toHaveBeenCalledWith(
        'sub_123',
        expect.objectContaining({
          items: [{ id: 'si_1', price: 'price_new', quantity: 5 }],
          proration_behavior: 'create_prorations',
        }),
      );
    });

    it('should set cancelAtPeriodEnd', async () => {
      await adapter.updateSubscription('sub_123', {
        cancelAtPeriodEnd: true,
      });

      expect(mockSubscriptionsUpdate).toHaveBeenCalledWith(
        'sub_123',
        expect.objectContaining({
          cancel_at_period_end: true,
        }),
      );
    });

    it('should add and remove add-on items', async () => {
      await adapter.updateSubscription('sub_123', {
        addOnPriceIds: {
          add: ['price_new_addon'],
          remove: ['price_addon_old'],
        },
      });

      const call = mockSubscriptionsUpdate.mock.calls[0][0];
      const items = call[1]?.items ?? mockSubscriptionsUpdate.mock.calls[0][1].items;
      expect(items).toEqual(expect.arrayContaining([{ price: 'price_new_addon' }, { id: 'si_2', deleted: true }]));
    });

    it('should use custom prorationBehavior', async () => {
      await adapter.updateSubscription('sub_123', {
        prorationBehavior: 'none',
      });

      expect(mockSubscriptionsUpdate).toHaveBeenCalledWith(
        'sub_123',
        expect.objectContaining({
          proration_behavior: 'none',
        }),
      );
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel at period end', async () => {
      mockSubscriptionsUpdate.mockResolvedValue({});

      await adapter.cancelSubscription('sub_123', { atPeriodEnd: true });

      expect(mockSubscriptionsUpdate).toHaveBeenCalledWith('sub_123', {
        cancel_at_period_end: true,
      });
    });

    it('should cancel immediately', async () => {
      mockSubscriptionsCancel.mockResolvedValue({});

      await adapter.cancelSubscription('sub_123', { atPeriodEnd: false });

      expect(mockSubscriptionsCancel).toHaveBeenCalledWith('sub_123');
    });
  });

  describe('reactivateSubscription', () => {
    it('should reactivate by setting cancel_at_period_end to false', async () => {
      mockSubscriptionsUpdate.mockResolvedValue({});

      await adapter.reactivateSubscription('sub_123');

      expect(mockSubscriptionsUpdate).toHaveBeenCalledWith('sub_123', {
        cancel_at_period_end: false,
      });
    });
  });

  // ─── Subscription Items ───────────────────────────────────────────

  describe('addSubscriptionItem', () => {
    it('should add a subscription item and return its ID when the price is not yet on the subscription', async () => {
      mockSubscriptionsRetrieve.mockResolvedValue({
        id: 'sub_123',
        items: { data: [{ id: 'si_primary', price: { id: 'price_plan' } }] },
      });
      mockSubscriptionItemsCreate.mockResolvedValue({ id: 'si_new' });

      const result = await adapter.addSubscriptionItem('sub_123', 'price_addon');

      expect(result).toBe('si_new');
      expect(mockSubscriptionItemsCreate).toHaveBeenCalledWith({
        subscription: 'sub_123',
        price: 'price_addon',
        proration_behavior: 'create_prorations',
      });
    });

    it('should reuse the existing item (no duplicate create) when the price is already on the subscription', async () => {
      mockSubscriptionsRetrieve.mockResolvedValue({
        id: 'sub_123',
        items: {
          data: [
            { id: 'si_primary', price: { id: 'price_plan' } },
            { id: 'si_existing_addon', price: { id: 'price_addon' } },
          ],
        },
      });

      const result = await adapter.addSubscriptionItem('sub_123', 'price_addon');

      expect(result).toBe('si_existing_addon');
      expect(mockSubscriptionItemsCreate).not.toHaveBeenCalled();
    });

    it('should match an existing item when the price is expanded as a bare string id', async () => {
      mockSubscriptionsRetrieve.mockResolvedValue({
        id: 'sub_123',
        items: { data: [{ id: 'si_existing_addon', price: 'price_addon' }] },
      });

      const result = await adapter.addSubscriptionItem('sub_123', 'price_addon');

      expect(result).toBe('si_existing_addon');
      expect(mockSubscriptionItemsCreate).not.toHaveBeenCalled();
    });
  });

  describe('removeSubscriptionItem', () => {
    it('should remove item without proration by default (cancelAtPeriodEnd=true)', async () => {
      mockSubscriptionItemsDel.mockResolvedValue({});

      await adapter.removeSubscriptionItem('si_123');

      expect(mockSubscriptionItemsDel).toHaveBeenCalledWith('si_123', {
        proration_behavior: 'none',
      });
    });

    it('should remove item with proration when cancelAtPeriodEnd=false', async () => {
      mockSubscriptionItemsDel.mockResolvedValue({});

      await adapter.removeSubscriptionItem('si_123', false);

      expect(mockSubscriptionItemsDel).toHaveBeenCalledWith('si_123', {
        proration_behavior: 'create_prorations',
      });
    });
  });

  // ─── Payment ──────────────────────────────────────────────────────

  describe('createCheckoutSession', () => {
    it('should create a checkout session and return the URL', async () => {
      mockCheckoutSessionsCreate.mockResolvedValue({
        url: 'https://checkout.stripe.com/session_123',
      });

      const result = await adapter.createCheckoutSession({
        providerCustomerId: 'cus_123',
        priceId: 'price_1',
        quantity: 2,
        successUrl: 'https://app.com/success',
        cancelUrl: 'https://app.com/cancel',
        metadata: { plan: 'STARTER' },
      });

      expect(result).toBe('https://checkout.stripe.com/session_123');
    });

    it('should throw if session has no URL', async () => {
      mockCheckoutSessionsCreate.mockResolvedValue({ url: null });

      await expect(
        adapter.createCheckoutSession({
          providerCustomerId: 'cus_123',
          priceId: 'price_1',
          quantity: 1,
          successUrl: 'https://app.com/success',
          cancelUrl: 'https://app.com/cancel',
        }),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('chargeOneTime', () => {
    it('should charge using default payment method', async () => {
      mockCustomersRetrieve.mockResolvedValue({
        invoice_settings: { default_payment_method: 'pm_default' },
      });
      mockPaymentIntentsCreate.mockResolvedValue({ id: 'pi_123' });

      const result = await adapter.chargeOneTime({
        providerCustomerId: 'cus_123',
        amountCents: 5000,
        description: 'Wallet top-up',
      });

      expect(result).toBe('pi_123');
      expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_123',
          payment_method: 'pm_default',
          amount: 5000,
          currency: 'usd',
        }),
      );
    });

    it('should use default_payment_method as object', async () => {
      mockCustomersRetrieve.mockResolvedValue({
        invoice_settings: { default_payment_method: { id: 'pm_obj' } },
      });
      mockPaymentIntentsCreate.mockResolvedValue({ id: 'pi_obj' });

      const result = await adapter.chargeOneTime({
        providerCustomerId: 'cus_123',
        amountCents: 1000,
        description: 'Test',
      });

      expect(result).toBe('pi_obj');
    });

    it('should fall back to first card payment method', async () => {
      mockCustomersRetrieve.mockResolvedValue({
        invoice_settings: { default_payment_method: null },
      });
      mockCustomersListPaymentMethods.mockResolvedValue({
        data: [
          { id: 'pm_bank', type: 'us_bank_account' },
          { id: 'pm_card', type: 'card' },
        ],
      });
      mockPaymentIntentsCreate.mockResolvedValue({ id: 'pi_card' });

      const result = await adapter.chargeOneTime({
        providerCustomerId: 'cus_123',
        amountCents: 2000,
        description: 'Test',
      });

      expect(result).toBe('pi_card');
      expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(expect.objectContaining({ payment_method: 'pm_card' }));
    });

    it('should fall back to us_bank_account if no card', async () => {
      mockCustomersRetrieve.mockResolvedValue({
        invoice_settings: { default_payment_method: null },
      });
      mockCustomersListPaymentMethods.mockResolvedValue({
        data: [{ id: 'pm_bank', type: 'us_bank_account' }],
      });
      mockPaymentIntentsCreate.mockResolvedValue({ id: 'pi_bank' });

      const result = await adapter.chargeOneTime({
        providerCustomerId: 'cus_123',
        amountCents: 2000,
        description: 'Test',
      });

      expect(result).toBe('pi_bank');
    });

    it('should fall back to any payment method', async () => {
      mockCustomersRetrieve.mockResolvedValue({
        invoice_settings: { default_payment_method: null },
      });
      mockCustomersListPaymentMethods.mockResolvedValue({
        data: [{ id: 'pm_link', type: 'link' }],
      });
      mockPaymentIntentsCreate.mockResolvedValue({ id: 'pi_link' });

      const result = await adapter.chargeOneTime({
        providerCustomerId: 'cus_123',
        amountCents: 2000,
        description: 'Test',
      });

      expect(result).toBe('pi_link');
    });

    it('should throw if no payment method available', async () => {
      mockCustomersRetrieve.mockResolvedValue({
        invoice_settings: { default_payment_method: null },
      });
      mockCustomersListPaymentMethods.mockResolvedValue({ data: [] });

      await expect(
        adapter.chargeOneTime({
          providerCustomerId: 'cus_123',
          amountCents: 2000,
          description: 'Test',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('refund', () => {
    it('should create a full refund', async () => {
      mockRefundsCreate.mockResolvedValue({ id: 're_123' });

      const result = await adapter.refund('pi_123');

      expect(result).toBe('re_123');
      expect(mockRefundsCreate).toHaveBeenCalledWith({
        payment_intent: 'pi_123',
      });
    });

    it('should create a partial refund with reason', async () => {
      mockRefundsCreate.mockResolvedValue({ id: 're_partial' });

      const result = await adapter.refund('pi_123', 2500, 'duplicate');

      expect(result).toBe('re_partial');
      expect(mockRefundsCreate).toHaveBeenCalledWith({
        payment_intent: 'pi_123',
        amount: 2500,
        reason: 'duplicate',
      });
    });
  });

  // ─── Payment Methods ──────────────────────────────────────────────

  describe('createSetupSession', () => {
    it('should create a setup session and return URL', async () => {
      mockCheckoutSessionsCreate.mockResolvedValue({
        url: 'https://checkout.stripe.com/setup_123',
      });

      const result = await adapter.createSetupSession('cus_123', 'https://app.com/billing');

      expect(result).toBe('https://checkout.stripe.com/setup_123');
      expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_123',
          mode: 'setup',
          currency: 'usd',
        }),
      );
    });

    it('should throw if setup session has no URL', async () => {
      mockCheckoutSessionsCreate.mockResolvedValue({ url: null });

      await expect(adapter.createSetupSession('cus_123', 'https://app.com/billing')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('listPaymentMethods', () => {
    it('should list card and bank payment methods', async () => {
      mockCustomersListPaymentMethods.mockResolvedValue({
        data: [
          {
            id: 'pm_card',
            type: 'card',
            card: {
              last4: '4242',
              brand: 'visa',
              exp_month: 12,
              exp_year: 2025,
            },
          },
          {
            id: 'pm_bank',
            type: 'us_bank_account',
            us_bank_account: { last4: '6789', bank_name: 'Chase' },
          },
          {
            id: 'pm_link',
            type: 'link',
            link: { email: 'user@test.com' },
          },
        ],
      });

      const result = await adapter.listPaymentMethods('cus_123');

      expect(result).toHaveLength(2);
      expect(result[0].providerPaymentMethodId).toBe('pm_card');
      expect(result[0].type).toBe('card');
      expect(result[0].last4).toBe('4242');
      expect(result[1].type).toBe('us_bank_account');
      expect(result[1].brand).toBe('Chase');
    });

    it('should show Stripe Link when no card/bank methods', async () => {
      mockCustomersListPaymentMethods.mockResolvedValue({
        data: [
          {
            id: 'pm_link',
            type: 'link',
            link: { email: 'user@test.com' },
          },
        ],
      });

      const result = await adapter.listPaymentMethods('cus_123');

      expect(result).toHaveLength(1);
      expect(result[0].brand).toBe('Stripe Link');
      expect(result[0].last4).toBe('.com');
    });

    it('should handle link with no email', async () => {
      mockCustomersListPaymentMethods.mockResolvedValue({
        data: [
          {
            id: 'pm_link_noemail',
            type: 'link',
            link: {},
          },
        ],
      });

      const result = await adapter.listPaymentMethods('cus_123');

      expect(result).toHaveLength(1);
      expect(result[0].last4).toBe('0000');
    });

    it('should return empty array when no methods at all', async () => {
      mockCustomersListPaymentMethods.mockResolvedValue({ data: [] });

      const result = await adapter.listPaymentMethods('cus_123');

      expect(result).toHaveLength(0);
    });
  });

  describe('setDefaultPaymentMethod', () => {
    it('should update customer invoice settings', async () => {
      mockCustomersUpdate.mockResolvedValue({});

      await adapter.setDefaultPaymentMethod('cus_123', 'pm_new');

      expect(mockCustomersUpdate).toHaveBeenCalledWith('cus_123', {
        invoice_settings: { default_payment_method: 'pm_new' },
      });
    });
  });

  describe('deletePaymentMethod', () => {
    it('should detach the payment method', async () => {
      mockPaymentMethodsDetach.mockResolvedValue({});

      await adapter.deletePaymentMethod('pm_123');

      expect(mockPaymentMethodsDetach).toHaveBeenCalledWith('pm_123');
    });
  });

  // ─── Invoices ─────────────────────────────────────────────────────

  describe('listInvoices', () => {
    it('should list and map invoices', async () => {
      mockInvoicesList.mockResolvedValue({
        data: [
          {
            id: 'in_123',
            status: 'paid',
            amount_due: 5000,
            amount_paid: 5000,
            tax: 500,
            period_start: 1700000000,
            period_end: 1702592000,
            lines: {
              data: [
                {
                  description: 'Pro plan',
                  quantity: 2,
                  price: { unit_amount: 2500, id: 'price_1' },
                  amount: 5000,
                },
              ],
            },
            invoice_pdf: 'https://files.stripe.com/pdf',
            hosted_invoice_url: 'https://invoice.stripe.com/123',
            status_transitions: { paid_at: 1700001000 },
          },
        ],
      });

      const result = await adapter.listInvoices('cus_123');

      expect(result).toHaveLength(1);
      expect(result[0].providerInvoiceId).toBe('in_123');
      expect(result[0].status).toBe('paid');
      expect(result[0].lineItems[0].description).toBe('Pro plan');
      expect(result[0].pdfUrl).toBe('https://files.stripe.com/pdf');
      expect(result[0].paidAt).toBeInstanceOf(Date);
    });

    it('should use pagination opts', async () => {
      mockInvoicesList.mockResolvedValue({ data: [] });

      await adapter.listInvoices('cus_123', {
        limit: 5,
        startingAfter: 'in_prev',
      });

      expect(mockInvoicesList).toHaveBeenCalledWith({
        customer: 'cus_123',
        limit: 5,
        starting_after: 'in_prev',
      });
    });

    it('should handle invoice with null optional fields', async () => {
      mockInvoicesList.mockResolvedValue({
        data: [
          {
            id: 'in_minimal',
            status: null,
            amount_due: 0,
            amount_paid: 0,
            tax: null,
            period_start: null,
            period_end: null,
            lines: { data: [] },
            invoice_pdf: null,
            hosted_invoice_url: null,
            status_transitions: { paid_at: null },
          },
        ],
      });

      const result = await adapter.listInvoices('cus_123');

      expect(result[0].status).toBe('draft');
      expect(result[0].taxCents).toBe(0);
      expect(result[0].pdfUrl).toBeUndefined();
      expect(result[0].paidAt).toBeUndefined();
    });
  });

  describe('getUpcomingInvoice', () => {
    it('should retrieve and map upcoming invoice', async () => {
      mockInvoicesRetrieveUpcoming.mockResolvedValue({
        amount_due: 10000,
        tax: 1000,
        lines: {
          data: [
            {
              description: 'Pro plan x2',
              quantity: 2,
              price: { unit_amount: 5000, id: 'price_1' },
              amount: 10000,
            },
          ],
        },
        period_start: 1700000000,
        period_end: 1702592000,
      });

      const result = await adapter.getUpcomingInvoice('cus_123');

      expect(result.amountDueCents).toBe(10000);
      expect(result.taxCents).toBe(1000);
      expect(result.lineItems).toHaveLength(1);
      expect(result.periodStart).toBeInstanceOf(Date);
    });

    it('should handle null tax and missing lines', async () => {
      mockInvoicesRetrieveUpcoming.mockResolvedValue({
        amount_due: 0,
        tax: null,
        lines: null,
        period_start: null,
        period_end: null,
      });

      const result = await adapter.getUpcomingInvoice('cus_123');

      expect(result.taxCents).toBe(0);
      expect(result.lineItems).toEqual([]);
    });
  });

  // ─── Webhooks ─────────────────────────────────────────────────────

  describe('verifyWebhookSignature', () => {
    it('should return true for valid signature', () => {
      mockWebhooksConstructEvent.mockReturnValue({});

      const result = adapter.verifyWebhookSignature(Buffer.from('payload'), 'sig_valid');

      expect(result).toBe(true);
    });

    it('should return false for invalid signature', () => {
      mockWebhooksConstructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const result = adapter.verifyWebhookSignature(Buffer.from('payload'), 'sig_bad');

      expect(result).toBe(false);
    });
  });

  describe('parseWebhookEvent', () => {
    it('should parse a known event type', () => {
      mockWebhooksConstructEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        id: 'evt_123',
        data: { object: { id: 'pi_123', amount: 5000 } },
      });

      const result = adapter.parseWebhookEvent(Buffer.from('payload'), 'sig_valid');

      expect(result.type).toBe('payment.succeeded');
      expect(result.providerEventId).toBe('evt_123');
      expect(result.data).toEqual({ id: 'pi_123', amount: 5000 });
    });

    it('should return generic event for unmapped type', () => {
      mockWebhooksConstructEvent.mockReturnValue({
        type: 'some.unknown.event',
        id: 'evt_unknown',
        data: { object: { foo: 'bar' } },
      });

      const result = adapter.parseWebhookEvent(Buffer.from('payload'), 'sig_valid');

      expect(result.type).toBe('some.unknown.event');
      expect(result.providerEventId).toBe('evt_unknown');
    });
  });
});

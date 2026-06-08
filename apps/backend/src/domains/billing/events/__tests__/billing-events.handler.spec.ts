import { Test, TestingModule } from '@nestjs/testing';
import { BillingEventsHandler } from '../billing-events.handler';
import { SubscriptionService } from '../../services/subscription.service';
import { InvoiceService } from '../../services/invoice.service';
import { DunningService } from '../../services/dunning.service';
import { PaymentMethodService } from '../../services/payment-method.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { BillingEventType, NormalizedBillingEvent } from '../../adapters/payment-provider.interface';

const mockSubscriptionService = {
  handleSubscriptionCreated: jest.fn().mockResolvedValue(undefined),
  handleSubscriptionUpdated: jest.fn().mockResolvedValue(undefined),
  handleSubscriptionCanceled: jest.fn().mockResolvedValue(undefined),
  handleCheckoutSessionCompleted: jest.fn().mockResolvedValue(undefined),
};

const mockInvoiceService = {
  syncInvoice: jest.fn().mockResolvedValue(undefined),
};

const mockDunningService = {
  handlePaymentSucceeded: jest.fn().mockResolvedValue(undefined),
  handlePaymentFailed: jest.fn().mockResolvedValue(undefined),
};

const mockPaymentMethodService = {
  syncPaymentMethodsByCustomerId: jest.fn().mockResolvedValue(undefined),
};

const mockPrisma = {
  processedBillingEvent: {
    create: jest.fn().mockResolvedValue({}),
  },
};

function makeEvent(
  type: BillingEventType,
  data: Record<string, any> = {},
  providerEventId = 'evt_test',
): NormalizedBillingEvent {
  return { type, providerEventId, data };
}

describe('BillingEventsHandler', () => {
  let handler: BillingEventsHandler;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Reset default mock implementations after clearAllMocks
    mockPrisma.processedBillingEvent.create.mockResolvedValue({});
    mockSubscriptionService.handleSubscriptionCreated.mockResolvedValue(undefined);
    mockSubscriptionService.handleSubscriptionUpdated.mockResolvedValue(undefined);
    mockSubscriptionService.handleSubscriptionCanceled.mockResolvedValue(undefined);
    mockSubscriptionService.handleCheckoutSessionCompleted.mockResolvedValue(undefined);
    mockInvoiceService.syncInvoice.mockResolvedValue(undefined);
    mockDunningService.handlePaymentSucceeded.mockResolvedValue(undefined);
    mockDunningService.handlePaymentFailed.mockResolvedValue(undefined);
    mockPaymentMethodService.syncPaymentMethodsByCustomerId.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingEventsHandler,
        { provide: SubscriptionService, useValue: mockSubscriptionService },
        { provide: InvoiceService, useValue: mockInvoiceService },
        { provide: DunningService, useValue: mockDunningService },
        { provide: PaymentMethodService, useValue: mockPaymentMethodService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    handler = module.get<BillingEventsHandler>(BillingEventsHandler);
  });

  // ─── Idempotency ──────────────────────────────────────────────────

  describe('idempotency', () => {
    it('should skip duplicate events (P2002)', async () => {
      const error: any = new Error('Unique constraint');
      error.code = 'P2002';
      mockPrisma.processedBillingEvent.create.mockRejectedValue(error);

      await handler.handleEvent(makeEvent(BillingEventType.PAYMENT_SUCCEEDED));

      // No downstream handlers should be called
      expect(mockDunningService.handlePaymentSucceeded).not.toHaveBeenCalled();
    });

    it('should re-throw non-duplicate DB errors', async () => {
      mockPrisma.processedBillingEvent.create.mockRejectedValueOnce(new Error('DB down'));

      await expect(handler.handleEvent(makeEvent(BillingEventType.PAYMENT_SUCCEEDED))).rejects.toThrow('DB down');
    });
  });

  // ─── Event Routing ────────────────────────────────────────────────

  describe('PAYMENT_SUCCEEDED', () => {
    it('should call dunning and invoice handlers in parallel', async () => {
      const event = makeEvent(BillingEventType.PAYMENT_SUCCEEDED, {
        id: 'pi_1',
      });
      await handler.handleEvent(event);

      expect(mockDunningService.handlePaymentSucceeded).toHaveBeenCalledWith(event);
      expect(mockInvoiceService.syncInvoice).toHaveBeenCalledWith(event);
    });
  });

  describe('PAYMENT_FAILED', () => {
    it('should call dunning handler', async () => {
      const event = makeEvent(BillingEventType.PAYMENT_FAILED);
      await handler.handleEvent(event);

      expect(mockDunningService.handlePaymentFailed).toHaveBeenCalledWith(event);
    });
  });

  describe('SUBSCRIPTION_CREATED', () => {
    it('should call subscription created handler', async () => {
      const event = makeEvent(BillingEventType.SUBSCRIPTION_CREATED);
      await handler.handleEvent(event);

      expect(mockSubscriptionService.handleSubscriptionCreated).toHaveBeenCalledWith(event);
    });
  });

  describe('SUBSCRIPTION_UPDATED', () => {
    it('should call subscription updated handler', async () => {
      const event = makeEvent(BillingEventType.SUBSCRIPTION_UPDATED);
      await handler.handleEvent(event);

      expect(mockSubscriptionService.handleSubscriptionUpdated).toHaveBeenCalledWith(event);
    });
  });

  describe('SUBSCRIPTION_CANCELED', () => {
    it('should call subscription canceled handler', async () => {
      const event = makeEvent(BillingEventType.SUBSCRIPTION_CANCELED);
      await handler.handleEvent(event);

      expect(mockSubscriptionService.handleSubscriptionCanceled).toHaveBeenCalledWith(event);
    });
  });

  describe('INVOICE_CREATED', () => {
    it('should sync invoice', async () => {
      const event = makeEvent(BillingEventType.INVOICE_CREATED);
      await handler.handleEvent(event);

      expect(mockInvoiceService.syncInvoice).toHaveBeenCalledWith(event);
    });
  });

  describe('INVOICE_PAID', () => {
    it('should sync invoice', async () => {
      const event = makeEvent(BillingEventType.INVOICE_PAID);
      await handler.handleEvent(event);

      expect(mockInvoiceService.syncInvoice).toHaveBeenCalledWith(event);
    });
  });

  describe('INVOICE_PAYMENT_FAILED', () => {
    it('should call dunning handler', async () => {
      const event = makeEvent(BillingEventType.INVOICE_PAYMENT_FAILED);
      await handler.handleEvent(event);

      expect(mockDunningService.handlePaymentFailed).toHaveBeenCalledWith(event);
    });
  });

  describe('CHECKOUT_SESSION_COMPLETED', () => {
    it('should handle checkout with subscription and customer', async () => {
      const event = makeEvent(BillingEventType.CHECKOUT_SESSION_COMPLETED, {
        subscription: 'sub_123',
        customer: 'cus_123',
      });
      await handler.handleEvent(event);

      expect(mockSubscriptionService.handleCheckoutSessionCompleted).toHaveBeenCalledWith('cus_123', 'sub_123');
    });

    it('should skip if no subscription in session', async () => {
      const event = makeEvent(BillingEventType.CHECKOUT_SESSION_COMPLETED, {
        subscription: null,
        customer: 'cus_123',
      });
      await handler.handleEvent(event);

      expect(mockSubscriptionService.handleCheckoutSessionCompleted).not.toHaveBeenCalled();
    });

    it('should skip if no customer in session', async () => {
      const event = makeEvent(BillingEventType.CHECKOUT_SESSION_COMPLETED, {
        subscription: 'sub_123',
        customer: null,
      });
      await handler.handleEvent(event);

      expect(mockSubscriptionService.handleCheckoutSessionCompleted).not.toHaveBeenCalled();
    });
  });

  describe('PAYMENT_METHOD_ATTACHED', () => {
    it('should sync payment methods by customer ID', async () => {
      const event = makeEvent(BillingEventType.PAYMENT_METHOD_ATTACHED, {
        customer: 'cus_123',
      });
      await handler.handleEvent(event);

      expect(mockPaymentMethodService.syncPaymentMethodsByCustomerId).toHaveBeenCalledWith('cus_123');
    });

    it('should skip if no customer ID', async () => {
      const event = makeEvent(BillingEventType.PAYMENT_METHOD_ATTACHED, {
        customer: null,
      });
      await handler.handleEvent(event);

      expect(mockPaymentMethodService.syncPaymentMethodsByCustomerId).not.toHaveBeenCalled();
    });
  });

  describe('PAYMENT_METHOD_DETACHED', () => {
    it('should sync payment methods by customer ID', async () => {
      const event = makeEvent(BillingEventType.PAYMENT_METHOD_DETACHED, {
        customer: 'cus_456',
      });
      await handler.handleEvent(event);

      expect(mockPaymentMethodService.syncPaymentMethodsByCustomerId).toHaveBeenCalledWith('cus_456');
    });
  });

  // ─── Error handling ───────────────────────────────────────────────

  describe('error handling', () => {
    it('should re-throw errors from handlers for webhook retry', async () => {
      mockDunningService.handlePaymentFailed.mockRejectedValueOnce(new Error('Processing failed'));

      await expect(handler.handleEvent(makeEvent(BillingEventType.PAYMENT_FAILED))).rejects.toThrow(
        'Processing failed',
      );
    });
  });

  // ─── Default case ─────────────────────────────────────────────────

  describe('unhandled event type', () => {
    it('should log debug for unknown event type and not throw', async () => {
      const event: any = {
        type: 'unknown.event.type',
        providerEventId: 'evt_unknown',
        data: {},
      };
      // Should not throw
      await handler.handleEvent(event);

      // None of the handlers should have been called
      expect(mockDunningService.handlePaymentSucceeded).not.toHaveBeenCalled();
      expect(mockSubscriptionService.handleSubscriptionCreated).not.toHaveBeenCalled();
    });
  });
});

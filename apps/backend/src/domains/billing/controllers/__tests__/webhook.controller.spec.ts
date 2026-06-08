import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { WebhookController } from '../webhook.controller';
import { PaymentProviderFactory } from '../../adapters/payment-provider.factory';
import { BillingEventsHandler } from '../../events/billing-events.handler';
import { BillingEventType } from '../../adapters/payment-provider.interface';

const mockAdapter = {
  verifyWebhookSignature: jest.fn(),
  parseWebhookEvent: jest.fn(),
};

const mockProviderFactory = {
  getAdapter: jest.fn().mockReturnValue(mockAdapter),
};

const mockBillingEventsHandler = {
  handleEvent: jest.fn().mockResolvedValue(undefined),
};

describe('WebhookController', () => {
  let controller: WebhookController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [
        { provide: PaymentProviderFactory, useValue: mockProviderFactory },
        { provide: BillingEventsHandler, useValue: mockBillingEventsHandler },
      ],
    }).compile();

    controller = module.get<WebhookController>(WebhookController);
  });

  it('should throw if no signature provided', async () => {
    const req = { rawBody: Buffer.from('{}') } as any;
    await expect(controller.handleBillingWebhook(req, '')).rejects.toThrow(BadRequestException);
  });

  it('should throw if no signature (undefined)', async () => {
    const req = { rawBody: Buffer.from('{}') } as any;
    await expect(controller.handleBillingWebhook(req, undefined as any)).rejects.toThrow(BadRequestException);
  });

  it('should throw if raw body not available', async () => {
    const req = {} as any; // no rawBody
    await expect(controller.handleBillingWebhook(req, 'sig_test')).rejects.toThrow(BadRequestException);
  });

  it('should throw if webhook signature is invalid', async () => {
    const req = { rawBody: Buffer.from('{}') } as any;
    mockAdapter.verifyWebhookSignature.mockReturnValue(false);

    await expect(controller.handleBillingWebhook(req, 'sig_bad')).rejects.toThrow(BadRequestException);
  });

  it('should skip unhandled event types', async () => {
    const req = { rawBody: Buffer.from('{}') } as any;
    mockAdapter.verifyWebhookSignature.mockReturnValue(true);
    mockAdapter.parseWebhookEvent.mockReturnValue({
      type: 'some.unknown.type',
      providerEventId: 'evt_1',
      data: {},
    });

    const result = await controller.handleBillingWebhook(req, 'sig_valid');

    expect(result).toEqual({ received: true });
    expect(mockBillingEventsHandler.handleEvent).not.toHaveBeenCalled();
  });

  it('should dispatch known event types to handler', async () => {
    const req = { rawBody: Buffer.from('{}') } as any;
    mockAdapter.verifyWebhookSignature.mockReturnValue(true);
    mockAdapter.parseWebhookEvent.mockReturnValue({
      type: BillingEventType.PAYMENT_SUCCEEDED,
      providerEventId: 'evt_2',
      data: { id: 'pi_123' },
    });

    const result = await controller.handleBillingWebhook(req, 'sig_valid');

    expect(result).toEqual({ received: true });
    expect(mockBillingEventsHandler.handleEvent).toHaveBeenCalledWith({
      type: BillingEventType.PAYMENT_SUCCEEDED,
      providerEventId: 'evt_2',
      data: { id: 'pi_123' },
    });
  });

  it('should dispatch each known billing event type', async () => {
    const req = { rawBody: Buffer.from('{}') } as any;
    mockAdapter.verifyWebhookSignature.mockReturnValue(true);

    for (const eventType of Object.values(BillingEventType)) {
      mockAdapter.parseWebhookEvent.mockReturnValue({
        type: eventType,
        providerEventId: `evt_${eventType}`,
        data: {},
      });

      const result = await controller.handleBillingWebhook(req, 'sig_valid');
      expect(result).toEqual({ received: true });
    }

    expect(mockBillingEventsHandler.handleEvent).toHaveBeenCalledTimes(Object.values(BillingEventType).length);
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { WebhookController } from '../webhook.controller';
import { SamsaraWebhookService } from '../samsara-webhook.service';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

describe('WebhookController', () => {
  let controller: WebhookController;
  const webhookSecret = 'test-webhook-secret';

  const mockWebhookService = {
    handleEvent: jest.fn().mockResolvedValue(undefined),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'SAMSARA_WEBHOOK_SECRET') return webhookSecret;
      return undefined;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [
        { provide: SamsaraWebhookService, useValue: mockWebhookService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    controller = module.get<WebhookController>(WebhookController);
    jest.clearAllMocks();
  });

  it('should accept valid HMAC signature and route to handler', async () => {
    const payload = {
      eventId: 'evt-1',
      eventType: 'HosViolation' as const,
      eventTime: '2026-02-18T12:00:00Z',
      orgId: 123,
      data: { driver: { id: 'D1', name: 'John' } },
    };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const signature = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');

    await controller.handleSamsaraWebhook(signature, payload, {
      rawBody,
    } as any);

    expect(mockWebhookService.handleEvent).toHaveBeenCalledWith(payload);
  });

  it('should reject invalid HMAC signature', async () => {
    const payload = {
      eventId: 'evt-2',
      eventType: 'GeofenceEntry' as const,
      eventTime: '2026-02-18T12:00:00Z',
      orgId: 123,
      data: {},
    };

    await expect(
      controller.handleSamsaraWebhook('invalid-signature', payload, {
        rawBody: Buffer.from(JSON.stringify(payload)),
      } as any),
    ).rejects.toThrow('Invalid webhook signature');
  });
});

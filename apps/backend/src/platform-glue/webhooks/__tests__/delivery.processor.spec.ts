import { Test } from '@nestjs/testing';
import { Job } from 'bullmq';
import type { JobEnvelope } from '@app/shared-types';
import { WebhookDeliveryProcessor, WebhookDeliveryPayload } from '../delivery.processor';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { DeadLetterService } from '@appshore/platform/infrastructure/queue/dead-letter.service';
import * as crypto from 'crypto';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockPrisma = {
  webhookDeliveryLog: {
    create: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
  },
  webhookSubscription: {
    findUnique: jest.fn(),
  },
  tenant: {
    findUnique: jest.fn().mockResolvedValue({ jobsPaused: false }),
  },
};

const mockDeadLetter = {
  recordPermanentFailure: jest.fn().mockResolvedValue(undefined),
};

const makeEnvelope = (payload: WebhookDeliveryPayload): JobEnvelope<WebhookDeliveryPayload> => ({
  tenantId: payload.payload.tenantId,
  correlationId: 'corr-1',
  causationId: 'cause-1',
  payload,
  metadata: {
    enqueuedAt: new Date().toISOString(),
    source: 'event',
    version: 1,
  },
});

const makeJob = (
  payload: WebhookDeliveryPayload,
  attemptsMade = 0,
  attempts = 3,
): Job<JobEnvelope<WebhookDeliveryPayload>> =>
  ({
    id: 'job-1',
    name: 'deliver',
    queueName: 'webhooks',
    data: makeEnvelope(payload),
    attemptsMade,
    opts: { attempts },
  }) as unknown as Job<JobEnvelope<WebhookDeliveryPayload>>;

describe('WebhookDeliveryProcessor', () => {
  let processor: WebhookDeliveryProcessor;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        WebhookDeliveryProcessor,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DeadLetterService, useValue: mockDeadLetter },
      ],
    }).compile();

    processor = module.get(WebhookDeliveryProcessor);
  });

  describe('computeSignature', () => {
    it('produces sha256=<hex> matching HMAC-SHA256 of JSON payload', () => {
      const secret = 'my-secret';
      const payload = {
        id: 'evt-1',
        event: 'app.notification.created',
        tenantId: 'tenant_x',
        data: {},
      };
      const body = JSON.stringify(payload);
      const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');

      const result = processor.computeSignature(secret, body);

      expect(result).toBe(expected);
    });
  });

  describe('process', () => {
    const subscription = {
      id: 'sub-1',
      tenantId: 'tenant_x',
      url: 'https://partner.com/hook',
      secret: 'my-secret',
      events: ['app.notification.created'],
      active: true,
    };

    const jobPayload: WebhookDeliveryPayload = {
      subscriptionId: 'sub-1',
      logId: 'log-1',
      payload: {
        id: 'evt-1',
        event: 'app.notification.created',
        tenantId: 'tenant_x',
        timestamp: new Date().toISOString(),
        data: {},
      },
    };

    it('marks delivery as successful and updates log on 2xx response', async () => {
      mockPrisma.webhookSubscription.findUnique.mockResolvedValue(subscription);
      mockPrisma.webhookDeliveryLog.findUnique.mockResolvedValue({
        id: 'log-1',
        attempts: 0,
      });
      mockedAxios.post.mockResolvedValue({ status: 200, data: 'ok' });
      mockPrisma.webhookDeliveryLog.update.mockResolvedValue({});

      await processor.process(makeJob(jobPayload, 0));

      expect(mockedAxios.post).toHaveBeenCalledWith(
        subscription.url,
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Webhook-Signature': expect.stringMatching(/^sha256=/),
            'X-Webhook-Event': 'app.notification.created',
          }),
        }),
      );
      expect(mockPrisma.webhookDeliveryLog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deliveredAt: expect.any(Date),
            responseStatus: 200,
          }),
        }),
      );
    });

    it('throws and logs failure on 4xx response', async () => {
      mockPrisma.webhookSubscription.findUnique.mockResolvedValue(subscription);
      mockPrisma.webhookDeliveryLog.findUnique.mockResolvedValue({
        id: 'log-1',
        attempts: 0,
      });
      mockedAxios.post.mockResolvedValue({ status: 404, data: 'Not Found' });
      mockPrisma.webhookDeliveryLog.update.mockResolvedValue({});

      await expect(processor.process(makeJob(jobPayload, 0))).rejects.toThrow('Webhook delivery failed with HTTP 404');

      expect(mockPrisma.webhookDeliveryLog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ responseStatus: 404 }),
        }),
      );
      // deliveredAt must NOT be set
      const updateCall = mockPrisma.webhookDeliveryLog.update.mock.calls[0][0];
      expect(updateCall.data.deliveredAt).toBeUndefined();
    });

    it('marks delivery as failed after final attempt on network error', async () => {
      mockPrisma.webhookSubscription.findUnique.mockResolvedValue(subscription);
      mockPrisma.webhookDeliveryLog.findUnique.mockResolvedValue({
        id: 'log-1',
        attempts: 2,
      });
      mockedAxios.post.mockRejectedValue(new Error('Connection refused'));
      mockPrisma.webhookDeliveryLog.update.mockResolvedValue({});

      await expect(processor.process(makeJob(jobPayload, 2))).rejects.toThrow();

      expect(mockPrisma.webhookDeliveryLog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ failedAt: expect.any(Date) }),
        }),
      );
    });
  });

  describe('onFailed (dead-letter persistence)', () => {
    const jobPayload: WebhookDeliveryPayload = {
      subscriptionId: 'sub-1',
      logId: 'log-1',
      payload: {
        id: 'evt-1',
        event: 'app.notification.created',
        tenantId: 'tenant_x',
        timestamp: new Date().toISOString(),
        data: {},
      },
    };

    it('persists to DLQ when final attempt fails', async () => {
      const job = makeJob(jobPayload, 3, 3); // attemptsMade === attempts
      const err = new Error('boom');

      await processor.onFailed(job, err);

      expect(mockDeadLetter.recordPermanentFailure).toHaveBeenCalledTimes(1);
      expect(mockDeadLetter.recordPermanentFailure).toHaveBeenCalledWith(job, err);
    });

    it('does not persist to DLQ on intermediate failures', async () => {
      const job = makeJob(jobPayload, 1, 3); // attemptsMade < attempts
      const err = new Error('transient');

      await processor.onFailed(job, err);

      expect(mockDeadLetter.recordPermanentFailure).not.toHaveBeenCalled();
    });
  });
});

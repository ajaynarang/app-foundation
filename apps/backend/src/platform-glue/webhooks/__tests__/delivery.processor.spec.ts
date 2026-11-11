import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Job, UnrecoverableError } from 'bullmq';
import type { JobEnvelope } from '@app/shared-types';
import { WebhookDeliveryProcessor, WebhookDeliveryPayload } from '../delivery.processor';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { DeadLetterService } from '@appshore/platform/infrastructure/queue/dead-letter.service';
import { signLegacyWebhook, signStandardWebhook } from '../standard-webhooks';
import axios from 'axios';
import { UnsafeWebhookTargetError } from '@appshore/kernel/infrastructure/outbound-webhooks/webhook-url.validator';

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
        { provide: ConfigService, useValue: { get: () => false } },
      ],
    }).compile();

    processor = module.get(WebhookDeliveryProcessor);
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

  describe('Standard Webhooks signature', () => {
    const jobPayload: WebhookDeliveryPayload = {
      subscriptionId: 'sub-1',
      logId: 'log-1',
      payload: {
        id: 'evt-1',
        event: 'app.notification.created',
        version: 2,
        tenantId: 'tenant_x',
        timestamp: '2026-11-11T12:00:00.000Z',
        data: { hello: 'world' },
      },
    };
    const NOW_MS = Date.parse('2026-11-11T12:00:00Z');
    const NOW_SECONDS = NOW_MS / 1000;
    const secret = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
    const oldSecret = 'ab'.repeat(32);
    const base = { id: 'sub-1', tenantId: 1, url: 'https://partner.com/hook', active: true };

    const deliver = async (subscription: Record<string, unknown>) => {
      mockPrisma.webhookSubscription.findUnique.mockResolvedValue({ ...base, ...subscription });
      mockPrisma.webhookDeliveryLog.update.mockResolvedValue({});
      mockedAxios.post.mockResolvedValue({ status: 200, data: 'ok' });
      await processor.process(makeJob(jobPayload, 0));
      const [, body, options] = mockedAxios.post.mock.calls[0] as [string, string, { headers: Record<string, string> }];
      return { body, headers: options.headers };
    };

    beforeEach(() => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }).setSystemTime(NOW_MS);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('sends webhook-id, webhook-timestamp and a v1 signature over "id.timestamp.body"', async () => {
      const { body, headers } = await deliver({ secret, previousSecret: null, previousSecretExpiresAt: null });

      expect(body).toBe(JSON.stringify(jobPayload.payload));
      expect(headers['webhook-id']).toBe('log-1');
      expect(headers['webhook-timestamp']).toBe(String(NOW_SECONDS));
      expect(headers['webhook-signature']).toBe(signStandardWebhook(secret, 'log-1', NOW_SECONDS, body));
      expect(headers['webhook-signature']).toMatch(/^v1,[A-Za-z0-9+/]+=*$/);
    });

    it('still sends the legacy headers, signed over the body with the current secret', async () => {
      const { body, headers } = await deliver({ secret, previousSecret: null, previousSecretExpiresAt: null });

      expect(headers['X-Webhook-Signature']).toBe(signLegacyWebhook(secret, body));
      expect(headers['X-Webhook-Event']).toBe('app.notification.created');
      expect(headers['X-Webhook-Delivery']).toBe('log-1');
      expect(headers['X-Webhook-Event-Version']).toBe('2');
    });

    it('signs with the new and the previous secret during a rotation overlap', async () => {
      const { body, headers } = await deliver({
        secret,
        previousSecret: oldSecret,
        previousSecretExpiresAt: new Date(NOW_MS + 60_000),
      });

      expect(headers['webhook-signature'].split(' ')).toEqual([
        signStandardWebhook(secret, 'log-1', NOW_SECONDS, body),
        signStandardWebhook(oldSecret, 'log-1', NOW_SECONDS, body),
      ]);
    });

    it('stops signing with the previous secret once the overlap has ended', async () => {
      const { body, headers } = await deliver({
        secret,
        previousSecret: oldSecret,
        previousSecretExpiresAt: new Date(NOW_MS - 1),
      });

      expect(headers['webhook-signature']).toBe(signStandardWebhook(secret, 'log-1', NOW_SECONDS, body));
    });
  });

  describe('SSRF guard at delivery', () => {
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
    const subscriptionAt = (url: string) => ({ id: 'sub-1', tenantId: 1, url, secret: 'my-secret', active: true });

    beforeEach(() => {
      mockPrisma.webhookDeliveryLog.update.mockResolvedValue({});
    });

    it.each([
      ['the metadata address', 'http://169.254.169.254/latest/meta-data/'],
      ['loopback', 'https://127.0.0.1/hook'],
      ['a private address', 'https://10.0.0.5/hook'],
      ['an IPv6-mapped private address', 'https://[::ffff:192.168.1.10]/hook'],
      ['an internal name', 'https://redis.internal/hook'],
    ])('refuses a stored URL that names %s without sending, and does not retry', async (_label, url) => {
      mockPrisma.webhookSubscription.findUnique.mockResolvedValue(subscriptionAt(url));

      await expect(processor.process(makeJob(jobPayload, 0))).rejects.toThrow(UnrecoverableError);

      expect(mockedAxios.post).not.toHaveBeenCalled();
      expect(mockPrisma.webhookDeliveryLog.update).toHaveBeenCalledWith({
        where: { id: 'log-1' },
        data: expect.objectContaining({
          responseStatus: null,
          responseBody: expect.stringMatching(/^Refused: /),
          failedAt: expect.any(Date),
        }),
      });
    });

    it('refuses, without retry, when the host resolves to a blocked address on connect', async () => {
      mockPrisma.webhookSubscription.findUnique.mockResolvedValue(subscriptionAt('https://partner.com/hook'));
      // What axios throws when the agent's lookup refuses: an AxiosError carrying the cause.
      mockedAxios.post.mockRejectedValue(
        Object.assign(new Error('request failed'), {
          cause: new UnsafeWebhookTargetError('resolves to a non-public address (10.0.0.5)'),
        }),
      );

      await expect(processor.process(makeJob(jobPayload, 0))).rejects.toThrow(UnrecoverableError);

      expect(mockPrisma.webhookDeliveryLog.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ failedAt: expect.any(Date) }) }),
      );
    });

    it('sends through the guarded agents, follows no redirect and uses no environment proxy', async () => {
      mockPrisma.webhookSubscription.findUnique.mockResolvedValue(subscriptionAt('https://partner.com/hook'));
      mockedAxios.post.mockResolvedValue({ status: 200, data: 'ok' });

      await processor.process(makeJob(jobPayload, 0));

      const options = mockedAxios.post.mock.calls[0][2] as Record<string, any>;
      expect(options.maxRedirects).toBe(0);
      expect(options.proxy).toBe(false);
      expect(options.httpAgent.options.lookup).toEqual(expect.any(Function));
      expect(options.httpsAgent.options.lookup).toEqual(expect.any(Function));
    });

    it('treats a redirect response as a failed delivery', async () => {
      mockPrisma.webhookSubscription.findUnique.mockResolvedValue(subscriptionAt('https://partner.com/hook'));
      mockedAxios.post.mockResolvedValue({ status: 302, data: '' });

      await expect(processor.process(makeJob(jobPayload, 0))).rejects.toThrow('Webhook delivery failed with HTTP 302');
    });

    it('records a refused delivery in the dead-letter log at once', async () => {
      const job = makeJob(jobPayload, 1, 3);
      const err = new UnrecoverableError('Refused');

      await processor.onFailed(job, err);

      expect(mockDeadLetter.recordPermanentFailure).toHaveBeenCalledWith(job, err);
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

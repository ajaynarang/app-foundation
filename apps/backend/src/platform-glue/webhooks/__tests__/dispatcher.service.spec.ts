import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { WebhookDispatcher } from '../dispatcher.service';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { QUEUE_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import { DomainEvent } from '@appshore/kernel/infrastructure/events/domain-event';
import { Prisma } from '@appshore/db';

const mockQueue = { add: jest.fn() };
const mockPrisma = {
  tenant: {
    findUnique: jest.fn().mockResolvedValue({ id: 1 }),
  },
  webhookSubscription: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  webhookDeliveryLog: {
    create: jest.fn().mockResolvedValue({ id: 'log-1' }),
    findUnique: jest.fn().mockResolvedValue(null),
  },
};

describe('WebhookDispatcher', () => {
  let dispatcher: WebhookDispatcher;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.tenant.findUnique.mockResolvedValue({ id: 1 });
    mockPrisma.webhookDeliveryLog.create.mockResolvedValue({ id: 'log-1' });
    mockPrisma.webhookDeliveryLog.findUnique.mockResolvedValue(null);

    const module = await Test.createTestingModule({
      providers: [
        WebhookDispatcher,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: getQueueToken(QUEUE_NAMES.WEBHOOKS),
          useValue: mockQueue,
        },
      ],
    }).compile();

    dispatcher = module.get(WebhookDispatcher);
  });

  it('enqueues a job for each matching active subscription', async () => {
    mockPrisma.webhookSubscription.findMany.mockResolvedValue([
      {
        id: 'sub-1',
        tenantId: 1,
        url: 'https://a.com',
        events: ['app.user.invited'],
        active: true,
      },
      {
        id: 'sub-2',
        tenantId: 1,
        url: 'https://b.com',
        events: ['*'],
        active: true,
      },
    ]);

    const event = new DomainEvent('app.user.invited', 'tenant_x', {
      invitationId: 'inv-001',
    });
    await dispatcher.dispatchEvent(event);

    expect(mockQueue.add).toHaveBeenCalledTimes(2);
    expect(mockQueue.add).toHaveBeenCalledWith(
      'deliver',
      expect.objectContaining({
        tenantId: 'tenant_x',
        causationId: expect.any(String),
        metadata: expect.objectContaining({ source: 'event', version: 1 }),
        payload: expect.objectContaining({
          subscriptionId: expect.any(String),
          logId: 'log-1',
        }),
      }),
      expect.objectContaining({
        backoff: { type: 'exponential', delay: 30_000 },
      }),
    );
  });

  it('skips internal events (sync, preferences, flags)', async () => {
    // Every entry must be registered with visibility:'internal' in the
    // event registry — unregistered events are NOT skipped.
    const internalEvents = [
      'app.sync.started',
      'app.sync.completed',
      'app.sync.failed',
      'app.preferences.updated',
      'app.feature-flag.toggled',
      'app.user.created',
      'app.notification.sent',
      'app.desk.episode-changed',
    ];

    for (const eventName of internalEvents) {
      jest.clearAllMocks();
      const event = new DomainEvent(eventName, 'tenant_x', {});
      await dispatcher.dispatchEvent(event);
      expect(mockPrisma.webhookSubscription.findMany).not.toHaveBeenCalled();
    }
  });

  it('includes version and actor in payload', async () => {
    mockPrisma.webhookSubscription.findMany.mockResolvedValue([{ id: 'sub-1', tenantId: 1, active: true }]);

    const actor = { id: 'u-1', type: 'user' as const, label: 'John' };
    const event = new DomainEvent('app.user.invited', 'tenant_x', { invitationId: 'inv-1' }, actor);
    await dispatcher.dispatchEvent(event);

    const createCall = mockPrisma.webhookDeliveryLog.create.mock.calls[0][0];
    expect(createCall.data.payload.version).toBe(1);
    expect(createCall.data.payload.actor).toEqual(actor);
  });

  it('strips recipientUserIds from outbound webhook payloads (bridge-internal SSE routing must not leak)', async () => {
    mockPrisma.webhookSubscription.findMany.mockResolvedValue([{ id: 'sub-1', tenantId: 1, active: true }]);

    // app.notification.created is visibility:'external' so it normally would
    // be sent — confirm recipientUserIds is removed from the body.
    const event = new DomainEvent('app.notification.created', 'tenant_x', {
      notificationId: 'n-1',
      priority: 'critical',
      title: 'X',
      message: 'Y',
      recipientUserIds: ['user-a-1', 'user-b-2'],
    });

    await dispatcher.dispatchEvent(event);

    const createCall = mockPrisma.webhookDeliveryLog.create.mock.calls[0][0];
    const payloadData = createCall.data.payload.data;
    expect(payloadData).toEqual({
      notificationId: 'n-1',
      priority: 'critical',
      title: 'X',
      message: 'Y',
    });
    expect(payloadData).not.toHaveProperty('recipientUserIds');
  });

  it('does not enqueue if no active subscriptions match', async () => {
    mockPrisma.webhookSubscription.findMany.mockResolvedValue([]);

    const event = new DomainEvent('app.user.invited', 'tenant_x', {});
    await dispatcher.dispatchEvent(event);

    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  describe('a second delivery of the same event (the outbox and the durable queue are at least once)', () => {
    const sub = { id: 'sub-1', tenantId: 1, url: 'https://a.com', events: ['*'], active: true };
    const event = new DomainEvent('app.user.invited', 'tenant_x', { invitationId: 'inv-1' });

    beforeEach(() => mockPrisma.webhookSubscription.findMany.mockResolvedValue([sub]));

    it('keys the delivery job on the event id and the subscription', async () => {
      await dispatcher.dispatchEvent(event);

      // A keyed lookup on the (subscription_id, event_id) unique index, not a scan of the subscription's log rows.
      expect(mockPrisma.webhookDeliveryLog.findUnique).toHaveBeenCalledWith({
        where: { subscriptionId_eventId: { subscriptionId: 'sub-1', eventId: event.id } },
        select: { id: true, deliveredAt: true, failedAt: true },
      });
      expect(mockPrisma.webhookDeliveryLog.create.mock.calls[0][0].data).toMatchObject({
        subscriptionId: 'sub-1',
        eventId: event.id,
      });
      expect(mockQueue.add.mock.calls[0][2]).toMatchObject({ jobId: `webhook-${event.id}-sub-1` });
      expect(mockQueue.add.mock.calls[0][1].payload.payload.id).toBe(event.id);
    });

    it('writes no second log row and re-adds the same job id while the first delivery is pending', async () => {
      mockPrisma.webhookDeliveryLog.findUnique.mockResolvedValue({
        id: 'log-first',
        deliveredAt: null,
        failedAt: null,
      });

      await dispatcher.dispatchEvent(event);

      expect(mockPrisma.webhookDeliveryLog.create).not.toHaveBeenCalled();
      // BullMQ ignores an add whose job id it already holds; if the first add was lost, this one queues it.
      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(mockQueue.add.mock.calls[0][1].payload.logId).toBe('log-first');
      expect(mockQueue.add.mock.calls[0][2]).toMatchObject({ jobId: `webhook-${event.id}-sub-1` });
    });

    it.each([
      ['delivered', { deliveredAt: new Date(), failedAt: null }],
      ['given up on', { deliveredAt: null, failedAt: new Date() }],
    ])('does nothing for a subscription whose delivery was already %s', async (_label, state) => {
      mockPrisma.webhookDeliveryLog.findUnique.mockResolvedValue({ id: 'log-first', ...state });

      await dispatcher.dispatchEvent(event);

      expect(mockPrisma.webhookDeliveryLog.create).not.toHaveBeenCalled();
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    const uniqueViolation = () =>
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });

    it('reuses the row a concurrent dispatch wrote first when the unique index refuses its own insert', async () => {
      mockPrisma.webhookDeliveryLog.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'log-concurrent', deliveredAt: null, failedAt: null });
      mockPrisma.webhookDeliveryLog.create.mockRejectedValueOnce(uniqueViolation());

      await dispatcher.dispatchEvent(event);

      expect(mockPrisma.webhookDeliveryLog.create).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(mockQueue.add.mock.calls[0][1].payload.logId).toBe('log-concurrent');
      expect(mockQueue.add.mock.calls[0][2]).toMatchObject({ jobId: `webhook-${event.id}-sub-1` });
    });

    it('does nothing when the concurrent dispatch that won the insert has already finished', async () => {
      mockPrisma.webhookDeliveryLog.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'log-concurrent', deliveredAt: new Date(), failedAt: null });
      mockPrisma.webhookDeliveryLog.create.mockRejectedValueOnce(uniqueViolation());

      await dispatcher.dispatchEvent(event);

      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('deliverToSubscription', () => {
    it('enqueues a single job for the specified subscription', async () => {
      const sub = {
        id: 'sub-1',
        tenantId: 1,
        url: 'https://a.com',
        active: true,
        tenant: { tenantId: 'tenant_x' },
      };
      mockPrisma.webhookSubscription.findUnique.mockResolvedValue(sub);
      mockPrisma.webhookDeliveryLog.create.mockResolvedValue({
        id: 'log-test',
      });

      const logId = await dispatcher.deliverToSubscription('sub-1', 'app.user.invited', {
        test: true,
      });

      // The caller (the test route) answers 202 with this delivery, so the id must come back.
      expect(logId).toBe('log-test');

      expect(mockPrisma.webhookSubscription.findUnique).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        include: { tenant: { select: { tenantId: true } } },
      });
      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'deliver',
        expect.objectContaining({
          tenantId: 'tenant_x',
          metadata: expect.objectContaining({ source: 'api', version: 1 }),
          payload: expect.objectContaining({ subscriptionId: 'sub-1' }),
        }),
        expect.objectContaining({
          backoff: { type: 'exponential', delay: 30_000 },
        }),
      );
    });

    it('does nothing if subscription is inactive', async () => {
      mockPrisma.webhookSubscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        active: false,
      });

      const logId = await dispatcher.deliverToSubscription('sub-1', 'app.user.invited', {});

      expect(logId).toBeNull();
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('does nothing if subscription is not found', async () => {
      mockPrisma.webhookSubscription.findUnique.mockResolvedValue(null);

      await dispatcher.deliverToSubscription('sub-1', 'app.user.invited', {});

      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });
});

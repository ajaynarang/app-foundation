import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { WebhookDispatcher } from '../dispatcher.service';
import { PrismaService } from '../../database/prisma.service';
import { QUEUE_NAMES } from '../../queue/queue.constants';
import { DomainEvent } from '../../events/domain-event';

const mockQueue = { add: jest.fn() };
const mockPrisma = {
  tenant: {
    findUnique: jest.fn().mockResolvedValue({ id: 1 }),
  },
  webhookSubscription: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  webhookDeliveryLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) },
};

describe('WebhookDispatcher', () => {
  let dispatcher: WebhookDispatcher;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.tenant.findUnique.mockResolvedValue({ id: 1 });
    mockPrisma.webhookDeliveryLog.create.mockResolvedValue({ id: 'log-1' });

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
        events: ['sally.load.created'],
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

    const event = new DomainEvent('sally.load.created', 'tenant_x', {
      loadId: 'LD-001',
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

  it('skips internal events (sync, telematics, preferences)', async () => {
    const internalEvents = [
      'sally.sync.started',
      'sally.sync.completed',
      'sally.sync.failed',
      'sally.telematics.updated',
      'sally.preferences.updated',
      'sally.feature-flag.toggled',
      'sally.trip.route-stale',
      'sally.alert.unsnoozed',
      'sally.user.created',
      'sally.notification.sent',
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
    const event = new DomainEvent('sally.load.created', 'tenant_x', { loadId: 'LD-1' }, actor);
    await dispatcher.dispatchEvent(event);

    const createCall = mockPrisma.webhookDeliveryLog.create.mock.calls[0][0];
    expect(createCall.data.payload.version).toBe(1);
    expect(createCall.data.payload.actor).toEqual(actor);
  });

  it('strips recipientUserIds from outbound webhook payloads (bridge-internal SSE routing must not leak)', async () => {
    mockPrisma.webhookSubscription.findMany.mockResolvedValue([{ id: 'sub-1', tenantId: 1, active: true }]);

    // sally.alert.fired is visibility:'external' so it normally would be sent
    // — confirm recipientUserIds is removed from the body.
    const event = new DomainEvent('sally.alert.fired', 'tenant_x', {
      alertId: 'a-1',
      priority: 'critical',
      title: 'X',
      message: 'Y',
      recipientUserIds: ['user-disp-1', 'user-driver-2'],
    });

    await dispatcher.dispatchEvent(event);

    const createCall = mockPrisma.webhookDeliveryLog.create.mock.calls[0][0];
    const payloadData = createCall.data.payload.data;
    expect(payloadData).toEqual({
      alertId: 'a-1',
      priority: 'critical',
      title: 'X',
      message: 'Y',
    });
    expect(payloadData).not.toHaveProperty('recipientUserIds');
  });

  it('does not enqueue if no active subscriptions match', async () => {
    mockPrisma.webhookSubscription.findMany.mockResolvedValue([]);

    const event = new DomainEvent('sally.load.created', 'tenant_x', {});
    await dispatcher.dispatchEvent(event);

    expect(mockQueue.add).not.toHaveBeenCalled();
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

      await dispatcher.deliverToSubscription('sub-1', 'sally.load.created', {
        test: true,
      });

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

      await dispatcher.deliverToSubscription('sub-1', 'sally.load.created', {});

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('does nothing if subscription is not found', async () => {
      mockPrisma.webhookSubscription.findUnique.mockResolvedValue(null);

      await dispatcher.deliverToSubscription('sub-1', 'sally.load.created', {});

      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });
});

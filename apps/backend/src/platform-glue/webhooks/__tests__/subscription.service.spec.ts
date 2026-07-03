import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { WebhookSubscriptionService } from '../subscription.service';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { QUEUE_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';

describe('WebhookSubscriptionService', () => {
  let service: WebhookSubscriptionService;
  let prisma: any;
  let queue: any;

  beforeEach(async () => {
    prisma = {
      webhookSubscription: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      webhookDeliveryLog: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      domainEventLog: {
        findMany: jest.fn(),
      },
      tenant: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ tenantId: 'tenant-slug-1' }),
      },
    };

    queue = {
      add: jest.fn().mockResolvedValue({}),
    };

    const module = await Test.createTestingModule({
      providers: [
        WebhookSubscriptionService,
        { provide: PrismaService, useValue: prisma },
        { provide: getQueueToken(QUEUE_NAMES.WEBHOOKS), useValue: queue },
      ],
    }).compile();

    service = module.get(WebhookSubscriptionService);
  });

  describe('getEventCatalog', () => {
    it('returns categories with events', () => {
      const result = service.getEventCatalog();
      expect(result.categories).toBeDefined();
      expect(result.categories.length).toBeGreaterThan(0);
      expect(result.categories[0].label).toBeTruthy();
      expect(result.categories[0].events.length).toBeGreaterThan(0);
    });

    it('excludes internal events from catalog', () => {
      const result = service.getEventCatalog();
      const allEvents = result.categories.flatMap((c: any) => c.events.map((e: any) => e.name));
      expect(allEvents).not.toContain('app.sync.started');
      expect(allEvents).not.toContain('app.telematics.updated');
      expect(allEvents).not.toContain('app.preferences.updated');
    });
  });

  describe('retryDelivery', () => {
    const tenantId = 1;
    const subId = 'sub-1';
    const logId = 'log-1';

    beforeEach(() => {
      prisma.webhookSubscription.findUnique.mockResolvedValue({
        id: subId,
        tenantId,
        active: true,
      });
    });

    it('queues retry for failed delivery', async () => {
      prisma.webhookDeliveryLog.findUnique.mockResolvedValue({
        id: logId,
        subscriptionId: subId,
        failedAt: new Date(),
        payload: { event: 'app.load.created', data: {} },
      });
      prisma.webhookDeliveryLog.update.mockResolvedValue({});

      const result = await service.retryDelivery(tenantId, subId, logId);

      expect(queue.add).toHaveBeenCalledWith(
        'deliver',
        expect.objectContaining({
          tenantId: expect.any(String),
          metadata: expect.objectContaining({ source: 'replay', version: 1 }),
          payload: expect.objectContaining({ subscriptionId: subId, logId }),
        }),
        expect.any(Object),
      );
      expect(result.message).toContain('retry');
    });

    it('throws NotFoundException for missing log', async () => {
      prisma.webhookDeliveryLog.findUnique.mockResolvedValue(null);

      await expect(service.retryDelivery(tenantId, subId, logId)).rejects.toThrow('Delivery log not found');
    });

    it('throws BadRequestException for non-failed delivery', async () => {
      prisma.webhookDeliveryLog.findUnique.mockResolvedValue({
        id: logId,
        subscriptionId: subId,
        failedAt: null,
        payload: {},
      });

      await expect(service.retryDelivery(tenantId, subId, logId)).rejects.toThrow(
        'Only failed deliveries can be retried',
      );
    });

    it('throws NotFoundException for log belonging to different subscription', async () => {
      prisma.webhookDeliveryLog.findUnique.mockResolvedValue({
        id: logId,
        subscriptionId: 'other-sub',
        failedAt: new Date(),
        payload: {},
      });

      await expect(service.retryDelivery(tenantId, subId, logId)).rejects.toThrow('Delivery log not found');
    });
  });

  describe('replayEvents', () => {
    const tenantId = 1;
    const subId = 'sub-1';

    beforeEach(() => {
      prisma.webhookSubscription.findUnique.mockResolvedValue({
        id: subId,
        tenantId,
        active: true,
        events: ['*'],
      });
    });

    it('replays events from event log', async () => {
      prisma.domainEventLog.findMany.mockResolvedValue([
        {
          id: 'evt-1',
          event: 'app.load.created',
          version: 1,
          tenantId,
          createdAt: new Date(),
          actorId: null,
          actorType: null,
          actorLabel: null,
          data: { loadId: 'LD-1' },
          tenant: { tenantId: 'tenant-slug-1' },
        },
        {
          id: 'evt-2',
          event: 'app.load.updated',
          version: 1,
          tenantId,
          createdAt: new Date(),
          actorId: 'u-1',
          actorType: 'user',
          actorLabel: 'John',
          data: { loadId: 'LD-1' },
          tenant: { tenantId: 'tenant-slug-1' },
        },
      ]);
      prisma.webhookDeliveryLog.create.mockResolvedValue({ id: 'log-new' });

      const result = await service.replayEvents(tenantId, subId, {
        since: '2026-04-01T00:00:00Z',
        limit: 1000,
      });

      expect(result.message).toContain('2 events queued');
      expect(queue.add).toHaveBeenCalledTimes(2);
      expect(prisma.webhookDeliveryLog.create).toHaveBeenCalledTimes(2);
      // External payload identifies the tenant by slug, not Int DB id.
      const firstPayload = prisma.webhookDeliveryLog.create.mock.calls[0][0].data.payload;
      expect(firstPayload.tenantId).toBe('tenant-slug-1');
    });

    it('filters by specific events', async () => {
      prisma.domainEventLog.findMany.mockResolvedValue([]);

      await service.replayEvents(tenantId, subId, {
        since: '2026-04-01T00:00:00Z',
        events: ['app.load.created'],
      });

      expect(prisma.domainEventLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            event: { in: ['app.load.created'] },
          }),
        }),
      );
    });

    it('returns 0 events when none match', async () => {
      prisma.domainEventLog.findMany.mockResolvedValue([]);

      const result = await service.replayEvents(tenantId, subId, {
        since: '2026-04-01T00:00:00Z',
      });

      expect(result.message).toContain('0 events queued');
    });

    it('filters replay by subscription event list', async () => {
      prisma.webhookSubscription.findUnique.mockResolvedValue({
        id: subId,
        tenantId,
        active: true,
        events: ['app.load.created', 'app.load.updated'],
      });
      prisma.domainEventLog.findMany.mockResolvedValue([]);

      await service.replayEvents(tenantId, subId, {
        since: '2026-04-01T00:00:00Z',
      });

      expect(prisma.domainEventLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            event: { in: ['app.load.created', 'app.load.updated'] },
          }),
        }),
      );
    });
  });
});

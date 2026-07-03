import { Test } from '@nestjs/testing';
import { AdminEventsService } from '../admin-events.service';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';

describe('AdminEventsService', () => {
  let service: AdminEventsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      domainEventLog: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      webhookDeliveryLog: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module = await Test.createTestingModule({
      providers: [AdminEventsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(AdminEventsService);
  });

  describe('listEvents', () => {
    it('returns paginated events with no filters', async () => {
      prisma.domainEventLog.findMany.mockResolvedValue([
        {
          id: 'evt-1',
          event: 'app.load.created',
          aggregateType: 'load',
          aggregateId: 'LD-1',
          actorId: null,
          actorType: null,
          actorLabel: null,
          correlationId: null,
          version: 1,
          data: {},
          createdAt: new Date(),
          tenant: { tenantId: 't-1' },
        },
      ]);
      prisma.domainEventLog.count.mockResolvedValue(1);

      const result = await service.listEvents({ limit: 50, offset: 0 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].tenantId).toBe('t-1');
      expect(result.total).toBe(1);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    it('applies tenant filter via slug → relation', async () => {
      await service.listEvents({
        tenantId: 't-1',
        limit: 50,
        offset: 0,
      });

      expect(prisma.domainEventLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenant: { tenantId: 't-1' } }),
        }),
      );
    });

    it('applies search filter', async () => {
      await service.listEvents({
        search: 'app.load.created',
        limit: 50,
        offset: 0,
      });

      expect(prisma.domainEventLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({
                event: { contains: 'app.load.created', mode: 'insensitive' },
              }),
            ]),
          }),
        }),
      );
    });

    it('applies date range filters', async () => {
      await service.listEvents({
        since: '2026-04-01T00:00:00Z',
        until: '2026-04-10T00:00:00Z',
        limit: 50,
        offset: 0,
      });

      expect(prisma.domainEventLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: {
              gte: expect.any(Date),
              lte: expect.any(Date),
            },
          }),
        }),
      );
    });

    it('applies all filters together', async () => {
      await service.listEvents({
        tenantId: 't-1',
        search: 'app.load.created',
        actorType: 'user',
        since: '2026-04-01T00:00:00Z',
        limit: 10,
        offset: 5,
      });

      expect(prisma.domainEventLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant: { tenantId: 't-1' },
            actorType: 'user',
            OR: expect.arrayContaining([
              expect.objectContaining({
                event: { contains: 'app.load.created', mode: 'insensitive' },
              }),
            ]),
          }),
          take: 10,
          skip: 5,
        }),
      );
    });
  });

  describe('getStats', () => {
    it('returns event counts grouped by type', async () => {
      prisma.domainEventLog.groupBy.mockResolvedValue([
        { event: 'app.load.created', _count: { id: 50 } },
        { event: 'app.load.updated', _count: { id: 30 } },
      ]);

      const result = await service.getStats();

      expect(result.eventCounts).toHaveLength(2);
      expect(result.eventCounts[0].event).toBe('app.load.created');
      expect(result.eventCounts[0].count).toBe(50);
      expect(result.totalEvents).toBe(80);
      expect(result.since).toBeTruthy();
    });

    it('returns empty stats when no events', async () => {
      prisma.domainEventLog.groupBy.mockResolvedValue([]);

      const result = await service.getStats();

      expect(result.eventCounts).toHaveLength(0);
      expect(result.totalEvents).toBe(0);
    });
  });

  describe('getWebhookHealth', () => {
    it('aggregates delivery stats per tenant', async () => {
      prisma.webhookDeliveryLog.findMany.mockResolvedValue([
        {
          id: '1',
          deliveredAt: new Date(),
          failedAt: null,
          subscription: { tenant: { tenantId: 't-1' } },
        },
        {
          id: '2',
          deliveredAt: new Date(),
          failedAt: null,
          subscription: { tenant: { tenantId: 't-1' } },
        },
        {
          id: '3',
          deliveredAt: null,
          failedAt: new Date(),
          subscription: { tenant: { tenantId: 't-1' } },
        },
        {
          id: '4',
          deliveredAt: null,
          failedAt: new Date(),
          subscription: { tenant: { tenantId: 't-2' } },
        },
      ]);

      const result = await service.getWebhookHealth();

      expect(result.tenants).toHaveLength(2);
      // Worst tenant (t-2 at 0%) should be first
      expect(result.tenants[0].tenantId).toBe('t-2');
      expect(result.tenants[0].successRate).toBe(0);
      // t-1 has 2/3 success = 66.67%
      expect(result.tenants[1].tenantId).toBe('t-1');
      expect(result.tenants[1].successRate).toBe(66.67);
      expect(result.summary.totalDeliveries).toBe(4);
      expect(result.summary.totalDelivered).toBe(2);
      expect(result.summary.totalFailed).toBe(2);
    });

    it('returns 100% success rate when no deliveries for a tenant', async () => {
      prisma.webhookDeliveryLog.findMany.mockResolvedValue([]);

      const result = await service.getWebhookHealth();

      expect(result.tenants).toHaveLength(0);
      expect(result.summary.totalDeliveries).toBe(0);
    });
  });
});

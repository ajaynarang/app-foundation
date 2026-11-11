import { Test } from '@nestjs/testing';
import { AdminEventsService, MAX_WEBHOOK_HEALTH_TENANTS } from '../admin-events.service';
import { fixtureModel, tiedTimestamps, walkCursorList } from '@appshore/platform/test/helpers/cursor-walk';
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
      $queryRaw: jest.fn().mockResolvedValue([]),
    };

    const module = await Test.createTestingModule({
      providers: [AdminEventsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(AdminEventsService);
  });

  describe('listEvents', () => {
    it('returns a cursor page of events with no filters', async () => {
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

      const result = await service.listEvents({ limit: 50 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].tenantId).toBe('t-1');
      expect(result.total).toBe(1);
      expect(result.nextCursor).toBeNull();
      expect(prisma.domainEventLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 51 }),
      );
    });

    it('walks every event once across pages, events of one millisecond included', async () => {
      // An outbox flush writes several events in one millisecond.
      const stamps = tiedTimestamps(8);
      const rows = stamps.map((createdAt, index) => ({
        id: `01900000-0000-7000-8000-00000000000${(index * 5) % 8}`,
        event: index === 7 ? 'user.created' : 'tenant.updated',
        aggregateType: 'tenant',
        aggregateId: `agg-${index}`,
        actorType: 'user',
        actorLabel: null,
        createdAt,
        tenant: { tenantId: 't-1' },
      }));
      Object.assign(prisma.domainEventLog, fixtureModel(rows));

      const totals: number[] = [];
      const { pages, items } = await walkCursorList(async (cursor) => {
        const page = await service.listEvents({ limit: 3, cursor });
        totals.push(page.total);
        return page;
      });

      expect(pages.map((page) => page.length)).toEqual([3, 3, 2]);
      expect(new Set(items.map((item) => item.id)).size).toBe(8);
      const times = items.map((item) => item.createdAt.getTime());
      expect(times).toEqual([...times].sort((a, b) => b - a));
      expect(totals).toEqual([8, 8, 8]);

      const searched = await service.listEvents({ search: 'user.' });
      expect(searched.items.map((item) => item.event)).toEqual(['user.created']);
      expect(searched.total).toBe(1);
    });

    it('answers 400 on a cursor it did not issue, before any query runs', async () => {
      await expect(service.listEvents({ cursor: 'nope' })).rejects.toMatchObject({ status: 400 });
      expect(prisma.domainEventLog.findMany).not.toHaveBeenCalled();
    });

    it('applies tenant filter via slug → relation', async () => {
      await service.listEvents({
        tenantId: 't-1',
        limit: 50,
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
          take: 11,
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

  describe('getVolume', () => {
    it('counts per hour and event type in SQL and maps the buckets', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { hour: new Date('2026-04-01T10:00:00.000Z'), event: 'user.created', count: 3n },
        { hour: new Date('2026-04-01T11:00:00.000Z'), event: 'user.created', count: 1n },
      ]);

      const result = await service.getVolume();

      expect(result).toEqual([
        { hour: '2026-04-01T10:00:00.000Z', event: 'user.created', count: 3 },
        { hour: '2026-04-01T11:00:00.000Z', event: 'user.created', count: 1 },
      ]);
      // Grouped by the database: no event row is loaded, however many were written.
      expect(prisma.domainEventLog.findMany).not.toHaveBeenCalled();
      expect(prisma.$queryRaw.mock.calls[0][0].join('?')).toContain("date_trunc('hour', created_at)");
    });
  });

  describe('getWebhookHealth', () => {
    it('maps the per-tenant counts (worst first, as the query orders them) and the overall summary', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([
          { tenant_slug: 't-2', total: 1n, delivered: 0n, failed: 1n },
          { tenant_slug: 't-1', total: 3n, delivered: 2n, failed: 1n },
        ])
        .mockResolvedValueOnce([{ total: 4n, delivered: 2n, failed: 2n }]);

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

    it('caps the per-tenant rows and orders worst first in SQL', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 0n, delivered: 0n, failed: 0n }]);

      await service.getWebhookHealth();

      const [strings, ...values] = prisma.$queryRaw.mock.calls[0];
      expect(strings.join('?')).toContain('ORDER BY (COUNT(l.delivered_at)::numeric / COUNT(*)) ASC');
      expect(values[values.length - 1]).toBe(MAX_WEBHOOK_HEALTH_TENANTS);
    });

    it('returns no tenants and a zero summary when there were no deliveries', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 0n, delivered: 0n, failed: 0n }]);

      const result = await service.getWebhookHealth();

      expect(result.tenants).toHaveLength(0);
      expect(result.summary.totalDeliveries).toBe(0);
    });
  });
});

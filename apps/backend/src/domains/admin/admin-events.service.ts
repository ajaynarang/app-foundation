import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { Prisma } from '@appshore/db';
import {
  buildCursorPage,
  clampCursorLimit,
  encodeCursor,
  keysetWhere,
} from '@appshore/kernel/shared/utils/cursor-pagination';
import { containsText } from '@appshore/kernel/shared/utils/list-query';
import { getEventDefinition } from '../../platform-glue/events/event-registry';

/** What `GET /admin/events` passes in, already parsed at the controller. */
export interface ListEventsFilters {
  search?: string;
  /** The tenant's public slug. */
  tenantId?: string;
  actorType?: string;
  since?: string;
  until?: string;
  limit?: number;
  cursor?: string;
}

/** Newest first; the row id is a UUIDv7 (never an Int key), so it is a safe tiebreak. */
const EVENT_KEYSET = { field: 'createdAt', idField: 'id', kind: 'date', direction: 'desc' } as const;

/** The webhook health panel shows the worst tenants first, and never more than this many. */
export const MAX_WEBHOOK_HEALTH_TENANTS = 100;

@Injectable()
export class AdminEventsService {
  private readonly logger = new Logger(AdminEventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Domain events across tenants (super admin), newest first, as a cursor list. */
  async listEvents(filters: ListEventsFilters = {}) {
    const take = clampCursorLimit(filters.limit);
    // Decoded before any query runs: a malformed cursor is a 400 and costs nothing.
    const keyset = filters.cursor ? keysetWhere({ ...EVENT_KEYSET, cursor: filters.cursor }) : undefined;
    const where: Prisma.DomainEventLogWhereInput = {};

    if (filters.tenantId) {
      // Filter accepts the public slug from the admin UI (e.g. "demo-acme-2026").
      // domain_event_log.tenant_id is now Int, so match through the tenant relation.
      where.tenant = { tenantId: filters.tenantId };
    }
    if (filters.search) {
      // `containsText` escapes LIKE wildcards: unescaped, `_` or `%` would match every event.
      where.OR = [
        { event: containsText(filters.search) },
        { aggregateId: containsText(filters.search) },
        { actorLabel: containsText(filters.search) },
        { aggregateType: containsText(filters.search) },
      ];
    }
    if (filters.actorType) {
      where.actorType = filters.actorType;
    }
    if (filters.since || filters.until) {
      where.createdAt = {};
      if (filters.since) {
        where.createdAt.gte = new Date(filters.since);
      }
      if (filters.until) {
        // End of day — include all events on the "until" date
        const endOfDay = new Date(filters.until);
        endOfDay.setHours(23, 59, 59, 999);
        where.createdAt.lte = endOfDay;
      }
    }

    const [rows, total] = await Promise.all([
      this.prisma.domainEventLog.findMany({
        where: keyset ? { AND: [where, keyset] } : where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: take + 1,
        select: {
          id: true,
          event: true,
          aggregateType: true,
          aggregateId: true,
          actorId: true,
          actorType: true,
          actorLabel: true,
          correlationId: true,
          version: true,
          data: true,
          createdAt: true,
          tenant: { select: { tenantId: true } },
        },
      }),
      this.prisma.domainEventLog.count({ where }),
    ]);

    // Reshape response: keep the public-facing `tenantId` (slug) shape the
    // admin UI already renders, even though the DB column is now Int.
    const page = buildCursorPage(rows, take, (row) => encodeCursor(row.createdAt, row.id));
    const items = page.items.map((item) => {
      const def = getEventDefinition(item.event);
      const { tenant, ...rest } = item;
      return {
        ...rest,
        tenantId: tenant.tenantId,
        visibility: def?.visibility ?? 'external',
      };
    });

    return { items, nextCursor: page.nextCursor, total };
  }

  async getStats() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const stats = await this.prisma.domainEventLog.groupBy({
      by: ['event'],
      where: { createdAt: { gte: since } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    return {
      since: since.toISOString(),
      eventCounts: stats.map((s) => ({
        event: s.event,
        count: s._count.id,
      })),
      totalEvents: stats.reduce((sum, s) => sum + s._count.id, 0),
    };
  }

  /**
   * Events per hour and event type over the last 24 hours. Counted in SQL: the answer is at most 24 rows per
   * event type in the registry, however many events were written.
   */
  async getVolume() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await this.prisma.$queryRaw<Array<{ hour: Date; event: string; count: bigint | number }>>`
      SELECT date_trunc('hour', created_at) AS hour, event, COUNT(*) AS count
      FROM domain_event_log
      WHERE created_at >= ${since}
      GROUP BY 1, 2
      ORDER BY 1 ASC, 2 ASC`;
    return rows.map((row) => ({ hour: row.hour.toISOString(), event: row.event, count: Number(row.count) }));
  }

  /**
   * Webhook delivery health over the last 24 hours: the summary counts every delivery; the per-tenant rows are
   * the worst `MAX_WEBHOOK_HEALTH_TENANTS` by success rate. Counted in SQL, so no delivery row is loaded.
   */
  async getWebhookHealth() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [perTenant, [totals]] = await Promise.all([
      this.prisma.$queryRaw<WebhookHealthRaw[]>`
        SELECT t.tenant_id AS tenant_slug,
               COUNT(*) AS total,
               COUNT(l.delivered_at) AS delivered,
               COUNT(l.failed_at) AS failed
        FROM webhook_delivery_logs l
        JOIN webhook_subscriptions s ON s.id = l.subscription_id
        JOIN tenants t ON t.id = s.tenant_id
        WHERE l.created_at >= ${since}
        GROUP BY t.tenant_id
        ORDER BY (COUNT(l.delivered_at)::numeric / COUNT(*)) ASC, t.tenant_id ASC
        LIMIT ${MAX_WEBHOOK_HEALTH_TENANTS}`,
      this.prisma.$queryRaw<Array<Omit<WebhookHealthRaw, 'tenant_slug'>>>`
        SELECT COUNT(*) AS total, COUNT(delivered_at) AS delivered, COUNT(failed_at) AS failed
        FROM webhook_delivery_logs
        WHERE created_at >= ${since}`,
    ]);

    const tenants = perTenant.map((row) => {
      const total = Number(row.total);
      const delivered = Number(row.delivered);
      return {
        tenantId: row.tenant_slug,
        total,
        delivered,
        failed: Number(row.failed),
        successRate: total > 0 ? Math.round((delivered / total) * 10000) / 100 : 100,
      };
    });

    return {
      since: since.toISOString(),
      tenants,
      summary: {
        totalDeliveries: Number(totals?.total ?? 0),
        totalDelivered: Number(totals?.delivered ?? 0),
        totalFailed: Number(totals?.failed ?? 0),
      },
    };
  }
}

interface WebhookHealthRaw {
  tenant_slug: string;
  total: bigint | number;
  delivered: bigint | number;
  failed: bigint | number;
}

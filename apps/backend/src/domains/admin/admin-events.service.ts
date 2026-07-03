import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { Prisma } from '@appshore/db';
import { getEventDefinition } from '../../platform-glue/events/event-registry';

export interface ListEventsFilters {
  search?: string;
  event?: string;
  tenantId?: string;
  actorType?: string;
  aggregateType?: string;
  since?: string;
  until?: string;
  limit: number;
  offset: number;
}

@Injectable()
export class AdminEventsService {
  private readonly logger = new Logger(AdminEventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listEvents(filters: ListEventsFilters) {
    const where: Prisma.DomainEventLogWhereInput = {};

    if (filters.tenantId) {
      // Filter accepts the public slug from the admin UI (e.g. "demo-acme-2026").
      // domain_event_log.tenant_id is now Int, so match through the tenant relation.
      where.tenant = { tenantId: filters.tenantId };
    }
    if (filters.search) {
      where.OR = [
        { event: { contains: filters.search, mode: 'insensitive' } },
        { aggregateId: { contains: filters.search, mode: 'insensitive' } },
        { actorLabel: { contains: filters.search, mode: 'insensitive' } },
        { aggregateType: { contains: filters.search, mode: 'insensitive' } },
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

    const [items, total] = await Promise.all([
      this.prisma.domainEventLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filters.limit,
        skip: filters.offset,
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
    const enrichedItems = items.map((item) => {
      const def = getEventDefinition(item.event);
      const { tenant, ...rest } = item;
      return {
        ...rest,
        tenantId: tenant.tenantId,
        visibility: def?.visibility ?? 'external',
      };
    });

    return {
      items: enrichedItems,
      total,
      limit: filters.limit,
      offset: filters.offset,
    };
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

  async getVolume() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const events = await this.prisma.domainEventLog.findMany({
      where: { createdAt: { gte: since } },
      select: { event: true, createdAt: true },
    });

    // Group by hour + event type
    const buckets = new Map<string, number>();
    for (const e of events) {
      const hour = new Date(e.createdAt);
      hour.setMinutes(0, 0, 0);
      const key = `${hour.toISOString()}|${e.event}`;
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }

    const volume = Array.from(buckets.entries()).map(([key, count]) => {
      const [hour, event] = key.split('|');
      return { hour, event, count };
    });

    // Sort by hour
    volume.sort((a, b) => a.hour.localeCompare(b.hour));

    return volume;
  }

  async getWebhookHealth() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const deliveries = await this.prisma.webhookDeliveryLog.findMany({
      where: { createdAt: { gte: since } },
      select: {
        id: true,
        deliveredAt: true,
        failedAt: true,
        subscription: {
          select: { tenant: { select: { tenantId: true } } },
        },
      },
    });

    // Aggregate success/failure per tenant slug — admin-facing UI shows the slug.
    const tenantMap = new Map<string, { total: number; delivered: number; failed: number }>();

    for (const d of deliveries) {
      const tenantSlug = d.subscription.tenant.tenantId;
      if (!tenantMap.has(tenantSlug)) {
        tenantMap.set(tenantSlug, { total: 0, delivered: 0, failed: 0 });
      }
      const entry = tenantMap.get(tenantSlug);
      entry.total++;
      if (d.deliveredAt) entry.delivered++;
      if (d.failedAt) entry.failed++;
    }

    const tenants = Array.from(tenantMap.entries()).map(([tenantId, counts]) => ({
      tenantId,
      total: counts.total,
      delivered: counts.delivered,
      failed: counts.failed,
      successRate: counts.total > 0 ? Math.round((counts.delivered / counts.total) * 10000) / 100 : 100,
    }));

    // Sort by success rate ascending so worst tenants appear first
    tenants.sort((a, b) => a.successRate - b.successRate);

    return {
      since: since.toISOString(),
      tenants,
      summary: {
        totalDeliveries: deliveries.length,
        totalDelivered: deliveries.filter((d) => d.deliveredAt).length,
        totalFailed: deliveries.filter((d) => d.failedAt).length,
      },
    };
  }
}

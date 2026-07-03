import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { DomainEvent } from '@appshore/kernel/infrastructure/events/domain-event';
import { getEventDefinition } from './event-registry';
import { TenantIdResolver } from '@appshore/platform/infrastructure/events/tenant-id-resolver.service';

// Order: canonical business identifiers first, legacy *Id fields last.
// The walker stops at the first match, so canonical names win when both are
// present (e.g. an event carrying both `invoiceNumber` and a legacy `invoiceId`).
// Add your domain's identifier fields here (canonical name first) so events
// persist with a meaningful aggregateId.
const AGGREGATE_ID_FIELDS = [
  'entityId',
  'invoiceNumber',
  'customerId',
  'invoiceId',
  'documentId',
  'threadId',
  'userId',
  'id',
] as const;

@Injectable()
export class EventPersistenceSubscriber {
  private readonly logger = new Logger(EventPersistenceSubscriber.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantResolver: TenantIdResolver,
  ) {}

  async persistEvent(event: DomainEvent): Promise<void> {
    try {
      const eventDef = getEventDefinition(event.event);
      const data = (event.data ?? {}) as Record<string, unknown>;
      const aggregateType = eventDef?.aggregateType ?? this.inferAggregateType(event.event);
      const aggregateId = this.extractAggregateId(data);

      // domain_event_log.tenant_id is now Int FK to tenants.id. The envelope
      // carries the wire-format slug (normalized in DurableEventProcessor),
      // so resolve it to the numeric DB id before persisting.
      const tenantDbId = await this.tenantResolver.resolveToDbId(event.tenantId);
      if (!tenantDbId) {
        this.logger.warn(`Skipping event persistence — cannot resolve tenant for ${event.tenantId}`);
        return;
      }

      // Upsert: idempotent — safe for BullMQ retries (persistence succeeded
      // but webhook dispatch failed → job retries → re-calls persistEvent)
      await this.prisma.domainEventLog.upsert({
        where: { id: event.id },
        create: {
          id: event.id,
          tenantId: tenantDbId,
          event: event.event,
          aggregateType,
          aggregateId,
          actorId: event.actor?.id ?? null,
          actorType: event.actor?.type ?? null,
          actorLabel: event.actor?.label ?? null,
          correlationId: event.correlationId ?? null,
          causationId: event.causationId ?? null,
          version: event.version,
          data: data as any,
          createdAt: event.timestamp,
        },
        update: {}, // no-op on conflict — event already persisted
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to persist event ${event.event}: ${msg}`);
    }
  }

  private extractAggregateId(data: Record<string, unknown>): string | null {
    for (const field of AGGREGATE_ID_FIELDS) {
      const value = data[field];
      if (typeof value === 'string' && value.length > 0) return value;
      if (typeof value === 'number') return String(value);
    }
    return null;
  }

  private inferAggregateType(eventKey: string): string {
    const parts = eventKey.split('.');
    return parts.length >= 2 ? parts[1] : 'unknown';
  }
}

import type { OutboxEvent, Prisma } from '@appshore/db';
import { DomainEvent, toEventActor, type EventActor } from '@appshore/kernel/infrastructure/events/domain-event';

/** `outbox_events.last_error` is VARCHAR(500). */
const LAST_ERROR_MAX = 500;

/**
 * Column widths of the attribution fields. The row is written inside the business transaction, so an
 * over-long value must never fail it (a P2000 would roll back the change it describes): each is capped to
 * its column. `actor_label` matches `users.email` (255), the usual user label.
 */
export const OUTBOX_COLUMN_MAX = {
  actorId: 100,
  actorType: 20,
  actorLabel: 255,
  correlationId: 50,
  causationId: 50,
} as const;

const cap = (value: string | undefined | null, max: number): string | null =>
  value == null ? null : value.slice(0, max);

/**
 * The row an event is staged as — its id and timestamp are the event's own. `actor_agent` is not written:
 * the column is reserved for machine identity and stays null until that lands.
 */
export function toOutboxRow(event: DomainEvent): Prisma.OutboxEventCreateInput {
  return {
    id: event.id,
    event: event.event,
    tenantId: event.tenantId,
    // An event payload is JSON by contract: it already crosses BullMQ and webhooks serialized.
    data: event.data as Prisma.InputJsonValue,
    actorId: cap(event.actor?.id, OUTBOX_COLUMN_MAX.actorId),
    actorType: cap(event.actor?.type, OUTBOX_COLUMN_MAX.actorType),
    actorLabel: cap(event.actor?.label, OUTBOX_COLUMN_MAX.actorLabel),
    correlationId: cap(event.correlationId, OUTBOX_COLUMN_MAX.correlationId),
    causationId: cap(event.causationId, OUTBOX_COLUMN_MAX.causationId),
    occurredAt: event.timestamp,
  };
}

/** The event a row records, exactly as it was staged (id, timestamp, actor). */
export function fromOutboxRow(row: OutboxEvent): DomainEvent {
  return DomainEvent.restore({
    id: row.id,
    event: row.event,
    tenantId: row.tenantId,
    data: row.data,
    actor: actorOf(row),
    correlationId: row.correlationId ?? undefined,
    causationId: row.causationId ?? undefined,
    timestamp: row.occurredAt,
  });
}

function actorOf(row: OutboxEvent): EventActor | undefined {
  if (!row.actorId) return undefined;
  return toEventActor({ id: row.actorId, type: row.actorType ?? '', label: row.actorLabel });
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function truncateError(error: unknown): string {
  return describeError(error).slice(0, LAST_ERROR_MAX);
}

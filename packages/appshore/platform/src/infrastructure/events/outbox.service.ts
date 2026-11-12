import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@appshore/db';
import { DomainEvent, type EventActor } from '@appshore/kernel/infrastructure/events/domain-event';
import { DomainEventService } from '@appshore/kernel/infrastructure/events/domain-event.service';
import { PrismaService } from '../database/prisma.service';
import { describeError, toOutboxRow } from './outbox-row';

export interface OutboxEventOptions {
  correlationId?: string;
  causationId?: string;
}

/** `emit` inside `OutboxService.transaction` — same arguments as `DomainEventService.emit`. */
export type OutboxEmit = <T = unknown>(
  eventName: string,
  tenantId: string | number,
  data: T,
  actor?: EventActor,
  options?: OutboxEventOptions,
) => Promise<void>;

/**
 * The longest an outbox transaction may stay open (Prisma's interactive-transaction `timeout`; its
 * default is 5 s). A longer `timeout` is capped to this. `OutboxRelay` waits past it before treating an
 * unpublished row as abandoned — a row is stamped when staged, not when its transaction commits, so the
 * relay's grace must outlast the whole transaction. Code that owns its transaction and uses
 * `stage` + `publishStaged` must keep it within this bound too.
 */
export const OUTBOX_TRANSACTION_TIMEOUT_MAX_MS = 15_000;

export interface OutboxTransactionOptions {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
}

/**
 * The transactional outbox (ADR "Outbox and deadlines"): a domain event is written in the SAME
 * transaction as the change it describes, so it exists if and only if that
 * change committed, and it is published after the commit.
 *
 * Two forms:
 *
 * - `transaction(fn)` — the usual one. `fn(tx, emit)` runs inside
 *   `prisma.$transaction`; each `emit(...)` stages a row on `tx`. After commit
 *   the staged events are published at once, in order (listeners fire before
 *   the caller returns, exactly as with a direct emit) and marked published.
 *   A rollback publishes nothing.
 * - `stage(tx, ...)` + `publishStaged(events)` — for code that already owns its
 *   transaction: stage on that `tx`, keep the returned events, and hand them to
 *   `publishStaged` once the transaction has committed. Publication is an
 *   explicit step after commit — never call it inside the transaction.
 *
 * Publishing never fails the caller: the change is committed and the row is
 * durable. Whatever did not publish now is published by `OutboxRelay` on its
 * next tick. Delivery is therefore at-least-once, and consumers key on the
 * event id (the durable job id, the event-log row and webhook ids all equal it).
 */
@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventService,
  ) {}

  async transaction<T>(
    fn: (tx: Prisma.TransactionClient, emit: OutboxEmit) => Promise<T>,
    options?: OutboxTransactionOptions,
  ): Promise<T> {
    const staged: DomainEvent[] = [];
    const result = await this.prisma.$transaction(async (tx) => {
      const emit: OutboxEmit = async (eventName, tenantId, data, actor, eventOptions) => {
        staged.push(await this.stage(tx, eventName, tenantId, data, actor, eventOptions));
      };
      return fn(tx, emit);
    }, capTimeout(options));
    await this.publishStaged(staged);
    return result;
  }

  /**
   * Write one event's row on the caller's transaction and return the event.
   * The actor resolves from EventContext when not given, as `DomainEvent` does.
   */
  async stage<T = unknown>(
    tx: Prisma.TransactionClient,
    eventName: string,
    tenantId: string | number,
    data: T,
    actor?: EventActor,
    options?: OutboxEventOptions,
  ): Promise<DomainEvent<T>> {
    const event = new DomainEvent<T>(
      eventName,
      String(tenantId),
      data,
      actor,
      options?.correlationId,
      options?.causationId,
    );
    await tx.outboxEvent.create({ data: toOutboxRow(event) });
    return event;
  }

  /**
   * Publish committed events in order and mark them published. Stops at the
   * first failure so a later event never overtakes an earlier one; the rest stay
   * unpublished for the relay. Never throws.
   */
  async publishStaged(events: readonly DomainEvent[]): Promise<void> {
    const published: string[] = [];
    for (const event of events) {
      try {
        await this.events.publish(event);
        published.push(event.id);
      } catch (error) {
        this.logger.warn(
          `Outbox publish of ${event.event} (${event.id}) failed — left for the relay: ${describeError(error)}`,
        );
        break;
      }
    }
    if (published.length === 0) return;
    try {
      await this.prisma.outboxEvent.updateMany({
        where: { id: { in: published }, publishedAt: null },
        data: { publishedAt: new Date() },
      });
    } catch (error) {
      // The events went out; the relay will send them again (at-least-once, keyed on the event id).
      this.logger.warn(`Outbox mark-published failed for ${published.length} event(s): ${describeError(error)}`);
    }
  }
}

function capTimeout(options: OutboxTransactionOptions | undefined): OutboxTransactionOptions | undefined {
  if (options?.timeout == null || options.timeout <= OUTBOX_TRANSACTION_TIMEOUT_MAX_MS) return options;
  return { ...options, timeout: OUTBOX_TRANSACTION_TIMEOUT_MAX_MS };
}

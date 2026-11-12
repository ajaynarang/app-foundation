import { Injectable, Logger } from '@nestjs/common';
import { DomainEventService } from '@appshore/kernel/infrastructure/events/domain-event.service';
import { PrismaService } from '../database/prisma.service';
import { describeError, fromOutboxRow, truncateError } from './outbox-row';
import { OUTBOX_TRANSACTION_TIMEOUT_MAX_MS } from './outbox.service';

/**
 * A row younger than this is still the request path's to publish — the relay leaves it alone.
 * `occurred_at` is stamped when the row is staged, not when its transaction commits, so the grace is
 * twice the longest an outbox transaction may stay open: a row only just committed is never past it.
 */
export const OUTBOX_RELAY_GRACE_MS = 2 * OUTBOX_TRANSACTION_TIMEOUT_MAX_MS;
/** How long a claim holds a row: another relay skips it until then, and a failed row retries after it. */
export const OUTBOX_RELAY_LEASE_MS = 60_000;
export const OUTBOX_RELAY_BATCH = 100;
export const OUTBOX_RETENTION_DAYS = 7;
const PURGE_BATCH = 1_000;
/** Bounded per tick — a backlog drains over several ticks, never in one long delete. */
const PURGE_MAX_BATCHES = 10;
const DAY_MS = 86_400_000;

export interface OutboxRelayResult {
  claimed: number;
  published: number;
  failed: number;
  purged: number;
}

/**
 * The outbox relay (ADR "Outbox and deadlines"): publishes events a crash, a deploy or an
 * unreachable Redis left unpublished after their transaction committed, and
 * purges published rows after the retention window.
 *
 * Claims use `FOR UPDATE SKIP LOCKED` plus a lease (`lease_expires_at`), so two
 * relay instances never publish the same row at once. Claimed rows publish in
 * `occurred_at` order. A failed row records `last_error` and is retried once
 * its lease runs out; it does not hold back the rows after it — one poisoned
 * event must not stop every tenant's outbox.
 */
@Injectable()
export class OutboxRelay {
  private readonly logger = new Logger(OutboxRelay.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventService,
  ) {}

  async tick(now: Date = new Date()): Promise<OutboxRelayResult> {
    const relayed = await this.relay(now);
    const purged = await this.purge(now);
    if (relayed.claimed > 0 || purged > 0) {
      this.logger.log(
        `Outbox relay: ${relayed.published}/${relayed.claimed} published, ${relayed.failed} failed, ${purged} purged`,
      );
    }
    return { ...relayed, purged };
  }

  async relay(now: Date = new Date()): Promise<Omit<OutboxRelayResult, 'purged'>> {
    const ids = await this.claim(now);
    if (ids.length === 0) return { claimed: 0, published: 0, failed: 0 };

    const rows = await this.prisma.outboxEvent.findMany({
      where: { id: { in: ids }, publishedAt: null },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });
    const published: string[] = [];
    let failed = 0;
    for (const row of rows) {
      try {
        await this.events.publish(fromOutboxRow(row));
        published.push(row.id);
      } catch (error) {
        failed += 1;
        this.logger.warn(`Outbox relay could not publish ${row.event} (${row.id}): ${describeError(error)}`);
        await this.prisma.outboxEvent.update({ where: { id: row.id }, data: { lastError: truncateError(error) } });
      }
    }
    if (published.length > 0) {
      await this.prisma.outboxEvent.updateMany({
        where: { id: { in: published } },
        data: { publishedAt: new Date(), leaseExpiresAt: null, lastError: null },
      });
    }
    return { claimed: ids.length, published: published.length, failed };
  }

  /** Delete published rows older than the retention window, in bounded batches. */
  async purge(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - OUTBOX_RETENTION_DAYS * DAY_MS);
    let purged = 0;
    for (let batch = 0; batch < PURGE_MAX_BATCHES; batch++) {
      const deleted = await this.prisma.$executeRaw`
        DELETE FROM outbox_events
        WHERE id IN (
          SELECT id FROM outbox_events
          WHERE published_at < ${cutoff}
          LIMIT ${PURGE_BATCH}
        )`;
      purged += deleted;
      if (deleted < PURGE_BATCH) break;
    }
    return purged;
  }

  /**
   * Lease up to a batch of unpublished rows past the grace period. The inner
   * SELECT skips rows another relay holds locked; the lease keeps them skipped
   * after that relay's statement commits, until it publishes or the lease ends.
   */
  private async claim(now: Date): Promise<string[]> {
    const cutoff = new Date(now.getTime() - OUTBOX_RELAY_GRACE_MS);
    const leaseExpiresAt = new Date(now.getTime() + OUTBOX_RELAY_LEASE_MS);
    const claimed = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE outbox_events
      SET lease_expires_at = ${leaseExpiresAt}, attempts = attempts + 1
      WHERE id IN (
        SELECT id FROM outbox_events
        WHERE published_at IS NULL
          AND occurred_at < ${cutoff}
          AND (lease_expires_at IS NULL OR lease_expires_at < ${now})
        ORDER BY occurred_at
        LIMIT ${OUTBOX_RELAY_BATCH}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id`;
    return claimed.map((row) => row.id);
  }
}

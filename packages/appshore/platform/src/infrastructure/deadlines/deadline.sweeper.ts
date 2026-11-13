import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { Deadline, Prisma } from '@appshore/db';
import { BULK_OPS_JOB_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import type { QueueJobHandler } from '@appshore/kernel/infrastructure/queue/job-handler.contract';
import { withJobContext } from '@appshore/kernel/infrastructure/logging/job-log-context';
import { RLS_SOURCE, runAsTenant } from '@appshore/kernel/infrastructure/rls/rls-context';
import { systemScope } from '@appshore/kernel/infrastructure/rls/system-scope';
import { PrismaService } from '../database/prisma.service';
import { DeadlineHandlerRegistry } from './deadline-handler.registry';
import { DEADLINE_HANDLERS, PENDING_DEADLINE, type DeadlineOutcome } from './deadline.types';

/**
 * How long a row is ours. A batch is claimed at once but run one row after another, so the lease
 * is renewed just before each row's handler: every row gets the whole lease, not what the rows
 * ahead of it left over.
 */
export const DEADLINE_LEASE_MS = 2 * 60_000;
/**
 * A handler that has not answered by now counts as a failed run (and backs off). Well under the
 * lease, so a slow handler cannot outlive it and run twice; and a hung one cannot hold the
 * single-concurrency bulk-ops worker — and every other timer — forever.
 */
export const DEADLINE_HANDLER_TIMEOUT_MS = 60_000;
export const DEADLINE_BACKOFF_BASE_MS = 30_000;
export const DEADLINE_BACKOFF_MAX_MS = 60 * 60_000;
export const DEADLINE_SWEEP_BATCH_SIZE = 50;
/** Bounds one tick (1,000 rows); anything left is claimed by the next. */
export const DEADLINE_SWEEP_MAX_BATCHES = 20;

const LAST_ERROR_MAX_LENGTH = 500;
const CANCEL_REASON_MAX_LENGTH = 200;

export interface DeadlineSweepSummary {
  claimed: number;
  fired: number;
  cancelled: number;
  rescheduled: number;
  failed: number;
  /** Claimed, but the lease was lost before the handler ran (another sweeper, or a cancel) — not run. */
  skipped: number;
  /** The handler ran but its outcome was not written (the row changed meanwhile, or the write failed). */
  unrecorded: number;
}

type DeadlineSweepResult = keyof Omit<DeadlineSweepSummary, 'claimed'>;
type RecordedResult = Exclude<DeadlineSweepResult, 'skipped' | 'unrecorded'>;

/**
 * Retry delay after the Nth failed run since the last healthy one (a reschedule restarts the
 * count): 30 s, 1 min, 2 min, … capped at 1 h — never given up.
 */
export function deadlineBackoffMs(attempts: number): number {
  const exponent = Math.max(0, attempts - 1);
  return Math.min(DEADLINE_BACKOFF_BASE_MS * 2 ** Math.min(exponent, 20), DEADLINE_BACKOFF_MAX_MS);
}

/**
 * Fires due deadlines (ADR "Outbox and deadlines"). Each tick claims due, unleased rows with
 * `FOR UPDATE SKIP LOCKED` — so two sweepers never hold the same row — stamps a lease and counts
 * the attempt, then runs each row's handler — renewing its lease first, under a timeout — and
 * records its outcome. A handler that throws or times out (or a kind with no handler) leaves
 * `lastError` and a capped backoff; the row is retried until it resolves, because a lapse is never
 * forgiven by a broken handler. Rows are isolated: one failure never blocks another.
 *
 * Tenant context: the sweep is declared system work (`deadline-sweep`), because it claims rows of every tenant; each
 * handler runs as its row's tenant (`runAsTenant`), and the outcome is recorded back in the system scope.
 */
@Injectable()
export class DeadlineSweeper implements QueueJobHandler {
  readonly jobNames = [BULK_OPS_JOB_NAMES.DEADLINE_SWEEP];
  private readonly logger = new Logger(DeadlineSweeper.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(DEADLINE_HANDLERS) private readonly handlers: DeadlineHandlerRegistry,
  ) {}

  run(job: Job): Promise<DeadlineSweepSummary> {
    return withJobContext(job, () => this.sweep());
  }

  sweep(): Promise<DeadlineSweepSummary> {
    return systemScope('deadline-sweep', () => this.sweepAll());
  }

  private async sweepAll(): Promise<DeadlineSweepSummary> {
    const summary: DeadlineSweepSummary = {
      claimed: 0,
      fired: 0,
      cancelled: 0,
      rescheduled: 0,
      failed: 0,
      skipped: 0,
      unrecorded: 0,
    };
    for (let batch = 0; batch < DEADLINE_SWEEP_MAX_BATCHES; batch++) {
      const rows = await this.claim(new Date(), DEADLINE_SWEEP_BATCH_SIZE);
      summary.claimed += rows.length;
      for (const row of rows) {
        const result = await this.process(row);
        summary[result] += 1;
      }
      if (rows.length < DEADLINE_SWEEP_BATCH_SIZE) break;
    }
    if (summary.claimed > 0) this.logger.log(`Deadline sweep: ${JSON.stringify(summary)}`);
    return summary;
  }

  /** Claim up to `limit` due rows: lease them and count the attempt, in one statement. */
  private claim(now: Date, limit: number): Promise<Deadline[]> {
    const leaseUntil = new Date(now.getTime() + DEADLINE_LEASE_MS);
    return this.prisma.$queryRaw<Deadline[]>`
      UPDATE deadlines
         SET locked_until_at = ${leaseUntil}, attempts = attempts + 1, updated_at = ${now}
       WHERE id IN (
         SELECT id FROM deadlines
          WHERE fired_at IS NULL AND cancelled_at IS NULL
            AND due_at <= ${now}
            AND (locked_until_at IS NULL OR locked_until_at <= ${now})
          ORDER BY due_at
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED)
      RETURNING id, tenant_id AS "tenantId", kind, subject_type AS "subjectType", subject_id AS "subjectId",
                dedupe_key AS "dedupeKey", due_at AS "dueAt", payload, fired_at AS "firedAt",
                cancelled_at AS "cancelledAt", cancel_reason AS "cancelReason", attempts,
                locked_until_at AS "lockedUntilAt", last_error AS "lastError",
                created_at AS "createdAt", updated_at AS "updatedAt"`;
  }

  private async process(claimedRow: Deadline): Promise<DeadlineSweepResult> {
    const row = await this.renewLease(claimedRow);
    if (!row) return 'skipped';
    const handler = this.handlers.get(row.kind);
    if (!handler) {
      this.logger.warn(`Deadline ${row.id}: no handler for kind "${row.kind}" — backing off`);
      return this.recordFailure(row, `no handler for kind ${row.kind}`);
    }
    let outcome: DeadlineOutcome;
    try {
      const fire = runAsTenant(row.tenantId, `${RLS_SOURCE.DEADLINE}:${row.kind}`, () => handler.fire(row));
      outcome = await withTimeout(fire, DEADLINE_HANDLER_TIMEOUT_MS);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Deadline ${row.id} (${row.kind}) handler threw on attempt ${row.attempts}: ${message}`);
      return this.recordFailure(row, message);
    }
    return this.recordOutcome(row, outcome);
  }

  /**
   * Restart the lease from now, just before the handler runs — only while the row still carries
   * the lease this sweeper's claim stamped (a fencing check: a sweeper that re-claimed a lapsed
   * lease stamped its own). Returns the row with its new lease, or `null` when it is no longer ours.
   */
  private async renewLease(row: Deadline): Promise<Deadline | null> {
    const lockedUntilAt = new Date(Date.now() + DEADLINE_LEASE_MS);
    try {
      const { count } = await this.prisma.deadline.updateMany({
        where: { id: row.id, ...PENDING_DEADLINE, lockedUntilAt: row.lockedUntilAt, attempts: row.attempts },
        data: { lockedUntilAt },
      });
      if (count === 1) return { ...row, lockedUntilAt };
      this.logger.log(`Deadline ${row.id}: no longer ours before its handler ran (re-claimed or resolved) — skipped`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Deadline ${row.id}: could not renew the lease (${message}) — retried after it lapses`);
    }
    return null;
  }

  private async recordOutcome(row: Deadline, outcome: DeadlineOutcome): Promise<DeadlineSweepResult> {
    const now = new Date();
    switch (outcome.outcome) {
      case 'fired':
        return this.stamp(row, 'fired', { firedAt: now, lockedUntilAt: null });
      case 'cancelled':
        return this.stamp(row, 'cancelled', {
          cancelledAt: now,
          cancelReason: outcome.reason.slice(0, CANCEL_REASON_MAX_LENGTH),
          lockedUntilAt: null,
        });
      case 'reschedule':
        if (!(outcome.dueAt instanceof Date) || Number.isNaN(outcome.dueAt.getTime())) {
          return this.recordFailure(row, 'handler asked to reschedule without a valid dueAt');
        }
        // A reschedule is a healthy run: the attempt count restarts, so a later failure backs off
        // from 30 s rather than as if every earlier reschedule had failed.
        return this.stamp(row, 'rescheduled', {
          dueAt: outcome.dueAt,
          lockedUntilAt: null,
          lastError: null,
          attempts: 0,
        });
      default:
        return this.recordFailure(row, `handler returned an unknown outcome`);
    }
  }

  private recordFailure(row: Deadline, message: string): Promise<DeadlineSweepResult> {
    const retryAt = new Date(Date.now() + deadlineBackoffMs(row.attempts));
    return this.stamp(row, 'failed', { lastError: message.slice(0, LAST_ERROR_MAX_LENGTH), lockedUntilAt: retryAt });
  }

  /**
   * Write the outcome only while the row is still pending — a `schedule` that superseded it, or a
   * `cancel`, while the handler ran wins. A stamp that fails is logged and left to the lease: the
   * row is claimed again once it lapses. Either way the sweep counts it `unrecorded`, never as
   * the outcome it meant to write.
   */
  private async stamp(
    row: Deadline,
    result: RecordedResult,
    data: Prisma.DeadlineUpdateManyMutationInput,
  ): Promise<DeadlineSweepResult> {
    try {
      const { count } = await this.prisma.deadline.updateMany({ where: { id: row.id, ...PENDING_DEADLINE }, data });
      if (count === 1) return result;
      this.logger.log(`Deadline ${row.id} was cancelled while its handler ran — outcome dropped`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Deadline ${row.id}: could not record the outcome (${message}) — retried after the lease`);
    }
    return 'unrecorded';
  }
}

/** Reject with a timeout error when `work` has not settled within `ms` (the work itself is not stopped). */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`handler timed out after ${ms / 1000} s`)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

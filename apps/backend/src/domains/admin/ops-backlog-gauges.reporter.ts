import { Inject, Injectable, Logger, Optional, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { PENDING_DEADLINE } from '@appshore/platform/infrastructure/deadlines/deadline.types';
import { reportsOpsGauges } from '@appshore/kernel/shared/utils/process-role';
import { resolveMetricExportConfig } from '@appshore/kernel/infrastructure/telemetry/telemetry-config';
import {
  recordDeadlineOldestDue,
  recordOutboxOldestUnpublished,
} from '@appshore/kernel/infrastructure/telemetry/metrics';
import { OUTBOX_HEALTH_READER, type OutboxHealthReader } from './outbox-health.reader';

/** How often the two backlog gauges are read. Twice per 60 s metric export, so a point is never more than 30 s old. */
export const OPS_BACKLOG_SAMPLE_MS = 30_000;

/**
 * Feeds `app_outbox_oldest_unpublished_seconds` and `app_deadline_oldest_due_seconds`, the two gauges behind the
 * `outbox-backlog` and `deadline-sweep-late` rules (ADR "Outbox and deadlines"). The outbox number is the Timers
 * page's own reader (`oldestAgeSeconds`, 0 when nothing waits). The deadline number is how long the oldest pending
 * deadline is past its due time, 0 when none is: a row whose last run threw is left out, because it is FAILING on
 * the Timers page and waits out its own backoff, so the gauge measures whether the sweeper claims what is due.
 *
 * App-side because both reads need Prisma; the instruments are still created only in `metrics.ts`. Runs only in the
 * reporting process (`reportsOpsGauges()`) and only when metrics are exported, so a laptop or a level 0 deployment
 * runs no extra query. Every rule on these gauges aggregates with `max`: several reporting tasks report the same value.
 */
@Injectable()
export class OpsBacklogGaugesReporter implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OpsBacklogGaugesReporter.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(OUTBOX_HEALTH_READER) private readonly outbox?: OutboxHealthReader,
  ) {}

  onModuleInit(): void {
    if (!reportsOpsGauges() || !resolveMetricExportConfig()) return;
    void this.sample();
    this.timer = setInterval(() => void this.sample(), OPS_BACKLOG_SAMPLE_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Read both numbers and set the gauges. Never throws: a failed read leaves the last value and logs once. */
  async sample(now: Date = new Date()): Promise<void> {
    try {
      const [outbox, oldestDue] = await Promise.all([
        this.outbox?.health() ?? Promise.resolve(null),
        this.prisma.deadline.findFirst({
          where: { ...PENDING_DEADLINE, lastError: null, dueAt: { lte: now } },
          orderBy: { dueAt: 'asc' },
          select: { dueAt: true },
        }),
      ]);
      if (outbox) recordOutboxOldestUnpublished(outbox.oldestAgeSeconds ?? 0);
      recordDeadlineOldestDue(oldestDue ? (now.getTime() - oldestDue.dueAt.getTime()) / 1000 : 0);
    } catch (err) {
      this.logger.warn(`Outbox and deadline gauges not read: ${(err as Error)?.message ?? String(err)}`);
    }
  }
}

import { Inject, Injectable, Logger, Optional, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { Job, Queue } from 'bullmq';
import { BULK_OPS_JOB_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import { buildJobVocabulary, type JobVocabulary } from '@appshore/kernel/infrastructure/queue/job-vocabulary';
import { reportsOpsGauges } from '@appshore/kernel/shared/utils/process-role';
import { cronIntervalSeconds } from '@appshore/kernel/shared/utils/cron-window';
import {
  registerQueueGauges,
  type CronIntervalSample,
  type QueueDepthSample,
} from '@appshore/kernel/infrastructure/telemetry/metrics';
import { JOB_VOCABULARY } from './job-vocabulary.token';
import { queueByName } from './queue-by-name';

/** Waiting means runnable and not running: plain FIFO, paused, and prioritized jobs. */
const WAITING_STATES = ['waiting', 'paused', 'prioritized'] as const;
const COUNTED_STATES = [...WAITING_STATES, 'active', 'failed', 'delayed'] as const;

/**
 * A repeatable that runs more often than this has no `app_cron_*` series: a `cron.completed` line every few seconds
 * is noise, and a missed-run rule at twice a ten-second interval would flap. The outbox relay (10 s) and the
 * deadline sweeper (30 s) are covered by their own gauges and by the heartbeat instead.
 */
export const MIN_CRON_INTERVAL_SECONDS = 60;

/**
 * Repeatables of a minute or more that report no expected interval, each with its reason. `cron-run-coverage.spec.ts`
 * accepts these in place of a `CronRun` wrap.
 */
export const CRON_INTERVAL_EXEMPT: Readonly<Record<string, string>> = {
  [BULK_OPS_JOB_NAMES.OPS_HEARTBEAT]:
    'its own ops.heartbeat line is the signal (worker-heartbeat-missing); a cron-missed series would duplicate it',
};

type RepeatableJob = Awaited<ReturnType<Queue['getRepeatableJobs']>>[number];

/**
 * When a job became runnable. A delayed job (repeatables included) keeps its creation `timestamp`, so without the
 * delay a cron promoted on schedule would read as having waited for hours.
 */
export function jobDueAtMs(job: Pick<Job, 'timestamp' | 'delay'>): number {
  return job.timestamp + Math.max(0, job.delay ?? 0);
}

/** A repeatable's interval in seconds: its `every`, or the shortest gap of its cron pattern. */
export function repeatableIntervalSeconds(repeatable: RepeatableJob, from: Date = new Date()): number | undefined {
  const every = Number(repeatable.every);
  if (Number.isFinite(every) && every > 0) return every / 1000;
  if (repeatable.pattern) return cronIntervalSeconds(repeatable.pattern, repeatable.tz ?? 'UTC', from);
  return undefined;
}

/**
 * Publishes the `app_queue_*` depth gauges and `app_cron_expected_interval_seconds`, polled from BullMQ on each
 * metric export (every 60 s, a few Redis calls per queue).
 *
 * Only the reporting process reports (`reportsOpsGauges()`: the worker, or the API when Terraform says there is no
 * worker). Queue depth is a property of Redis, not of the process reading it, so two reporters would publish the same
 * numbers twice. Several reporting tasks each report with their own `service.instance.id`, which is why the rules
 * read `max by (queue)`.
 *
 * The cron intervals come from the repeatables BullMQ actually holds, not from a list: template schedules are rows an
 * admin can edit or disable, and a disabled or unregistered schedule then simply has no series, so the one
 * `cron-missed` rule stays silent for it. A job registered several times (one per tenant) reports its shortest
 * interval. With no OTLP endpoint there is no meter provider and nothing is polled.
 */
@Injectable()
export class QueueMetricsReporter implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueMetricsReporter.name);
  private readonly vocabulary: JobVocabulary;
  private unregister: (() => void) | undefined;

  constructor(
    private readonly moduleRef: ModuleRef,
    @Optional() @Inject(JOB_VOCABULARY) vocabulary?: JobVocabulary,
  ) {
    this.vocabulary = vocabulary ?? buildJobVocabulary();
  }

  onModuleInit(): void {
    if (!reportsOpsGauges()) return;
    const queues = this.vocabulary.queueNames
      .map((name) => queueByName(this.moduleRef, name))
      .filter((queue): queue is Queue => queue !== null);
    this.unregister = registerQueueGauges(
      () => this.sample(queues),
      () => this.sampleCrons(queues),
    );
  }

  onModuleDestroy(): void {
    this.unregister?.();
    this.unregister = undefined;
  }

  async sample(queues: Queue[], now: number = Date.now()): Promise<QueueDepthSample[]> {
    const samples = await Promise.all(queues.map((queue) => this.sampleQueue(queue, now)));
    return samples.filter((sample): sample is QueueDepthSample => sample !== null);
  }

  /** The expected interval of every repeatable of a minute or more, by job name (shortest when registered twice). */
  async sampleCrons(queues: Queue[], now: Date = new Date()): Promise<CronIntervalSample[]> {
    const shortest = new Map<string, number>();
    for (const queue of queues) {
      let repeatables: RepeatableJob[];
      try {
        repeatables = await queue.getRepeatableJobs();
      } catch (err) {
        this.logger.warn(`Repeatables unavailable for ${queue.name}: ${(err as Error)?.message ?? String(err)}`);
        continue;
      }
      for (const repeatable of repeatables) {
        if (repeatable.name in CRON_INTERVAL_EXEMPT) continue;
        const seconds = repeatableIntervalSeconds(repeatable, now);
        if (seconds === undefined || seconds < MIN_CRON_INTERVAL_SECONDS) continue;
        shortest.set(repeatable.name, Math.min(seconds, shortest.get(repeatable.name) ?? Infinity));
      }
    }
    return [...shortest].map(([jobName, intervalSeconds]) => ({ jobName, intervalSeconds }));
  }

  /** One queue's depth, or null when Redis could not answer (that queue is skipped this round). */
  private async sampleQueue(queue: Queue, now: number): Promise<QueueDepthSample | null> {
    try {
      // The head of each list (ascending = oldest first); one job per state at most.
      const [counts, heads] = await Promise.all([
        queue.getJobCounts(...COUNTED_STATES),
        queue.getJobs(['wait', 'paused'], 0, 0, true),
      ]);
      const waiting = WAITING_STATES.reduce((sum, state) => sum + (counts[state] ?? 0), 0);
      const dueTimes = heads.filter(Boolean).map((job) => jobDueAtMs(job));
      const oldestDueAt = dueTimes.length > 0 ? Math.min(...dueTimes) : undefined;
      return {
        queue: queue.name,
        waiting,
        active: counts.active ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
        oldestWaitingSeconds: oldestDueAt === undefined ? 0 : Math.max(0, (now - oldestDueAt) / 1000),
      };
    } catch (err) {
      this.logger.warn(`Queue depth unavailable for ${queue.name}: ${(err as Error)?.message ?? String(err)}`);
      return null;
    }
  }
}

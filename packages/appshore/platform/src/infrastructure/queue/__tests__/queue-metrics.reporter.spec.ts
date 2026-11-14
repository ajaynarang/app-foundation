import { Logger } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';
import type { Queue } from 'bullmq';
import { buildJobVocabulary } from '@appshore/kernel/infrastructure/queue/job-vocabulary';
import { QUEUE_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import { setProcessRole } from '@appshore/kernel/shared/utils/process-role';
import { InMemoryMetrics } from '@appshore/kernel/infrastructure/telemetry/testing/in-memory-metrics';
import { QueueMetricsReporter, jobDueAtMs, repeatableIntervalSeconds } from '../queue-metrics.reporter';

const NOW = Date.parse('2026-10-29T12:00:00Z');

type Repeatable = { name: string; key?: string; every?: string | number | null; pattern?: string | null };

function fakeQueue(
  name: string,
  counts: Record<string, number> = {},
  heads: Array<{ timestamp: number; delay?: number }> = [],
  repeatables: Repeatable[] = [],
) {
  return {
    name,
    getJobCounts: jest.fn().mockResolvedValue(counts),
    getJobs: jest.fn().mockResolvedValue(heads),
    getRepeatableJobs: jest.fn().mockResolvedValue(repeatables.map((r) => ({ key: r.name, ...r }))),
  } as unknown as Queue;
}

describe('QueueMetricsReporter', () => {
  let harness: InMemoryMetrics;
  const originalFlag = process.env.OPS_GAUGES_FROM_API;

  beforeEach(() => {
    delete process.env.OPS_GAUGES_FROM_API;
    harness = InMemoryMetrics.install();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    setProcessRole('api');
    if (originalFlag === undefined) delete process.env.OPS_GAUGES_FROM_API;
    else process.env.OPS_GAUGES_FROM_API = originalFlag;
    jest.restoreAllMocks();
    await harness.uninstall();
  });

  function reporterFor(queues: Record<string, Queue>) {
    const moduleRef = {
      get: jest.fn((token: string) => {
        const name = token.replace(/^BullQueue_/, '');
        return queues[name] ?? fakeQueue(name);
      }),
    } as unknown as ModuleRef;
    return { reporter: new QueueMetricsReporter(moduleRef, buildJobVocabulary()), moduleRef };
  }

  describe('sample', () => {
    it('adds paused and prioritized to waiting and ages the oldest job from when it was due', async () => {
      const queue = fakeQueue('events', { waiting: 2, paused: 3, prioritized: 1, active: 4, failed: 5, delayed: 6 }, [
        { timestamp: NOW - 90_000 },
        { timestamp: NOW - 300_000, delay: 240_000 },
      ]);
      const { reporter } = reporterFor({});

      const [sample] = await reporter.sample([queue], NOW);

      expect(sample).toEqual({
        queue: 'events',
        waiting: 6,
        active: 4,
        failed: 5,
        delayed: 6,
        oldestWaitingSeconds: 90,
      });
      expect(queue.getJobs).toHaveBeenCalledWith(['wait', 'paused'], 0, 0, true);
    });

    it('reports zero age for an empty queue', async () => {
      const { reporter } = reporterFor({});

      const [sample] = await reporter.sample([fakeQueue('bulk-ops')], NOW);

      expect(sample).toMatchObject({ waiting: 0, oldestWaitingSeconds: 0 });
    });

    it('skips a queue Redis cannot answer for and still reports the rest', async () => {
      const broken = {
        name: 'webhooks',
        getJobCounts: jest.fn().mockRejectedValue(new Error('ECONNRESET')),
        getJobs: jest.fn().mockResolvedValue([]),
      };
      const { reporter } = reporterFor({});

      const samples = await reporter.sample([broken as unknown as Queue, fakeQueue('events', { waiting: 1 })], NOW);

      expect(samples.map((s) => s.queue)).toEqual(['events']);
    });
  });

  describe('sampleCrons', () => {
    const at = new Date(NOW);

    it('reports the interval of every repeatable of a minute or more, from every or from the cron pattern', async () => {
      const bulkOps = fakeQueue(
        'bulk-ops',
        {},
        [],
        [
          { name: 'data-retention', pattern: '0 4 * * *' },
          { name: 'ai-credential-revalidate', every: '86400000' },
          { name: 'whatsapp-stale-sweep', every: 900_000 },
        ],
      );
      const { reporter } = reporterFor({});

      const crons = await reporter.sampleCrons([bulkOps], at);

      expect(crons).toEqual([
        { jobName: 'data-retention', intervalSeconds: 86_400 },
        { jobName: 'ai-credential-revalidate', intervalSeconds: 86_400 },
        { jobName: 'whatsapp-stale-sweep', intervalSeconds: 900 },
      ]);
    });

    it('reports no series for a sub-minute repeatable (the outbox relay, the deadline sweeper)', async () => {
      const bulkOps = fakeQueue(
        'bulk-ops',
        {},
        [],
        [
          { name: 'outbox-relay', every: 10_000 },
          { name: 'deadline-sweep', every: 30_000 },
          { name: 'every-minute', pattern: '* * * * *' },
        ],
      );
      const { reporter } = reporterFor({});

      expect(await reporter.sampleCrons([bulkOps], at)).toEqual([{ jobName: 'every-minute', intervalSeconds: 60 }]);
    });

    it('reports no series for the heartbeat, which has its own rule', async () => {
      const bulkOps = fakeQueue('bulk-ops', {}, [], [{ name: 'ops-heartbeat', every: 300_000 }]);
      const { reporter } = reporterFor({});

      expect(await reporter.sampleCrons([bulkOps], at)).toEqual([]);
    });

    it('reports a job registered once per tenant once, at its shortest interval', async () => {
      const bulkOps = fakeQueue(
        'bulk-ops',
        {},
        [],
        [
          { name: 'oauth-refresh', key: 'a', every: 3_600_000 },
          { name: 'oauth-refresh', key: 'b', every: 1_800_000 },
        ],
      );
      const { reporter } = reporterFor({});

      expect(await reporter.sampleCrons([bulkOps], at)).toEqual([{ jobName: 'oauth-refresh', intervalSeconds: 1800 }]);
    });

    it('a disabled schedule (no repeatable in Redis) has no series', async () => {
      const { reporter } = reporterFor({});

      expect(await reporter.sampleCrons([fakeQueue('bulk-ops')], at)).toEqual([]);
    });
  });

  describe('lifecycle', () => {
    it('publishes app_queue_* for every queue and the cron intervals in the worker', async () => {
      setProcessRole('worker');
      const { reporter } = reporterFor({
        [QUEUE_NAMES.EVENTS]: fakeQueue('events', { waiting: 7 }),
        [QUEUE_NAMES.BULK_OPS]: fakeQueue('bulk-ops', {}, [], [{ name: 'job-cleanup', pattern: '0 3 * * *' }]),
      });

      reporter.onModuleInit();
      const waiting = await harness.points('app_queue_waiting');
      const intervals = await harness.points('app_cron_expected_interval_seconds');
      reporter.onModuleDestroy();

      expect(waiting).toHaveLength(Object.keys(QUEUE_NAMES).length);
      expect(waiting.find((p) => p.attributes.queue === 'events')?.value).toBe(7);
      expect(intervals).toEqual([expect.objectContaining({ attributes: { job_name: 'job-cleanup' }, value: 86_400 })]);
    });

    it('never reports from the API process by default, even when it consumes jobs', async () => {
      const { reporter, moduleRef } = reporterFor({});

      reporter.onModuleInit();

      expect(moduleRef.get).not.toHaveBeenCalled();
      expect(await harness.points('app_queue_waiting')).toHaveLength(0);
    });

    it('reports from the API when OPS_GAUGES_FROM_API=true (no worker task)', async () => {
      process.env.OPS_GAUGES_FROM_API = 'true';
      const { reporter } = reporterFor({});

      reporter.onModuleInit();
      const waiting = await harness.points('app_queue_waiting');
      reporter.onModuleDestroy();

      expect(waiting.length).toBeGreaterThan(0);
    });

    it('stops polling Redis after shutdown', async () => {
      setProcessRole('worker');
      const events = fakeQueue('events');
      const { reporter } = reporterFor({ [QUEUE_NAMES.EVENTS]: events });
      reporter.onModuleInit();
      await harness.collect();

      reporter.onModuleDestroy();
      await harness.collect();

      expect(events.getJobCounts).toHaveBeenCalledTimes(1);
    });
  });
});

describe('jobDueAtMs', () => {
  it('is the creation time for an immediate job and creation plus delay for a delayed one', () => {
    expect(jobDueAtMs({ timestamp: 1_000 } as never)).toBe(1_000);
    expect(jobDueAtMs({ timestamp: 1_000, delay: 500 } as never)).toBe(1_500);
  });
});

describe('repeatableIntervalSeconds', () => {
  it('is undefined for a repeatable with neither every nor a readable pattern', () => {
    expect(repeatableIntervalSeconds({ name: 'x', key: 'x', pattern: 'nonsense' } as never)).toBeUndefined();
    expect(repeatableIntervalSeconds({ name: 'x', key: 'x' } as never)).toBeUndefined();
  });
});

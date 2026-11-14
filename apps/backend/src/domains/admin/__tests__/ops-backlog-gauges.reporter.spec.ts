import { Logger } from '@nestjs/common';
import { setProcessRole } from '@appshore/kernel/shared/utils/process-role';
import { InMemoryMetrics } from '@appshore/kernel/infrastructure/telemetry/testing/in-memory-metrics';
import type { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { OpsBacklogGaugesReporter } from '../ops-backlog-gauges.reporter';
import type { OutboxHealthReader } from '../outbox-health.reader';

const NOW = new Date('2026-11-13T12:00:00Z');

function prismaWith(oldestDue: Date | null) {
  return {
    deadline: { findFirst: jest.fn().mockResolvedValue(oldestDue ? { dueAt: oldestDue } : null) },
  } as unknown as PrismaService & { deadline: { findFirst: jest.Mock } };
}

const outboxWith = (oldestAgeSeconds: number | null): OutboxHealthReader => ({
  health: jest.fn().mockResolvedValue({ unpublished: oldestAgeSeconds === null ? 0 : 3, oldestAgeSeconds }),
});

describe('OpsBacklogGaugesReporter', () => {
  let harness: InMemoryMetrics;
  const savedEnv = { ...process.env };

  beforeEach(() => {
    harness = InMemoryMetrics.install();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    process.env = { ...savedEnv };
    setProcessRole('api');
    jest.restoreAllMocks();
    await harness.uninstall();
  });

  const value = async (name: string) => (await harness.points(name))[0]?.value;

  it('sets the outbox gauge from the Timers reader and the deadline gauge from the oldest due pending row', async () => {
    const prisma = prismaWith(new Date(NOW.getTime() - 20 * 60_000));
    const reporter = new OpsBacklogGaugesReporter(prisma, outboxWith(95));

    await reporter.sample(NOW);

    expect(await value('app_outbox_oldest_unpublished_seconds')).toBe(95);
    expect(await value('app_deadline_oldest_due_seconds')).toBe(1200);
    expect(prisma.deadline.findFirst).toHaveBeenCalledWith({
      where: { firedAt: null, cancelledAt: null, lastError: null, dueAt: { lte: NOW } },
      orderBy: { dueAt: 'asc' },
      select: { dueAt: true },
    });
  });

  it('reads 0 for both when nothing waits', async () => {
    const reporter = new OpsBacklogGaugesReporter(prismaWith(null), outboxWith(null));

    await reporter.sample(NOW);

    expect(await value('app_outbox_oldest_unpublished_seconds')).toBe(0);
    expect(await value('app_deadline_oldest_due_seconds')).toBe(0);
  });

  it('never throws when the database cannot be read', async () => {
    const prisma = prismaWith(null);
    prisma.deadline.findFirst.mockRejectedValue(new Error('connection refused'));

    await expect(new OpsBacklogGaugesReporter(prisma, outboxWith(1)).sample(NOW)).resolves.toBeUndefined();
  });

  it('does not poll in the API by default, nor anywhere with no metric export', () => {
    const prisma = prismaWith(null);
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'https://otlp.example.net/otlp';

    new OpsBacklogGaugesReporter(prisma, outboxWith(1)).onModuleInit();
    setProcessRole('worker');
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    process.env.ENV_TYPE = 'production';
    new OpsBacklogGaugesReporter(prisma, outboxWith(1)).onModuleInit();

    expect(prisma.deadline.findFirst).not.toHaveBeenCalled();
  });

  it('polls in the reporting process when metrics are exported, and stops on shutdown', () => {
    jest.useFakeTimers();
    const prisma = prismaWith(null);
    setProcessRole('worker');
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'https://otlp.example.net/otlp';
    const reporter = new OpsBacklogGaugesReporter(prisma, outboxWith(1));

    reporter.onModuleInit();
    jest.advanceTimersByTime(60_000);
    reporter.onModuleDestroy();
    jest.advanceTimersByTime(60_000);
    jest.useRealTimers();

    expect(prisma.deadline.findFirst).toHaveBeenCalledTimes(3);
  });
});

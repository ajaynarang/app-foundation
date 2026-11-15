import { Logger } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { BULK_OPS_JOB_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import { JOB_EVENTS } from '@appshore/kernel/infrastructure/queue/job-events';
import { OPS_HEARTBEAT_EVERY_MS, OpsHeartbeatJobHandler } from '../ops-heartbeat.job';
import type { PrismaService } from '../../database/prisma.service';

function makeQueue(repeatables: Array<{ name: string; key?: string; every?: string }> = []) {
  return {
    getRepeatableJobs: jest.fn().mockResolvedValue(repeatables.map((r) => ({ key: r.name, ...r }))),
    removeRepeatableByKey: jest.fn().mockResolvedValue(true),
    add: jest.fn().mockResolvedValue(undefined),
  };
}

function makePrisma(row: unknown = null) {
  return { jobSchedule: { findUnique: jest.fn().mockResolvedValue(row) } } as unknown as PrismaService;
}

const handler = (queue = makeQueue(), prisma = makePrisma()) =>
  new OpsHeartbeatJobHandler(queue as unknown as Queue, prisma);

describe('OpsHeartbeatJobHandler', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('registers a repeatable ops-heartbeat every 5 minutes as a system job, with no schedule row', async () => {
    const queue = makeQueue();

    await handler(queue).onModuleInit();

    expect(queue.add).toHaveBeenCalledTimes(1);
    const [name, data, opts] = queue.add.mock.calls[0];
    expect(name).toBe(BULK_OPS_JOB_NAMES.OPS_HEARTBEAT);
    expect(data).toMatchObject({ tenantId: 'system', metadata: { source: 'cron' } });
    expect(opts).toMatchObject({ repeat: { every: OPS_HEARTBEAT_EVERY_MS }, attempts: 1 });
    expect(OPS_HEARTBEAT_EVERY_MS).toBe(300_000);
  });

  it('does not register a second repeatable when one exists (both API and worker boot it)', async () => {
    const queue = makeQueue([{ name: BULK_OPS_JOB_NAMES.OPS_HEARTBEAT, every: String(OPS_HEARTBEAT_EVERY_MS) }]);

    await handler(queue).onModuleInit();

    expect(queue.add).not.toHaveBeenCalled();
  });

  it('removes the repeatable when its schedule row is disabled (the level 2 test-fire with no worker)', async () => {
    const queue = makeQueue([{ name: BULK_OPS_JOB_NAMES.OPS_HEARTBEAT, key: 'hb', every: '300000' }]);
    const prisma = makePrisma({
      category: 'maintenance',
      jobType: BULK_OPS_JOB_NAMES.OPS_HEARTBEAT,
      scheduleType: 'interval',
      pattern: null,
      intervalMs: 300_000,
      isEnabled: false,
    });

    await handler(queue, prisma).onModuleInit();

    expect(queue.removeRepeatableByKey).toHaveBeenCalledWith('hb');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('never blocks boot when Redis or the database is down', async () => {
    const queue = makeQueue();
    queue.getRepeatableJobs.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(handler(queue).onModuleInit()).resolves.toBeUndefined();
  });

  it('owns only the ops-heartbeat job name', () => {
    expect(handler().jobNames).toEqual(['ops-heartbeat']);
  });

  it('logs one ops.heartbeat line naming the queue and process that ran it', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    const result = await handler().run({ name: 'ops-heartbeat', queueName: 'bulk-ops' } as Job);

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: JOB_EVENTS.OPS_HEARTBEAT, queue: 'bulk-ops', process: 'api' }),
    );
    expect(result.beatAt).toEqual(expect.any(String));
  });
});

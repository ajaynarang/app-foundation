import { BULK_OPS_JOB_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import { createMockPrisma } from '@appshore/platform/test/mocks/prisma.mock';
import { OUTBOX_RELAY_TICK_JOB_ID, OutboxRelayScheduler } from './outbox-relay.scheduler';

describe('OutboxRelayScheduler', () => {
  const name = BULK_OPS_JOB_NAMES.OUTBOX_RELAY;

  function make() {
    const prisma = createMockPrisma();
    const queue = {
      getRepeatableJobs: jest.fn().mockResolvedValue([]),
      add: jest.fn(),
      removeRepeatableByKey: jest.fn(),
    };
    const scheduler = new OutboxRelayScheduler(queue as never, prisma as never);
    return { scheduler, prisma, queue };
  }

  it('registers the relay every 10s by default, with no jobSchedule row needed', async () => {
    const { scheduler, prisma, queue } = make();
    prisma.jobSchedule.findUnique.mockResolvedValue(null);

    await scheduler.onModuleInit();

    expect(prisma.jobSchedule.findUnique).toHaveBeenCalledWith({
      where: { category_jobType: { category: 'maintenance', jobType: name } },
    });
    expect(queue.add).toHaveBeenCalledWith(
      name,
      expect.objectContaining({
        tenantId: 'system',
        payload: {},
        metadata: expect.objectContaining({ source: 'cron' }),
      }),
      {
        repeat: { every: 10_000 },
        jobId: OUTBOX_RELAY_TICK_JOB_ID,
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  });

  it('removes the tick when the jobSchedule row disables it', async () => {
    const { scheduler, prisma, queue } = make();
    prisma.jobSchedule.findUnique.mockResolvedValue({ isEnabled: false, intervalMs: null });
    queue.getRepeatableJobs.mockResolvedValue([{ name, key: 'k', every: '10000' }]);

    await scheduler.onModuleInit();

    expect(queue.removeRepeatableByKey).toHaveBeenCalledWith('k');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('does nothing when disabled and not registered', async () => {
    const { scheduler, prisma, queue } = make();
    prisma.jobSchedule.findUnique.mockResolvedValue({ isEnabled: false, intervalMs: null });

    await scheduler.onModuleInit();

    expect(queue.removeRepeatableByKey).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('re-registers when the interval changed and leaves it alone when unchanged', async () => {
    const { scheduler, prisma, queue } = make();
    prisma.jobSchedule.findUnique.mockResolvedValue({ isEnabled: true, intervalMs: 30_000 });
    queue.getRepeatableJobs.mockResolvedValue([{ name, key: 'k', every: '10000' }]);

    await scheduler.onModuleInit();
    expect(queue.removeRepeatableByKey).toHaveBeenCalledWith('k');
    expect(queue.add).toHaveBeenCalledWith(
      name,
      expect.anything(),
      expect.objectContaining({ repeat: { every: 30_000 } }),
    );

    queue.add.mockClear();
    queue.getRepeatableJobs.mockResolvedValue([{ name, key: 'k', every: '30000' }]);
    await scheduler.onModuleInit();
    expect(queue.add).not.toHaveBeenCalled();
  });
});

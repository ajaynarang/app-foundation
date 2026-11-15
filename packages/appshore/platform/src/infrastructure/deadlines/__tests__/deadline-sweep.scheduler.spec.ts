import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import { DeadlineSweepScheduler } from '../deadline-sweep.scheduler';
import { DEFAULT_DEADLINE_SWEEP_INTERVAL_MS } from '../deadline.types';

function mockQueue(repeatables: Array<{ name: string; key: string; every: string | null }> = []) {
  return {
    getRepeatableJobs: jest.fn().mockResolvedValue(repeatables),
    removeRepeatableByKey: jest.fn().mockResolvedValue(true),
    add: jest.fn().mockResolvedValue({}),
  };
}

describe('DeadlineSweepScheduler', () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  it('registers the tick every 30 s by default, keyed and self-cleaning', async () => {
    const queue = mockQueue();
    prisma.jobSchedule.findUnique.mockResolvedValue(null);

    await new DeadlineSweepScheduler(queue as never, prisma).onModuleInit();

    expect(prisma.jobSchedule.findUnique).toHaveBeenCalledWith({
      where: { category_jobType: { category: 'maintenance', jobType: 'deadline-sweep' } },
    });
    expect(queue.add).toHaveBeenCalledWith(
      'deadline-sweep',
      expect.objectContaining({
        tenantId: 'system',
        payload: {},
        metadata: expect.objectContaining({ source: 'cron' }),
      }),
      {
        repeat: { every: DEFAULT_DEADLINE_SWEEP_INTERVAL_MS },
        jobId: 'maintenance-deadline-sweep',
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  });

  it('honours the jobSchedule interval', async () => {
    const queue = mockQueue();
    prisma.jobSchedule.findUnique.mockResolvedValue({ isEnabled: true, intervalMs: 10_000 });

    await new DeadlineSweepScheduler(queue as never, prisma).onModuleInit();

    expect(queue.add.mock.calls[0][2].repeat).toEqual({ every: 10_000 });
  });

  it('leaves an identical registration alone', async () => {
    const queue = mockQueue([{ name: 'deadline-sweep', key: 'k', every: '30000' }]);
    prisma.jobSchedule.findUnique.mockResolvedValue(null);

    await new DeadlineSweepScheduler(queue as never, prisma).onModuleInit();

    expect(queue.removeRepeatableByKey).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('re-registers when the interval changed', async () => {
    const queue = mockQueue([{ name: 'deadline-sweep', key: 'old', every: '60000' }]);
    prisma.jobSchedule.findUnique.mockResolvedValue({ isEnabled: true, intervalMs: 15_000 });

    await new DeadlineSweepScheduler(queue as never, prisma).onModuleInit();

    expect(queue.removeRepeatableByKey).toHaveBeenCalledWith('old');
    expect(queue.add.mock.calls[0][2].repeat).toEqual({ every: 15_000 });
  });

  it('removes the tick when the schedule is disabled', async () => {
    const queue = mockQueue([{ name: 'deadline-sweep', key: 'k', every: '30000' }]);
    prisma.jobSchedule.findUnique.mockResolvedValue({ isEnabled: false, intervalMs: null });

    await new DeadlineSweepScheduler(queue as never, prisma).onModuleInit();

    expect(queue.removeRepeatableByKey).toHaveBeenCalledWith('k');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('does nothing when disabled and nothing is registered', async () => {
    const queue = mockQueue([{ name: 'other', key: 'x', every: '1' }]);
    prisma.jobSchedule.findUnique.mockResolvedValue({ isEnabled: false, intervalMs: null });

    await new DeadlineSweepScheduler(queue as never, prisma).onModuleInit();

    expect(queue.removeRepeatableByKey).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });
});

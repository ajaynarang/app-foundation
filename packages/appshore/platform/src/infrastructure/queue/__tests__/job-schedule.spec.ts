import type { Queue } from 'bullmq';
import { applyJobSchedule, type JobScheduleRow } from '../job-schedule';

function queueWith(repeatables: Array<{ name: string; key: string; pattern?: string | null; every?: string | null }>) {
  return {
    getRepeatableJobs: jest.fn().mockResolvedValue(repeatables),
    removeRepeatableByKey: jest.fn().mockResolvedValue(true),
    add: jest.fn().mockResolvedValue({}),
  };
}

const row = (overrides: Partial<JobScheduleRow> = {}): JobScheduleRow => ({
  category: 'maintenance',
  jobType: 'data-retention',
  scheduleType: 'cron',
  pattern: '0 4 * * *',
  intervalMs: null,
  isEnabled: true,
  ...overrides,
});

describe('applyJobSchedule', () => {
  it('adds one repeatable with a system envelope when an enabled row has none', async () => {
    const queue = queueWith([]);

    await expect(applyJobSchedule(queue as unknown as Queue, row())).resolves.toBe('scheduled');

    expect(queue.add).toHaveBeenCalledWith(
      'data-retention',
      expect.objectContaining({ tenantId: 'system', metadata: expect.objectContaining({ source: 'cron' }) }),
      expect.objectContaining({ repeat: { pattern: '0 4 * * *' }, jobId: 'maintenance-data-retention', attempts: 1 }),
    );
  });

  it('leaves a matching repeatable alone, so the API and the worker can both apply the row', async () => {
    const queue = queueWith([{ name: 'data-retention', key: 'k', pattern: '0 4 * * *' }]);

    await expect(applyJobSchedule(queue as unknown as Queue, row())).resolves.toBe('unchanged');

    expect(queue.removeRepeatableByKey).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('replaces a repeatable whose pattern the row no longer has', async () => {
    const queue = queueWith([{ name: 'data-retention', key: 'old', pattern: '0 2 * * *' }]);

    await expect(applyJobSchedule(queue as unknown as Queue, row())).resolves.toBe('scheduled');

    expect(queue.removeRepeatableByKey).toHaveBeenCalledWith('old');
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('removes every repeatable of a disabled row and adds none', async () => {
    const queue = queueWith([
      { name: 'data-retention', key: 'a', pattern: '0 4 * * *' },
      { name: 'data-retention', key: 'b', pattern: '0 5 * * *' },
      { name: 'job-cleanup', key: 'c', pattern: '0 3 * * *' },
    ]);

    await expect(applyJobSchedule(queue as unknown as Queue, row({ isEnabled: false }))).resolves.toBe('removed');

    expect(queue.removeRepeatableByKey.mock.calls.map(([key]) => key)).toEqual(['a', 'b']);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('schedules an interval row by every, and keeps one whose every matches', async () => {
    const interval = row({ jobType: 'ops-heartbeat', scheduleType: 'interval', pattern: null, intervalMs: 300_000 });
    const empty = queueWith([]);
    const matching = queueWith([{ name: 'ops-heartbeat', key: 'k', every: '300000' }]);

    await applyJobSchedule(empty as unknown as Queue, interval);
    await expect(applyJobSchedule(matching as unknown as Queue, interval)).resolves.toBe('unchanged');

    expect(empty.add).toHaveBeenCalledWith(
      'ops-heartbeat',
      expect.anything(),
      expect.objectContaining({ repeat: { every: 300_000 } }),
    );
  });
});

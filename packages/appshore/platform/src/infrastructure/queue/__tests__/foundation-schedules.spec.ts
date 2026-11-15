import { Logger } from '@nestjs/common';
import { FOUNDATION_JOB_SCHEDULES, FoundationSchedulesRegistrar } from '../foundation-schedules';
import type { ScheduleManagerService } from '../schedule-manager.service';

describe('FoundationSchedulesRegistrar', () => {
  afterEach(() => jest.restoreAllMocks());

  it('applies every foundation schedule row at boot', async () => {
    const schedules = { reloadSchedule: jest.fn().mockResolvedValue('scheduled') };

    await new FoundationSchedulesRegistrar(schedules as unknown as ScheduleManagerService).onApplicationBootstrap();

    expect(schedules.reloadSchedule.mock.calls).toEqual(FOUNDATION_JOB_SCHEDULES.map((s) => [s.category, s.jobType]));
  });

  it('logs a schedule it cannot apply and goes on with the rest, so a Redis blip never stops boot', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const schedules = { reloadSchedule: jest.fn().mockRejectedValueOnce(new Error('ECONNREFUSED')) };

    await expect(
      new FoundationSchedulesRegistrar(schedules as unknown as ScheduleManagerService).onApplicationBootstrap(),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(schedules.reloadSchedule).toHaveBeenCalledTimes(FOUNDATION_JOB_SCHEDULES.length);
  });

  it('lists the six foundation crons once each', () => {
    const keys = FOUNDATION_JOB_SCHEDULES.map((s) => `${s.category}/${s.jobType}`);

    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.sort()).toEqual([
      'maintenance/data-retention',
      'maintenance/job-cleanup',
      'maintenance/login-events-cleanup',
      'maintenance/tokens-cleanup',
      'maintenance/trial-expiry',
      'notifications/cleanup',
    ]);
  });
});

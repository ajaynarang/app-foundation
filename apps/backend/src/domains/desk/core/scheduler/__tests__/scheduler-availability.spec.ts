import { ConflictException } from '@nestjs/common';

import {
  assertAutomaticSchedulesAvailable,
  DESK_SCHEDULER_ENABLED_ENV,
  DESK_SCHEDULES_PAUSED_DETAIL,
  isDeskSchedulerEnabled,
} from '../scheduler-availability';

/**
 * The platform switch that turns the Desk scheduler heartbeat off for a whole environment (Inngest bills every cron
 * tick). Unset means on, so local dev is unchanged; only an explicit "off" value disables it.
 */
describe('isDeskSchedulerEnabled', () => {
  it('is on when the variable is unset', () => {
    expect(isDeskSchedulerEnabled({})).toBe(true);
  });

  it('is on for "true"', () => {
    expect(isDeskSchedulerEnabled({ [DESK_SCHEDULER_ENABLED_ENV]: 'true' })).toBe(true);
  });

  it('is on for an empty value (a blank line in an env file is not "off")', () => {
    expect(isDeskSchedulerEnabled({ [DESK_SCHEDULER_ENABLED_ENV]: '' })).toBe(true);
  });

  it.each(['false', 'FALSE', ' false ', '0', 'off'])('is off for %p', (value) => {
    expect(isDeskSchedulerEnabled({ [DESK_SCHEDULER_ENABLED_ENV]: value })).toBe(false);
  });

  it('reads process.env by default', () => {
    const prev = process.env[DESK_SCHEDULER_ENABLED_ENV];
    process.env[DESK_SCHEDULER_ENABLED_ENV] = 'false';
    try {
      expect(isDeskSchedulerEnabled()).toBe(false);
    } finally {
      if (prev === undefined) delete process.env[DESK_SCHEDULER_ENABLED_ENV];
      else process.env[DESK_SCHEDULER_ENABLED_ENV] = prev;
    }
  });
});

describe('assertAutomaticSchedulesAvailable', () => {
  it('passes when the scheduler is on', () => {
    expect(() => assertAutomaticSchedulesAvailable({})).not.toThrow();
  });

  it('throws a 409 with the paused copy when the scheduler is off', () => {
    let caught: unknown;
    try {
      assertAutomaticSchedulesAvailable({ [DESK_SCHEDULER_ENABLED_ENV]: 'false' });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ConflictException);
    expect((caught as ConflictException).message).toBe(DESK_SCHEDULES_PAUSED_DETAIL);
  });
});

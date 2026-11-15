import { Logger } from '@nestjs/common';

import { armBootstrapLogWatchdog } from '../bootstrap-log-watchdog';

describe('armBootstrapLogWatchdog', () => {
  let flushSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    flushSpy = jest.spyOn(Logger, 'flush').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('releases buffered logs and names the stall when bootstrap overruns', () => {
    armBootstrapLogWatchdog('App Worker', 1_000);

    jest.advanceTimersByTime(1_000);

    expect(flushSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('App Worker has not finished starting after 1s'));
  });

  it('stays silent when bootstrap finishes before the deadline', () => {
    const disarm = armBootstrapLogWatchdog('App Worker', 1_000);

    jest.advanceTimersByTime(999);
    disarm();
    jest.advanceTimersByTime(10_000);

    expect(flushSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

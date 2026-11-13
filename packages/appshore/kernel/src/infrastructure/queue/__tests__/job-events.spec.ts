import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { CronRun, JOB_EVENTS, isFinalFailure, reportJobFailure, toLoggableError } from '../job-events';
import * as errorTracking from '../../error-tracking/sentry';
import { resetTenantLabelsForTesting } from '../../telemetry/metrics';
import { InMemoryMetrics } from '../../telemetry/testing/in-memory-metrics';

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'bull-9',
    name: 'vendor-sync',
    queueName: 'bulk-ops',
    data: { tenantId: '4', payload: {} },
    opts: { attempts: 3 },
    attemptsMade: 1,
    ...overrides,
  } as unknown as Job;
}

describe('JOB_EVENTS', () => {
  it('pins the event names alert rules key on', () => {
    expect(JOB_EVENTS).toEqual({
      JOB_FAILED: 'job.failed',
      JOB_UNKNOWN: 'job.unknown',
      JOB_DEAD_LETTER: 'job.dead_letter',
      CRON_COMPLETED: 'cron.completed',
      OPS_HEARTBEAT: 'ops.heartbeat',
    });
  });
});

describe('isFinalFailure', () => {
  it('is false while BullMQ still has attempts left', () => {
    expect(isFinalFailure(makeJob({ attemptsMade: 2 }))).toBe(false);
  });

  it('is true once every attempt is used', () => {
    expect(isFinalFailure(makeJob({ attemptsMade: 3 }))).toBe(true);
  });

  it('is true when BullMQ stamped finishedOn (UnrecoverableError before the last attempt)', () => {
    expect(isFinalFailure(makeJob({ attemptsMade: 1, finishedOn: 1_700_000_000_000 }))).toBe(true);
  });

  it('uses the caller default when the job carries no attempts option', () => {
    const job = makeJob({ opts: {}, attemptsMade: 1 });

    expect(isFinalFailure(job)).toBe(true);
    expect(isFinalFailure(job, 3)).toBe(false);
  });
});

describe('reportJobFailure', () => {
  const logger = new Logger('TestQueue');
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('logs the final failure at error with the job identity and the err object', () => {
    const err = new Error('vendor down');

    const final = reportJobFailure(logger, makeJob({ attemptsMade: 3 }), err);

    expect(final).toBe(true);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: JOB_EVENTS.JOB_FAILED,
        jobName: 'vendor-sync',
        jobId: 'bull-9',
        queue: 'bulk-ops',
        tenantId: '4',
        attempt: 3,
        final: true,
        err: { type: 'Error', message: 'vendor down', stack: err.stack },
      }),
    );
  });

  it('logs an attempt BullMQ will retry at warn', () => {
    const final = reportJobFailure(logger, makeJob({ attemptsMade: 1 }), new Error('flaky'));

    expect(final).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.objectContaining({ event: JOB_EVENTS.JOB_FAILED, final: false }));
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('keeps the error message out of the line text, where no serializer scrubs it', () => {
    reportJobFailure(logger, makeJob({ attemptsMade: 3 }), new Error('bounce ops@example.com'));

    expect(errorSpy.mock.calls[0][0].msg).not.toContain('ops@example.com');
  });

  it('never logs the request config an HTTP client error carries (Authorization header, body)', () => {
    const err = Object.assign(new Error('Request failed with status code 502'), {
      name: 'AxiosError',
      code: 'ERR_BAD_RESPONSE',
      config: { headers: { Authorization: 'Bearer sk-live-secret' }, data: '{"phone":"+15555550100"}' },
      response: { status: 502, data: { token: 'refresh-secret' } },
    });

    reportJobFailure(logger, makeJob({ attemptsMade: 3 }), err);
    reportJobFailure(logger, makeJob({ attemptsMade: 1 }), err);

    const logged = JSON.stringify([...errorSpy.mock.calls, ...warnSpy.mock.calls]);
    expect(logged).not.toContain('sk-live-secret');
    expect(logged).not.toContain('+15555550100');
    expect(logged).not.toContain('refresh-secret');
    expect(errorSpy.mock.calls[0][0].err).toEqual({
      type: 'AxiosError',
      message: 'Request failed with status code 502',
      stack: err.stack,
      code: 'ERR_BAD_RESPONSE',
      status: 502,
    });
  });

  it('reads the tenant from a system cron job as "system"', () => {
    reportJobFailure(logger, makeJob({ data: { tenantId: 'system' }, attemptsMade: 3 }), new Error('x'));

    expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'system' }));
  });
});

describe('CronRun', () => {
  const logger = new Logger('TestCron');
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(logger, 'log').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('logs one cron.completed line with the tenant counts and duration', () => {
    const run = new CronRun(logger, 'data-retention');
    run.succeeded();
    run.succeeded();
    run.failed(7, new Error('tenant 7 broke'));

    const summary = run.complete({ rowsDeleted: 1 });

    expect(summary).toEqual({ tenantsOk: 2, tenantsFailed: 1, durationMs: expect.any(Number) });
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: JOB_EVENTS.CRON_COMPLETED,
        jobName: 'data-retention',
        tenantsOk: 2,
        tenantsFailed: 1,
        durationMs: expect.any(Number),
        rowsDeleted: 1,
      }),
    );
  });

  it('logs each failed tenant with its ids and a loggable error', () => {
    const err = new Error('tenant 7 broke');

    new CronRun(logger, 'trial-expiry').failed(7, err, 'acme');

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        jobName: 'trial-expiry',
        tenantDbId: '7',
        tenantId: 'acme',
        err: { type: 'Error', message: 'tenant 7 broke', stack: err.stack },
      }),
    );
  });

  it('extra fields cannot overwrite the counts the alert reads', () => {
    const run = new CronRun(logger, 'data-retention');

    run.complete({ tenantsFailed: 99 });

    expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({ tenantsFailed: 0 }));
  });
});

describe('toLoggableError', () => {
  it('keeps the name, message, stack, code and HTTP status only', () => {
    const err = Object.assign(new Error('nope'), { code: 'P2002', status: 409, meta: { target: ['email'] } });

    expect(toLoggableError(err)).toEqual({
      type: 'Error',
      message: 'nope',
      stack: err.stack,
      code: 'P2002',
      status: 409,
    });
  });

  it('describes a thrown non-Error value without throwing', () => {
    expect(toLoggableError('plain string')).toEqual({ type: 'string', message: 'plain string' });
  });
});

describe('error tracking (docs/standards/observability.md, rule 10)', () => {
  let reportSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    reportSpy = jest.spyOn(errorTracking, 'reportError').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('reports a final job failure once, tagged with the job identity and source job', () => {
    const err = new Error('boom');

    reportJobFailure(new Logger('X'), makeJob({ attemptsMade: 3 }), err);

    expect(reportSpy).toHaveBeenCalledTimes(1);
    expect(reportSpy).toHaveBeenCalledWith(err, {
      tenantId: '4',
      jobName: 'vendor-sync',
      jobId: 'bull-9',
      queue: 'bulk-ops',
      source: 'job',
    });
  });

  it('does not report an attempt BullMQ will retry', () => {
    reportJobFailure(new Logger('X'), makeJob({ attemptsMade: 1 }), new Error('retry me'));

    expect(reportSpy).not.toHaveBeenCalled();
  });

  it('reports each failed cron tenant with source cron and both tenant ids', () => {
    const err = new Error('tenant broke');
    const run = new CronRun(new Logger('X'), 'data-retention');

    run.failed(7, err, 'acme');

    expect(reportSpy).toHaveBeenCalledWith(err, {
      tenantId: 'acme',
      tenantDbId: 7,
      jobName: 'data-retention',
      source: 'cron',
    });
  });
});

describe('metrics (docs/standards/observability.md, rule 9)', () => {
  let harness: InMemoryMetrics;

  beforeEach(() => {
    resetTenantLabelsForTesting();
    harness = InMemoryMetrics.install();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(errorTracking, 'reportError').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await harness.uninstall();
  });

  it('counts every failed attempt in app_job_failed, retries and the final one apart', async () => {
    reportJobFailure(new Logger('X'), makeJob({ attemptsMade: 1 }), new Error('retry me'));
    reportJobFailure(new Logger('X'), makeJob({ attemptsMade: 3 }), new Error('gone'));

    const points = await harness.points('app_job_failed');
    expect(points.map((p) => p.attributes).sort((a, b) => String(a.final).localeCompare(String(b.final)))).toEqual([
      { queue: 'bulk-ops', job_name: 'vendor-sync', final: 'false', tenant: '4' },
      { queue: 'bulk-ops', job_name: 'vendor-sync', final: 'true', tenant: '4' },
    ]);
  });

  it('stamps the cron success time when the run completes', async () => {
    const run = new CronRun(new Logger('X'), 'data-retention');
    run.succeeded();

    run.complete();

    const [point] = await harness.points('app_cron_last_success_timestamp_seconds');
    expect(point.attributes).toEqual({ job_name: 'data-retention' });
    expect(point.value).toBeGreaterThan(Date.now() / 1000 - 60);
  });

  it('stamps a run with no tenants and a partly failed run, but not one where every tenant failed', async () => {
    new CronRun(new Logger('X'), 'job-cleanup').complete();
    const partly = new CronRun(new Logger('X'), 'trial-expiry');
    partly.succeeded();
    partly.failed(1, new Error('x'));
    partly.complete();
    const allFailed = new CronRun(new Logger('X'), 'ai-credential-revalidate');
    allFailed.failed(1, new Error('x'));
    allFailed.complete();

    const stamped = (await harness.points('app_cron_last_success_timestamp_seconds')).map((p) => p.attributes.job_name);
    expect(stamped.sort()).toEqual(['job-cleanup', 'trial-expiry']);
  });
});

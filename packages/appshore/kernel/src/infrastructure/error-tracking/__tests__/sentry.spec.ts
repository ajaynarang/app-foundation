import * as Sentry from '@sentry/nestjs';
import { trace } from '@opentelemetry/api';
import {
  ERROR_SOURCE,
  SENTRY_DATA_COLLECTION,
  buildSentryOptions,
  currentErrorTags,
  initSentry,
  reportError,
  reportServerError,
} from '../sentry';
import { requestContextStorage, type RequestContext } from '../../logging/request-context.middleware';

jest.mock('@sentry/nestjs', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  isInitialized: jest.fn(() => true),
}));

const mockInit = Sentry.init as jest.Mock;
const mockCapture = Sentry.captureException as jest.Mock;
const mockIsInitialized = Sentry.isInitialized as jest.Mock;

const DSN = 'https://k@o1.ingest.sentry.io/1';

describe('buildSentryOptions', () => {
  it('returns null when SENTRY_DSN is unset so Sentry stays off', () => {
    expect(buildSentryOptions({ ENV_TYPE: 'production' })).toBeNull();
  });

  it('returns null when SENTRY_DSN is blank', () => {
    expect(buildSentryOptions({ SENTRY_DSN: '   ', ENV_TYPE: 'production' })).toBeNull();
  });

  it('builds error-only options tagged with ENV_TYPE and data collection off', () => {
    const options = buildSentryOptions({ SENTRY_DSN: DSN, ENV_TYPE: 'production' });

    expect(options).toEqual(
      expect.objectContaining({
        dsn: DSN,
        environment: 'production',
        dataCollection: SENTRY_DATA_COLLECTION,
        enableOpenTelemetrySetup: false,
      }),
    );
    // Tracing stays with OpenTelemetry: Sentry's docs say to leave the sample rate unset when OTel owns spans.
    expect(options).not.toHaveProperty('tracesSampleRate');
  });

  it.each([
    ['production', 'production'],
    ['sandbox', 'staging'],
    ['preprod', 'staging'],
    ['development', 'development'],
  ])('maps ENV_TYPE %s to the shared environment %s', (envType, environment) => {
    expect(buildSentryOptions({ SENTRY_DSN: DSN, ENV_TYPE: envType })?.environment).toBe(environment);
  });

  it('passes the release through when SENTRY_RELEASE is set', () => {
    expect(buildSentryOptions({ SENTRY_DSN: DSN, SENTRY_RELEASE: 'abc123' })?.release).toBe('abc123');
  });

  it('falls back to development when ENV_TYPE is invalid rather than crashing the import', () => {
    expect(buildSentryOptions({ SENTRY_DSN: DSN, ENV_TYPE: 'bogus' })?.environment).toBe('development');
    expect(buildSentryOptions({ SENTRY_DSN: DSN })?.environment).toBe('development');
  });
});

describe('SENTRY_DATA_COLLECTION', () => {
  it('turns off every payload-bearing category so no personal data leaves the process', () => {
    expect(SENTRY_DATA_COLLECTION).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    });
  });
});

describe('initSentry', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does not initialise Sentry without a DSN', () => {
    expect(initSentry({ ENV_TYPE: 'production' })).toBe(false);
    expect(mockInit).not.toHaveBeenCalled();
  });

  it('initialises Sentry with the built options when a DSN is set', () => {
    expect(initSentry({ SENTRY_DSN: DSN, ENV_TYPE: 'sandbox' })).toBe(true);
    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({ environment: 'staging', dataCollection: SENTRY_DATA_COLLECTION }),
    );
  });
});

describe('ERROR_SOURCE', () => {
  it('names the workflow engine generically, so the kernel survives a scaffold without Desk', () => {
    expect(Object.values(ERROR_SOURCE).sort()).toEqual(['ai', 'cron', 'event', 'http', 'job', 'workflow']);
  });
});

describe('reportServerError', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsInitialized.mockReturnValue(true);
  });

  it('reports 5xx errors tagged as an HTTP failure', () => {
    const error = new Error('boom');

    reportServerError(error, 500);

    expect(mockCapture).toHaveBeenCalledWith(error, { tags: { source: ERROR_SOURCE.HTTP } });
  });

  it('reports 503 errors', () => {
    reportServerError(new Error('down'), 503);

    expect(mockCapture).toHaveBeenCalledTimes(1);
  });

  it("carries the request's tenant, role and requestId", () => {
    const ctx: RequestContext = { requestId: 'req-1', tenantId: 'acme', userId: '9', role: 'ADMIN' };

    requestContextStorage.run(ctx, () => reportServerError(new Error('boom'), 502));

    expect(mockCapture.mock.calls[0][1].tags).toEqual({
      source: 'http',
      requestId: 'req-1',
      tenantId: 'acme',
      role: 'ADMIN',
    });
  });

  it.each([400, 401, 403, 404, 409, 422, 429])('does not report %i client errors', (status) => {
    reportServerError(new Error('client'), status);

    expect(mockCapture).not.toHaveBeenCalled();
  });
});

describe('reportError', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsInitialized.mockReturnValue(true);
  });

  it('is a no-op when Sentry is not initialised (SENTRY_DSN unset)', () => {
    mockIsInitialized.mockReturnValue(false);

    reportError(new Error('boom'), { jobName: 'audit' });

    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('tags a job failure with the job context and lets explicit tags win', () => {
    const ctx: RequestContext = { requestId: '77', tenantId: '4', jobName: 'audit', jobId: '77' };
    const error = new Error('job blew up');

    requestContextStorage.run(ctx, () =>
      reportError(error, { tenantId: 9, queue: 'bulk-ops', source: ERROR_SOURCE.JOB }),
    );

    expect(mockCapture).toHaveBeenCalledWith(error, {
      tags: { tenantDbId: '9', jobName: 'audit', jobId: '77', requestId: '77', queue: 'bulk-ops', source: 'job' },
    });
  });

  it('passes a severity level through when one is given', () => {
    reportError(new Error('reuse'), {}, { level: 'warning' });

    expect(mockCapture.mock.calls[0][1]).toEqual({ tags: {}, level: 'warning' });
  });

  it('tags a numeric tenant as tenantDbId and keeps tenantId for the public id', () => {
    reportError(new Error('a'), { tenantId: 7 });
    reportError(new Error('b'), { tenantId: '7' });
    reportError(new Error('c'), { tenantId: 'acme', tenantDbId: 7 });

    expect(mockCapture.mock.calls.map(([, opts]) => opts.tags)).toEqual([
      { tenantDbId: '7' },
      { tenantDbId: '7' },
      { tenantId: 'acme', tenantDbId: '7' },
    ]);
  });

  it("carries the request's public id and database key from the ambient context", () => {
    const ctx: RequestContext = { requestId: 'r', tenantId: 'acme', tenantDbId: '7' };

    requestContextStorage.run(ctx, () => reportError(new Error('x')));

    expect(mockCapture.mock.calls[0][1].tags).toEqual({ requestId: 'r', tenantId: 'acme', tenantDbId: '7' });
  });

  it("drops the 'system' pseudo-tenant that cron jobs carry", () => {
    requestContextStorage.run({ requestId: 's', tenantId: 'system' }, () => reportError(new Error('x')));

    expect(mockCapture.mock.calls[0][1].tags).toEqual({ requestId: 's' });
  });

  it('an explicit tenant replaces both ambient tenant tags, never mixing two tenants', () => {
    const ctx: RequestContext = { requestId: 'r', tenantId: 'acme', tenantDbId: '7' };

    requestContextStorage.run(ctx, () => reportError(new Error('x'), { tenantId: 9 }));

    expect(mockCapture.mock.calls[0][1].tags).toEqual({ requestId: 'r', tenantDbId: '9' });
  });

  it('never tags the userId (an id, but not an allowed tag)', () => {
    requestContextStorage.run({ requestId: 'r', userId: '12' }, () => reportError(new Error('x')));

    expect(mockCapture.mock.calls[0][1].tags).not.toHaveProperty('userId');
  });

  it('truncates a tag value to the 200 characters Sentry accepts', () => {
    reportError(new Error('x'), { jobName: 'j'.repeat(250) });

    expect(mockCapture.mock.calls[0][1].tags.jobName).toHaveLength(200);
  });
});

describe('currentErrorTags', () => {
  it('reads the traceId of the active span', () => {
    const span = trace.wrapSpanContext({ traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), traceFlags: 1 });
    const spy = jest.spyOn(trace, 'getActiveSpan').mockReturnValue(span);

    const tags = currentErrorTags();
    spy.mockRestore();

    expect(tags.traceId).toBe('a'.repeat(32));
  });

  it('returns no ids outside a request or job', () => {
    expect(currentErrorTags()).toEqual({
      tenantId: undefined,
      tenantDbId: undefined,
      role: undefined,
      jobName: undefined,
      jobId: undefined,
      requestId: undefined,
      traceId: undefined,
    });
  });
});

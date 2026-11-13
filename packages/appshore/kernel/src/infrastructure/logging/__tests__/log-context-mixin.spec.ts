import { trace } from '@opentelemetry/api';
import { logContextMixin } from '../log-context-mixin';
import { requestContextStorage } from '../request-context.middleware';

describe('logContextMixin', () => {
  afterEach(() => jest.restoreAllMocks());

  it('adds nothing outside a request or job', () => {
    expect(logContextMixin()).toEqual({});
  });

  it('carries the request id and, once auth has run, tenant, tenantDbId, user and role', () => {
    const fields = requestContextStorage.run(
      { requestId: 'req-1', tenantId: 'tnt-1', tenantDbId: '7', userId: 'usr_1', role: 'OWNER' },
      () => logContextMixin(),
    );

    expect(fields).toEqual({ requestId: 'req-1', tenantId: 'tnt-1', tenantDbId: '7', userId: 'usr_1', role: 'OWNER' });
  });

  it('carries jobName and jobId inside a job', () => {
    const fields = requestContextStorage.run({ requestId: 'j-1', jobName: 'data-retention', jobId: 'j-1' }, () =>
      logContextMixin(),
    );

    expect(fields).toMatchObject({ jobName: 'data-retention', jobId: 'j-1' });
  });

  it('leaves empty fields out (a session with no tenant)', () => {
    const fields = requestContextStorage.run({ requestId: 'req-1', tenantId: '', userId: 'usr_1' }, () =>
      logContextMixin(),
    );

    expect(fields).toEqual({ requestId: 'req-1', userId: 'usr_1' });
  });

  it('adds the active traceId and spanId', () => {
    jest.spyOn(trace, 'getActiveSpan').mockReturnValue({
      spanContext: () => ({ traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), traceFlags: 1 }),
    } as any);

    expect(logContextMixin()).toEqual({ traceId: 'a'.repeat(32), spanId: 'b'.repeat(16) });
  });
});

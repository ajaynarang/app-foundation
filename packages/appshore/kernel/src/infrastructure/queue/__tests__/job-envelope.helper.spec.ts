import { buildJobEnvelope } from '../job-envelope.helper';
import { requestContextStorage } from '../../logging/request-context.middleware';

describe('buildJobEnvelope', () => {
  it('builds an envelope with payload and metadata', () => {
    const env = buildJobEnvelope({ foo: 1 }, { tenantId: 'demo', source: 'api', correlationId: 'corr-1' });
    expect(env.tenantId).toBe('demo');
    expect(env.correlationId).toBe('corr-1');
    expect(env.payload).toEqual({ foo: 1 });
    expect(env.metadata.source).toBe('api');
    expect(env.metadata.version).toBe(1);
    expect(env.metadata.enqueuedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('pulls correlationId from request context if not provided', () => {
    requestContextStorage.run({ requestId: 'req-9', tenantId: 'demo', userId: 'u-1' }, () => {
      const env = buildJobEnvelope({}, { tenantId: 'demo', source: 'api' });
      expect(env.correlationId).toBe('req-9');
    });
  });

  it('falls back to a generated uuid if no context and no override', () => {
    const env = buildJobEnvelope({}, { tenantId: 'demo', source: 'cron' });
    expect(env.correlationId).toMatch(/^[0-9a-f-]{36}$/);
  });
});

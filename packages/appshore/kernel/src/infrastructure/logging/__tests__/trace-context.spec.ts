import { trace } from '@opentelemetry/api';
import { getActiveTraceContext } from '../trace-context';

describe('getActiveTraceContext', () => {
  const originalGetActiveSpan = trace.getActiveSpan;

  afterEach(() => {
    (trace as any).getActiveSpan = originalGetActiveSpan;
  });

  it('returns empty object when no span is active', () => {
    (trace as any).getActiveSpan = () => undefined;

    expect(getActiveTraceContext()).toEqual({});
  });

  it('returns traceId and spanId when a span is active', () => {
    (trace as any).getActiveSpan = () => ({
      spanContext: () => ({
        traceId: 'abc123',
        spanId: 'def456',
        traceFlags: 1,
      }),
    });

    expect(getActiveTraceContext()).toEqual({
      traceId: 'abc123',
      spanId: 'def456',
    });
  });

  it('returns empty object when spanContext has no traceId', () => {
    (trace as any).getActiveSpan = () => ({
      spanContext: () => ({ traceId: '', spanId: '', traceFlags: 0 }),
    });

    expect(getActiveTraceContext()).toEqual({});
  });

  it('returns empty object when the OTel API throws', () => {
    (trace as any).getActiveSpan = () => {
      throw new Error('OTel not initialized');
    };

    expect(getActiveTraceContext()).toEqual({});
  });

  it('returns empty object when spanContext is missing', () => {
    (trace as any).getActiveSpan = () => ({
      spanContext: () => undefined,
    });

    expect(getActiveTraceContext()).toEqual({});
  });
});

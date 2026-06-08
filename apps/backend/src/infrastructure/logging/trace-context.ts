import { trace } from '@opentelemetry/api';

/**
 * Read the currently active OpenTelemetry span and return its traceId/spanId.
 * Returns `{}` when no span is active (e.g. a log emitted outside any request
 * or job) so callers can spread the result safely into log fields.
 */
export function getActiveTraceContext(): {
  traceId?: string;
  spanId?: string;
} {
  try {
    const span = trace.getActiveSpan();
    if (!span) return {};
    const ctx = span.spanContext();
    if (!ctx?.traceId) return {};
    return { traceId: ctx.traceId, spanId: ctx.spanId };
  } catch {
    return {};
  }
}

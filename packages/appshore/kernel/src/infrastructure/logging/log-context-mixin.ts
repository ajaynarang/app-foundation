import { requestContextStorage } from './request-context.middleware';
import { getActiveTraceContext } from './trace-context';
import { rlsLogFields } from '../rls/rls-log-fields';

/** The context fields every log line may carry, in the order they are written. */
const CONTEXT_FIELDS = ['requestId', 'tenantId', 'tenantDbId', 'userId', 'role', 'jobName', 'jobId'] as const;

/**
 * The pino mixin: adds the request or job context, the active trace and the tenant context to every line, so code never passes them by
 * hand (docs/standards/observability.md, rule 2). Empty fields are left out: a SUPER_ADMIN session has no tenant, and
 * a line outside a request or job has no trace.
 */
export function logContextMixin(): Record<string, string> {
  const ctx = requestContextStorage.getStore();
  const fields: Record<string, string> = {};
  if (ctx) {
    for (const key of CONTEXT_FIELDS) {
      const value = ctx[key];
      if (value) fields[key] = value;
    }
  }
  const trace = getActiveTraceContext();
  if (trace.traceId) fields.traceId = trace.traceId;
  if (trace.spanId) fields.spanId = trace.spanId;
  // The tenant context the line runs in (`rls.kind`, `rls.tenant`, `rls.source`, `rls.reason`); nothing outside one.
  return { ...fields, ...rlsLogFields() };
}

import { randomUUID } from 'crypto';
import type { JobEnvelope } from '@app/shared-types';
import { requestContextStorage } from '../logging/request-context.middleware';

interface BuildOpts {
  tenantId: string;
  source: JobEnvelope['metadata']['source'];
  correlationId?: string;
  causationId?: string;
  userId?: string;
}

/**
 * Wrap a job payload in the standard `JobEnvelope`.
 *
 * - `correlationId` is taken from the explicit override first, then the
 *   active `requestContextStorage` (so jobs enqueued from inside an HTTP
 *   request inherit the request id), and finally falls back to a fresh UUID
 *   for jobs enqueued outside any request (cron, event, replay).
 * - `userId` similarly inherits from the request context when not provided.
 */
export function buildJobEnvelope<P>(payload: P, opts: BuildOpts): JobEnvelope<P> {
  const ctx = requestContextStorage.getStore();
  return {
    tenantId: opts.tenantId,
    correlationId: opts.correlationId ?? ctx?.requestId ?? randomUUID(),
    causationId: opts.causationId,
    userId: opts.userId ?? ctx?.userId,
    payload,
    metadata: {
      enqueuedAt: new Date().toISOString(),
      source: opts.source,
      version: 1,
    },
  };
}

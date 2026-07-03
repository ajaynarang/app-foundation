import type { Job } from 'bullmq';
import { requestContextStorage, type RequestContext } from './request-context.middleware';

/**
 * Run a BullMQ processor body inside a request-context scope so every log
 * line the processor emits carries `jobName`, `jobId`, `tenantId`, and
 * `requestId` without each processor having to pass them manually.
 *
 * Usage:
 *   async process(job: Job<MyData>) {
 *     return withJobLogContext(job, async () => this.handle(job));
 *   }
 *
 * The tenantId is read from `job.data.tenantId` if present. Jobs that don't
 * carry a tenant (e.g. system-wide scans) simply log without it.
 */
export function withJobLogContext<T>(
  job: Job<{ tenantId?: string | number } | undefined>,
  fn: () => Promise<T>,
): Promise<T> {
  const existing = requestContextStorage.getStore();
  const tenantFromJob =
    job.data && typeof job.data === 'object' && 'tenantId' in job.data ? job.data.tenantId : undefined;

  const ctx: RequestContext = {
    // Prefer the upstream request id if a job was dispatched from an HTTP
    // handler; otherwise use the job id so logs for one job still correlate.
    requestId: existing?.requestId ?? String(job.id ?? 'job'),
    tenantId: existing?.tenantId ?? (tenantFromJob != null ? String(tenantFromJob) : undefined),
    userId: existing?.userId,
    jobName: job.name,
    jobId: job.id != null ? String(job.id) : undefined,
  };

  return requestContextStorage.run(ctx, fn);
}

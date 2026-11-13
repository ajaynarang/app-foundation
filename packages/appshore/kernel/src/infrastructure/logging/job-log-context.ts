import type { Job } from 'bullmq';
import { requestContextStorage, type RequestContext } from './request-context.middleware';

/** The `tenantId` that cron and global jobs carry instead of a real tenant. */
export const SYSTEM_JOB_TENANT = 'system';

type JobData = { tenantId?: string | number; tenantDbId?: number } | undefined;

export interface JobTenant {
  /** Numeric tenant DB id the job belongs to, when the payload names one. */
  tenantDbId?: number;
  /** Raw `tenantId` for the log context (public id, numeric string, or 'system'). */
  logTenantId?: string;
}

const NUMERIC_ID = /^[1-9]\d*$/;

function isTenantDbId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/** A positive integer, or its canonical decimal string. Anything else (a public id, 'system', '07', 0) is not one. */
function toTenantDbId(raw: unknown): number | undefined {
  if (isTenantDbId(raw)) return raw;
  if (typeof raw === 'string' && NUMERIC_ID.test(raw)) {
    const id = Number(raw);
    return isTenantDbId(id) ? id : undefined;
  }
  return undefined;
}

/**
 * Which tenant a job belongs to, from its payload. The envelope's numeric `tenantDbId` wins; a numeric `tenantId`
 * (number or numeric string) also counts. When the two disagree the job names no numeric tenant. A public string id
 * stays as the log tenant only. Item 19 (tenant context) builds its job scope on this.
 */
export function resolveJobTenant(job: Job<JobData>): JobTenant {
  const data = job.data && typeof job.data === 'object' ? job.data : undefined;
  const rawTenantId = data?.tenantId;
  const logTenantId = rawTenantId != null ? String(rawTenantId) : undefined;

  const fromTenantId = toTenantDbId(rawTenantId);
  const fromDbId = isTenantDbId(data?.tenantDbId) ? data?.tenantDbId : undefined;

  if (fromDbId !== undefined && fromTenantId !== undefined && fromDbId !== fromTenantId) {
    return { logTenantId };
  }
  return { tenantDbId: fromDbId ?? fromTenantId, logTenantId };
}

/**
 * Run a BullMQ job body inside the log context, so every line it writes carries `jobName`, `jobId`, `tenantId` (and
 * `tenantDbId` when the payload names one) and `requestId`, without the processor passing them by hand.
 * `BaseQueueDispatcher` already wraps every job it dispatches; a processor that owns its own queue wraps itself.
 *
 *   async process(job: Job<MyData>) {
 *     return withJobContext(job, async () => this.handle(job));
 *   }
 *
 * The job's own tenant wins over an enclosing request's, so a log line reports what the job actually runs for.
 */
export function withJobContext<T>(job: Job<JobData>, fn: () => Promise<T>): Promise<T> {
  const existing = requestContextStorage.getStore();
  const { tenantDbId, logTenantId } = resolveJobTenant(job);

  const ctx: RequestContext = {
    // Prefer the upstream request id if a job was dispatched from an HTTP
    // handler; otherwise use the job id so logs for one job still correlate.
    requestId: existing?.requestId ?? String(job.id ?? 'job'),
    tenantId: logTenantId ?? existing?.tenantId,
    tenantDbId: tenantDbId !== undefined ? String(tenantDbId) : logTenantId ? undefined : existing?.tenantDbId,
    userId: existing?.userId,
    jobName: job.name,
    jobId: job.id != null ? String(job.id) : undefined,
  };

  return requestContextStorage.run(ctx, fn);
}

/**
 * @deprecated Renamed to `withJobContext`. Kept for one release so products scaffolded before the rename still
 * compile (docs/upgrade-notes/operations.md).
 */
export const withJobLogContext = withJobContext;

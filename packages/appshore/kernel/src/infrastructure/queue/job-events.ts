import type { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { resolveJobTenant } from '../logging/job-log-context';

/**
 * Structured `event` values that alert rules key on (docs/standards/observability.md, rule 6). Renaming one silently
 * breaks a rule, so they live here, once.
 */
export const JOB_EVENTS = {
  JOB_FAILED: 'job.failed',
  JOB_UNKNOWN: 'job.unknown',
  JOB_DEAD_LETTER: 'job.dead_letter',
  CRON_COMPLETED: 'cron.completed',
  OPS_HEARTBEAT: 'ops.heartbeat',
} as const;

export type JobEvent = (typeof JOB_EVENTS)[keyof typeof JOB_EVENTS];

/** What a log line may carry about an error. */
export interface LoggableError {
  type: string;
  message: string;
  stack?: string;
  code?: string | number;
  status?: number;
}

/**
 * The fields of an error that are safe to log. pino's `err` serializer copies every enumerable property, so a raw
 * HTTP-client error would put `config.headers.Authorization` and the request body on the log line, and the redact
 * paths only match one level deep. Pass this, never the raw error, as `err` (rule 4).
 */
export function toLoggableError(err: unknown): LoggableError {
  if (!(err instanceof Error)) return { type: typeof err, message: String(err) };
  const source = err as Error & { code?: unknown; status?: unknown; response?: { status?: unknown } };
  const out: LoggableError = { type: err.name || 'Error', message: err.message };
  if (err.stack) out.stack = err.stack;
  if (typeof source.code === 'string' || typeof source.code === 'number') out.code = source.code;
  const status = typeof source.status === 'number' ? source.status : source.response?.status;
  if (typeof status === 'number') out.status = status;
  return out;
}

/** BullMQ's own default when a job is added without `attempts`. */
const BULLMQ_DEFAULT_ATTEMPTS = 1;

/**
 * Whether this failure is the last one BullMQ will record for the job. BullMQ stamps `finishedOn` only when it moves
 * a job to `failed` for good, which also covers `UnrecoverableError` and discarded jobs that fail before using up
 * their attempts. The attempt count is the fallback for job objects that carry no timestamp.
 */
export function isFinalFailure(job: Job, defaultAttempts = BULLMQ_DEFAULT_ATTEMPTS): boolean {
  if (typeof job.finishedOn === 'number' && job.finishedOn > 0) return true;
  const maxAttempts = job.opts?.attempts ?? defaultAttempts;
  return (job.attemptsMade ?? 0) >= maxAttempts;
}

/**
 * One structured line per failed attempt, carrying the job identity explicitly: BullMQ's `failed` listener runs
 * outside the job's log context, so the pino mixin cannot add jobName/jobId/tenantId there (the one exception rule 2
 * allows). A retry BullMQ will run again is a warning; the final failure is an error. Returns whether it was final.
 */
export function reportJobFailure(
  logger: Logger,
  job: Job,
  err: Error,
  defaultAttempts = BULLMQ_DEFAULT_ATTEMPTS,
): boolean {
  const final = isFinalFailure(job, defaultAttempts);
  const tenantId = resolveJobTenant(job).logTenantId;
  const jobId = job.id != null ? String(job.id) : undefined;
  const fields = {
    event: JOB_EVENTS.JOB_FAILED,
    jobName: job.name,
    jobId,
    queue: job.queueName,
    tenantId,
    attempt: job.attemptsMade ?? 0,
    final,
    err: toLoggableError(err),
  };
  const msg = `Job ${job.name} (id=${jobId ?? 'unknown'}) on ${job.queueName ?? 'unknown'} failed${final ? ' permanently' : ''}`;
  if (final) logger.error({ msg, ...fields });
  else logger.warn({ msg, ...fields });
  return final;
}

/**
 * Tracks one scheduled run of a cron, or of a sweep over tenants. Count each tenant as it finishes, then call
 * `complete()` once at the end: the `cron.completed` line is what a "cron missed" rule waits for, and a non-zero
 * `tenantsFailed` is what a "cron partly failed" rule counts. A sweep keeps its warn-and-continue loop; `failed()`
 * writes the per-tenant line.
 */
export class CronRun {
  private readonly startedAt = Date.now();
  private tenantsOk = 0;
  private tenantsFailed = 0;

  constructor(
    private readonly logger: Logger,
    readonly jobName: string,
  ) {}

  succeeded(): void {
    this.tenantsOk += 1;
  }

  /** Count one tenant's failure. Pass the numeric DB id, and the public id when the sweep has one. */
  failed(tenantDbId: number, err: unknown, tenantId?: string): void {
    this.tenantsFailed += 1;
    this.logger.warn({
      msg: `Cron ${this.jobName} failed for tenant ${tenantDbId}`,
      jobName: this.jobName,
      tenantDbId: String(tenantDbId),
      ...(tenantId ? { tenantId } : {}),
      err: toLoggableError(err),
    });
  }

  complete(extra: Record<string, unknown> = {}): { tenantsOk: number; tenantsFailed: number; durationMs: number } {
    const summary = {
      tenantsOk: this.tenantsOk,
      tenantsFailed: this.tenantsFailed,
      durationMs: Date.now() - this.startedAt,
    };
    this.logger.log({
      msg: `Cron ${this.jobName} completed: ${summary.tenantsOk} ok, ${summary.tenantsFailed} failed in ${summary.durationMs}ms`,
      event: JOB_EVENTS.CRON_COMPLETED,
      jobName: this.jobName,
      ...extra,
      ...summary,
    });
    return summary;
  }
}

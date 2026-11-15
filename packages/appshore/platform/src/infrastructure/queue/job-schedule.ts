import type { Queue } from 'bullmq';
import { buildJobEnvelope } from '@appshore/kernel/infrastructure/queue/job-envelope.helper';
import { SYSTEM_JOB_TENANT } from '@appshore/kernel/infrastructure/logging/job-log-context';

/** The `job_schedules` columns that decide a repeatable. */
export interface JobScheduleRow {
  category: string;
  jobType: string;
  scheduleType: string;
  pattern: string | null;
  intervalMs: number | null;
  isEnabled: boolean;
}

export type JobScheduleOutcome = 'scheduled' | 'unchanged' | 'removed';

const DAY_SECONDS = 86_400;

/**
 * Make the repeatables BullMQ holds for `row.jobType` match the row: none when the row is disabled, exactly one with
 * the row's cron pattern or interval when it is enabled. Idempotent, so the API and the worker can both apply the
 * same row at boot: a repeatable that already matches is left alone, so neither process resets the other's schedule.
 * The job carries a system envelope (`tenantId: 'system'`, source `cron`).
 */
export async function applyJobSchedule(queue: Queue, row: JobScheduleRow): Promise<JobScheduleOutcome> {
  const existing = (await queue.getRepeatableJobs()).filter((repeatable) => repeatable.name === row.jobType);
  const isCron = row.scheduleType === 'cron';

  if (row.isEnabled) {
    const matches =
      existing.length === 1 &&
      (isCron ? existing[0].pattern === row.pattern : Number(existing[0].every) === Number(row.intervalMs));
    if (matches) return 'unchanged';
  }

  for (const repeatable of existing) await queue.removeRepeatableByKey(repeatable.key);
  if (!row.isEnabled) return 'removed';

  await queue.add(row.jobType, buildJobEnvelope({}, { tenantId: SYSTEM_JOB_TENANT, source: 'cron' }), {
    repeat: isCron ? { pattern: row.pattern ?? undefined } : { every: row.intervalMs ?? undefined },
    jobId: `${row.category}-${row.jobType}`,
    attempts: 1,
    removeOnComplete: { count: 10 },
    removeOnFail: { age: DAY_SECONDS },
  });
  return 'scheduled';
}

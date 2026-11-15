import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { BULK_OPS_JOB_NAMES, NOTIFICATIONS_JOB_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import { toLoggableError } from '@appshore/kernel/infrastructure/queue/job-events';
import { ScheduleManagerService } from './schedule-manager.service';

export interface FoundationJobSchedule {
  category: string;
  jobType: string;
  /** Daily cron pattern, UTC. Staggered so no two hold the one-at-a-time `bulk-ops` lane together. */
  pattern: string;
}

/**
 * The foundation's own crons and their default schedules. The migration `foundation_job_schedules` inserts exactly
 * these rows (with `ON CONFLICT DO NOTHING`, so a product's own row wins) and the `09-job-schedules` seed upserts
 * them the same way; `foundation-schedules.spec.ts` holds the three to one list and every job to a registered
 * handler. An admin retunes or disables a row on the Schedules screen; nothing here overrides that.
 */
export const FOUNDATION_JOB_SCHEDULES: readonly FoundationJobSchedule[] = [
  { category: 'maintenance', jobType: BULK_OPS_JOB_NAMES.TRIAL_EXPIRY, pattern: '15 0 * * *' },
  { category: 'maintenance', jobType: BULK_OPS_JOB_NAMES.JOB_CLEANUP, pattern: '0 3 * * *' },
  { category: 'maintenance', jobType: BULK_OPS_JOB_NAMES.DATA_RETENTION, pattern: '0 4 * * *' },
  { category: 'maintenance', jobType: BULK_OPS_JOB_NAMES.LOGIN_EVENTS_CLEANUP, pattern: '30 4 * * *' },
  { category: 'maintenance', jobType: BULK_OPS_JOB_NAMES.TOKENS_CLEANUP, pattern: '0 5 * * *' },
  { category: 'notifications', jobType: NOTIFICATIONS_JOB_NAMES.CLEANUP, pattern: '30 5 * * *' },
];

/**
 * At boot, makes BullMQ hold what each foundation cron's `job_schedules` row says (`ScheduleManagerService`), in the
 * API and the worker alike: the step is idempotent, so neither resets the other. A row that is missing changes
 * nothing and a disabled row removes the repeatable. A failure (Redis down at boot) is logged and the boot goes on;
 * the next boot, or saving the row on the Schedules screen, applies it.
 */
@Injectable()
export class FoundationSchedulesRegistrar implements OnApplicationBootstrap {
  private readonly logger = new Logger(FoundationSchedulesRegistrar.name);

  constructor(private readonly schedules: ScheduleManagerService) {}

  async onApplicationBootstrap(): Promise<void> {
    for (const { category, jobType } of FOUNDATION_JOB_SCHEDULES) {
      try {
        await this.schedules.reloadSchedule(category, jobType);
      } catch (err) {
        this.logger.error({ msg: `Could not apply the ${category}/${jobType} schedule`, err: toLoggableError(err) });
      }
    }
  }
}

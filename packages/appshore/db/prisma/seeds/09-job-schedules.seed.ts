import { PrismaClient } from '../../generated/client';

/**
 * The foundation crons' default `job_schedules` rows, the same rows migration `20261113233000_foundation_job_schedules`
 * inserts. A row that exists is left exactly as it is: an admin may have retuned or disabled it on the Schedules
 * screen. `foundation-schedules.spec.ts` (backend architecture) holds this list, the migration and the platform's
 * `FOUNDATION_JOB_SCHEDULES` to one set. Daily patterns are UTC, staggered so no two hold the `bulk-ops` lane at once.
 */
export const FOUNDATION_JOB_SCHEDULE_ROWS = [
  { category: 'maintenance', jobType: 'trial-expiry', pattern: '15 0 * * *' },
  { category: 'maintenance', jobType: 'job-cleanup', pattern: '0 3 * * *' },
  { category: 'maintenance', jobType: 'data-retention', pattern: '0 4 * * *' },
  { category: 'maintenance', jobType: 'login-events-cleanup', pattern: '30 4 * * *' },
  { category: 'maintenance', jobType: 'tokens-cleanup', pattern: '0 5 * * *' },
  { category: 'notifications', jobType: 'cleanup', pattern: '30 5 * * *' },
] as const;

export const seed = {
  name: 'Job Schedules',
  description: `Creates the ${FOUNDATION_JOB_SCHEDULE_ROWS.length} foundation cron schedules when missing`,

  async run(prisma: PrismaClient): Promise<{ created: number; skipped: number }> {
    const { count } = await prisma.jobSchedule.createMany({
      data: FOUNDATION_JOB_SCHEDULE_ROWS.map((row) => ({ ...row, scheduleType: 'cron', isEnabled: true })),
      skipDuplicates: true,
    });
    return { created: count, skipped: FOUNDATION_JOB_SCHEDULE_ROWS.length - count };
  },
};

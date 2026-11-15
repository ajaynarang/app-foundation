import * as fs from 'fs';
import * as path from 'path';
import {
  BULK_OPS_JOB_NAMES,
  NOTIFICATIONS_JOB_NAMES,
  QUEUE_NAMES,
} from '@appshore/kernel/infrastructure/queue/queue.constants';
import { JOB_CATEGORIES } from '@appshore/kernel/infrastructure/queue/job.types';
import { jobHandlersToken, type QueueJobHandler } from '@appshore/kernel/infrastructure/queue/job-handler.contract';
import { FOUNDATION_JOB_SCHEDULES } from '@appshore/platform/infrastructure/queue/foundation-schedules';
import { FOUNDATION_JOB_SCHEDULE_ROWS } from '../../../../packages/appshore/db/prisma/seeds/09-job-schedules.seed';
import { BulkOpsQueueModule } from '../platform-glue/queue/dispatchers/bulk-ops-queue.module';
import { NotificationsQueueModule } from '../platform-glue/queue/dispatchers/notifications-queue.module';

/**
 * The foundation crons are real (project 4, item 10a): every one has a `job_schedules` row on a fresh database and on
 * an upgraded one, and every row names a job some dispatcher actually handles. Without this a `cron-missed` rule
 * would page for a job that never runs, or a row would schedule a name nothing claims (BaseQueueDispatcher would log
 * `job.unknown` once a day and do nothing).
 *
 * One list, three copies: the migration's INSERT, the `09-job-schedules` seed (the db package cannot import the
 * platform), and `FOUNDATION_JOB_SCHEDULES`, which the boot registrar applies.
 */
const MIGRATIONS = path.resolve(__dirname, '../../../../packages/appshore/db/prisma/migrations');
const MIGRATION = path.join(MIGRATIONS, '20261113233000_foundation_job_schedules/migration.sql');

type Row = { category: string; jobType: string; pattern: string };
const key = (row: Row) => `${row.category}/${row.jobType}@${row.pattern}`;

function migrationRows(): Row[] {
  const sql = fs.readFileSync(MIGRATION, 'utf8');
  return [...sql.matchAll(/\('([^']+)',\s*'([^']+)',\s*'cron',\s*'([^']+)',\s*NULL,\s*true,\s*NOW\(\)\)/g)].map(
    ([, category, jobType, pattern]) => ({ category, jobType, pattern }),
  );
}

/** Runs a dispatcher module's real handler factory with one bare instance per injected class. */
function handlersOf(module: object, queue: string): QueueJobHandler[] {
  const providers = (Reflect.getMetadata('providers', module) ?? []) as Array<{
    provide?: unknown;
    useFactory?: (...deps: unknown[]) => QueueJobHandler[];
    inject?: Array<new (...args: unknown[]) => unknown>;
  }>;
  const provider = providers.find((p) => p.provide === jobHandlersToken(queue));
  if (!provider?.useFactory) throw new Error(`No handler factory for ${queue}`);
  const deps = (provider.inject ?? []).map((Cls) => new Cls(...new Array(Cls.length).fill(undefined)));
  return provider.useFactory(...deps);
}

const claimedBy: Record<string, Set<string>> = {
  [QUEUE_NAMES.BULK_OPS]: new Set(handlersOf(BulkOpsQueueModule, QUEUE_NAMES.BULK_OPS).flatMap((h) => h.jobNames)),
  [QUEUE_NAMES.NOTIFICATIONS]: new Set(
    handlersOf(NotificationsQueueModule, QUEUE_NAMES.NOTIFICATIONS).flatMap((h) => h.jobNames),
  ),
};

describe('foundation crons are real', () => {
  it('the migration inserts the rows ON CONFLICT DO NOTHING, so a product row wins', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf8').replace(/^--.*$/gm, '');
    expect(sql).toMatch(/ON CONFLICT \("category", "job_type"\) DO NOTHING/);
    expect(sql).not.toMatch(/\b(UPDATE|DELETE|DROP|TRUNCATE)\b/i);
  });

  it('the migration, the seed and FOUNDATION_JOB_SCHEDULES list the same rows', () => {
    const fromMigration = migrationRows().map(key).sort();

    expect(fromMigration).toHaveLength(FOUNDATION_JOB_SCHEDULES.length);
    expect([...FOUNDATION_JOB_SCHEDULE_ROWS].map(key).sort()).toEqual(fromMigration);
    expect(FOUNDATION_JOB_SCHEDULES.map(key).sort()).toEqual(fromMigration);
  });

  it.each(FOUNDATION_JOB_SCHEDULES.map((s) => [`${s.category}/${s.jobType}`, s] as const))(
    '%s names a job its category queue has a registered handler for',
    (_label, schedule) => {
      const queue = JOB_CATEGORIES[schedule.category as keyof typeof JOB_CATEGORIES]?.queue;
      expect(queue).toBeDefined();
      expect(claimedBy[queue]?.has(schedule.jobType)).toBe(true);
    },
  );

  it.each([
    ...Object.values(BULK_OPS_JOB_NAMES).map((name) => [QUEUE_NAMES.BULK_OPS, name] as const),
    ...Object.values(NOTIFICATIONS_JOB_NAMES).map((name) => [QUEUE_NAMES.NOTIFICATIONS, name] as const),
  ])('foundation job %s/%s has a registered handler', (queue, name) => {
    expect(claimedBy[queue].has(name)).toBe(true);
  });

  it('uploads-cleanup is gone: it had no handler and the template has no uploads to clean', () => {
    expect(Object.values(BULK_OPS_JOB_NAMES)).not.toContain('uploads-cleanup');
  });
});

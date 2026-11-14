import * as fs from 'fs';
import * as path from 'path';
import { BULK_OPS_JOB_NAMES, NOTIFICATIONS_JOB_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import { FOUNDATION_JOB_SCHEDULES } from '@appshore/platform/infrastructure/queue/foundation-schedules';
import { CRON_INTERVAL_EXEMPT } from '@appshore/platform/infrastructure/queue/queue-metrics.reporter';
import { WHATSAPP_STALE_SWEEP_JOB_NAME } from '@appshore/platform/infrastructure/notifications/channels/whatsapp/whatsapp.constants';
import { listSourceFiles } from './source-text.scan';
import { APP_JOB_NAMES } from '../platform-glue/queue/job-names';

/**
 * Every repeatable of a minute or more wraps its run in `CronRun` (docs/standards/observability.md; project 4,
 * item 10). `CronRun.complete()` writes the `cron.completed` line and stamps `app_cron_last_success_timestamp_seconds`,
 * and the queue reporter publishes the repeatable's expected interval, so the one `cron-missed` rule covers it.
 * A repeatable that never completes a `CronRun` would read as missed forever.
 *
 * How it holds: every file that registers a BullMQ repeatable (`repeat:`) is listed in REGISTRARS with the job
 * names it registers, so a new registrar fails here until it is listed. Each name is then either sub-minute (no
 * `app_cron_*` series), exempt with a reason (`CRON_INTERVAL_EXEMPT`), or handled by a file that names the job and
 * calls `new CronRun(`.
 */
const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const ROOTS = ['apps/backend/src', 'packages/appshore/kernel/src', 'packages/appshore/platform/src'];
const PLATFORM = 'packages/appshore/platform/src';

/** File that registers repeatables → the job names it registers. */
const REGISTRARS: Record<string, string[]> = {
  // Every job_schedules row (the Schedules screen and the boot registrar), and the heartbeat's own row.
  [`${PLATFORM}/infrastructure/queue/job-schedule.ts`]: [
    ...FOUNDATION_JOB_SCHEDULES.map((s) => s.jobType),
    BULK_OPS_JOB_NAMES.OPS_HEARTBEAT,
  ],
  [`${PLATFORM}/infrastructure/deadlines/deadline-sweep.scheduler.ts`]: [BULK_OPS_JOB_NAMES.DEADLINE_SWEEP],
  [`${PLATFORM}/infrastructure/notifications/notifications.module.ts`]: [WHATSAPP_STALE_SWEEP_JOB_NAME],
  'apps/backend/src/platform-glue/events/outbox/outbox-relay.scheduler.ts': [BULK_OPS_JOB_NAMES.OUTBOX_RELAY],
  'apps/backend/src/domains/ai/routing/connect/ai-credential-revalidation.job.ts': [
    APP_JOB_NAMES.BULK_OPS.AI_CREDENTIAL_REVALIDATE,
  ],
  'apps/backend/src/domains/integrations/oauth/oauth-token-refresh.job.ts': [APP_JOB_NAMES.BULK_OPS.OAUTH_REFRESH],
  // Not imported by any module today; it would register job-cleanup, which data-retention.processor.ts wraps.
  'apps/backend/src/domains/integrations/sync/sync-queue.module.ts': [BULK_OPS_JOB_NAMES.JOB_CLEANUP],
};

/** Runs more often than once a minute: no `app_cron_*` series by design (the queue reporter skips it). */
const SUB_MINUTE: Record<string, string> = {
  [BULK_OPS_JOB_NAMES.OUTBOX_RELAY]: 'every 10 s; covered by app_outbox_oldest_unpublished_seconds and the heartbeat',
  [BULK_OPS_JOB_NAMES.DEADLINE_SWEEP]: 'every 30 s; covered by app_deadline_oldest_due_seconds and the heartbeat',
};

/** Job name → the file whose handler runs it. */
const HANDLERS: Record<string, string> = {
  [BULK_OPS_JOB_NAMES.JOB_CLEANUP]: `${PLATFORM}/infrastructure/queue/data-retention.processor.ts`,
  [BULK_OPS_JOB_NAMES.DATA_RETENTION]: `${PLATFORM}/infrastructure/queue/data-retention.processor.ts`,
  [BULK_OPS_JOB_NAMES.LOGIN_EVENTS_CLEANUP]: `${PLATFORM}/auth/login-event-cleanup.processor.ts`,
  [BULK_OPS_JOB_NAMES.TOKENS_CLEANUP]: `${PLATFORM}/auth/tokens-cleanup.processor.ts`,
  [BULK_OPS_JOB_NAMES.TRIAL_EXPIRY]: `${PLATFORM}/domains/plans/trial-expiry.service.ts`,
  [NOTIFICATIONS_JOB_NAMES.CLEANUP]: 'apps/backend/src/domains/notifications/notification-cleanup.processor.ts',
  [WHATSAPP_STALE_SWEEP_JOB_NAME]: `${PLATFORM}/infrastructure/notifications/channels/whatsapp/whatsapp-stale-sweep.handler.ts`,
  [APP_JOB_NAMES.BULK_OPS.AI_CREDENTIAL_REVALIDATE]:
    'apps/backend/src/domains/ai/routing/connect/ai-credential-revalidation.handler.ts',
  [APP_JOB_NAMES.BULK_OPS.OAUTH_REFRESH]: 'apps/backend/src/domains/integrations/oauth/oauth-refresh.processor.ts',
};

const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8');

describe('cron run coverage', () => {
  it('every file that registers a BullMQ repeatable is listed with the jobs it registers', () => {
    const registering = ROOTS.flatMap((root) => listSourceFiles(path.join(REPO, root)))
      .map((abs) => path.relative(REPO, abs).split(path.sep).join('/'))
      .filter((rel) => /\brepeat\s*:/.test(read(rel)))
      .sort();

    expect(registering).toEqual(Object.keys(REGISTRARS).sort());
  });

  const repeatables = [...new Set(Object.values(REGISTRARS).flat())];

  it.each(repeatables)('repeatable %s is sub-minute, exempt with a reason, or wrapped in CronRun', (jobName) => {
    if (jobName in SUB_MINUTE || jobName in CRON_INTERVAL_EXEMPT) {
      expect((SUB_MINUTE[jobName] ?? CRON_INTERVAL_EXEMPT[jobName]).length).toBeGreaterThan(20);
      return;
    }
    const handler = HANDLERS[jobName];
    expect(handler).toBeDefined();
    const src = read(handler);
    expect(src).toMatch(/new CronRun\(/);
  });

  it('every handler listed here still exists', () => {
    for (const file of new Set(Object.values(HANDLERS))) expect(fs.existsSync(path.join(REPO, file))).toBe(true);
  });
});

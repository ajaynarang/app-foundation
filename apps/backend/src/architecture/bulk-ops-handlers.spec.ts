import * as fs from 'fs';
import * as path from 'path';
import { BULK_OPS_JOB_NAMES, QUEUE_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import { jobHandlersToken, QueueJobHandler } from '@appshore/kernel/infrastructure/queue/job-handler.contract';
import { BulkOpsQueueModule } from '../platform-glue/queue/dispatchers/bulk-ops-queue.module';
import { APP_JOB_NAMES } from '../platform-glue/queue/job-names';

/**
 * A bulk-ops handler that is never added to the dispatcher's factory is silently dropped: BaseQueueDispatcher
 * completes an unknown job name as a no-op, so a relay or sweeper tick would never run and nothing would fail.
 * This spec fails when a job name in BULK_OPS_JOB_NAMES, or in the app's APP_JOB_NAMES.BULK_OPS (job-names.ts), has
 * no handler wired into the factory of `bulk-ops-queue.module.ts`. A product that adds a bulk-ops job name adds it to
 * APP_JOB_NAMES.BULK_OPS and its handler file here too.
 */
describe('bulk-ops queue wiring', () => {
  const moduleSrc = fs.readFileSync(
    path.join(__dirname, '../platform-glue/queue/dispatchers/bulk-ops-queue.module.ts'),
    'utf8',
  );
  const platform = '../../../../packages/appshore/platform/src';

  /** Handler file per job name; a file claiming several names is listed once per name. */
  const handlerFileByJobName: Record<string, string> = {
    [BULK_OPS_JOB_NAMES.JOB_CLEANUP]: `${platform}/infrastructure/queue/data-retention.processor.ts`,
    [BULK_OPS_JOB_NAMES.DATA_RETENTION]: `${platform}/infrastructure/queue/data-retention.processor.ts`,
    [BULK_OPS_JOB_NAMES.LOGIN_EVENTS_CLEANUP]: `${platform}/auth/login-event-cleanup.processor.ts`,
    [BULK_OPS_JOB_NAMES.TOKENS_CLEANUP]: `${platform}/auth/tokens-cleanup.processor.ts`,
    [BULK_OPS_JOB_NAMES.TRIAL_EXPIRY]: `${platform}/domains/plans/trial-expiry.service.ts`,
    [BULK_OPS_JOB_NAMES.OPS_HEARTBEAT]: `${platform}/infrastructure/queue/ops-heartbeat.job.ts`,
    [BULK_OPS_JOB_NAMES.OUTBOX_RELAY]: `${platform}/infrastructure/events/outbox-relay.handler.ts`,
    [BULK_OPS_JOB_NAMES.DEADLINE_SWEEP]: `${platform}/infrastructure/deadlines/deadline.sweeper.ts`,
    [APP_JOB_NAMES.BULK_OPS.AI_CREDENTIAL_REVALIDATE]:
      '../domains/ai/routing/connect/ai-credential-revalidation.handler.ts',
    [APP_JOB_NAMES.BULK_OPS.OAUTH_REFRESH]: '../domains/integrations/oauth/oauth-refresh.processor.ts',
  };

  /**
   * Named in the constants but claimed by no handler, each with its reason. Empty: every foundation job runs (the
   * last two leftovers, uploads-cleanup and tokens-cleanup, went in project 4: one deleted, one given a handler).
   */
  const unclaimed = new Set<string>([]);

  /** Constant expression per bulk-ops job name: the kernel's, then the app's. */
  const constantByJobName = new Map<string, string>([
    ...Object.entries(BULK_OPS_JOB_NAMES).map(([key, name]) => [name, `BULK_OPS_JOB_NAMES.${key}`] as const),
    ...Object.entries(APP_JOB_NAMES.BULK_OPS as Record<string, string>).map(
      ([key, name]) => [name, `APP_JOB_NAMES.BULK_OPS.${key}`] as const,
    ),
  ]);

  it('maps every BULK_OPS job name, kernel and app, to a handler file (or names it as unclaimed)', () => {
    const claimed = [...constantByJobName.keys()].filter((name) => !unclaimed.has(name));
    expect(Object.keys(handlerFileByJobName).sort()).toEqual(claimed.sort());
  });

  const injectMatch = moduleSrc.match(/inject:\s*\[([^\]]+)\]/);
  const factoryMatch = moduleSrc.match(/QueueJobHandler\[\]\s*=>\s*\[([^\]]+)\]/);

  /**
   * Runs the module's real factory with one instance per injected class (built with no dependencies: a handler's
   * constructor only stores them), so a handler injected but swapped out of the returned array is caught.
   */
  function resolvedHandlers(): QueueJobHandler[] {
    const providers = (Reflect.getMetadata('providers', BulkOpsQueueModule) ?? []) as Array<{
      provide?: unknown;
      useFactory?: (...deps: unknown[]) => QueueJobHandler[];
      inject?: Array<new (...args: unknown[]) => unknown>;
    }>;
    const provider = providers.find((p) => p.provide === jobHandlersToken(QUEUE_NAMES.BULK_OPS));
    expect(provider?.useFactory).toBeDefined();
    const deps = (provider.inject ?? []).map((Cls) => new Cls(...new Array(Cls.length).fill(undefined)));
    return provider.useFactory(...deps);
  }

  it.each(Object.keys(handlerFileByJobName))('job %s: the factory returns a handler that claims it', (jobName) => {
    const owners = resolvedHandlers().filter((handler) => handler.jobNames.includes(jobName));
    expect(owners).toHaveLength(1);
  });

  it('returns each handler once', () => {
    const handlers = resolvedHandlers();
    expect(new Set(handlers.map((handler) => handler.constructor)).size).toBe(handlers.length);
  });

  it.each([...new Set(Object.values(handlerFileByJobName))])(
    'handler %s is injected into the factory',
    (handlerFile) => {
      const src = fs.readFileSync(path.join(__dirname, handlerFile), 'utf8');
      const classMatch = src.match(/export class (\w+)\s+implements QueueJobHandler/);
      expect(classMatch).not.toBeNull();
      const className = classMatch[1];
      expect(injectMatch).not.toBeNull();
      expect(injectMatch[1]).toContain(className);
      expect(factoryMatch).not.toBeNull();
    },
  );

  it('returns as many handlers as it injects', () => {
    const count = (list: string) => list.split(',').filter((x) => x.trim()).length;
    expect(factoryMatch).not.toBeNull();
    expect(injectMatch).not.toBeNull();
    expect(count(factoryMatch[1])).toBe(count(injectMatch[1]));
  });

  it.each(Object.entries(handlerFileByJobName))('job %s: its handler declares the name', (jobName, handlerFile) => {
    const src = fs.readFileSync(path.join(__dirname, handlerFile), 'utf8');
    expect(src).toContain(constantByJobName.get(jobName));
  });
});

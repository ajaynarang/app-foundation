import * as fs from 'fs';
import * as path from 'path';
import { BULK_OPS_JOB_NAMES, QUEUE_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import { jobHandlersToken, QueueJobHandler } from '@appshore/kernel/infrastructure/queue/job-handler.contract';
import { BulkOpsQueueModule } from '../platform-glue/queue/dispatchers/bulk-ops-queue.module';

/**
 * A bulk-ops handler that is never added to the dispatcher's factory is silently dropped: BaseQueueDispatcher
 * completes an unknown job name as a no-op, so a relay or sweeper tick would never run and nothing would fail.
 * This spec fails when a job name in BULK_OPS_JOB_NAMES has no handler wired into the factory of
 * `bulk-ops-queue.module.ts`. A product that adds a bulk-ops job name adds its handler file here too.
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
    [BULK_OPS_JOB_NAMES.OUTBOX_RELAY]: `${platform}/infrastructure/events/outbox-relay.handler.ts`,
    [BULK_OPS_JOB_NAMES.DEADLINE_SWEEP]: `${platform}/infrastructure/deadlines/deadline.sweeper.ts`,
  };

  /** Named in the constants but claimed by no handler today (foundation leftovers) — listed so a new one cannot hide. */
  const unclaimed = new Set<string>([BULK_OPS_JOB_NAMES.UPLOADS_CLEANUP, BULK_OPS_JOB_NAMES.TOKENS_CLEANUP]);

  it('maps every BULK_OPS job name to a handler file (or names it as unclaimed)', () => {
    const claimed = Object.values(BULK_OPS_JOB_NAMES).filter((name) => !unclaimed.has(name));
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
    const constant = Object.entries(BULK_OPS_JOB_NAMES).find(([, value]) => value === jobName)[0];
    expect(src).toContain(`BULK_OPS_JOB_NAMES.${constant}`);
  });
});

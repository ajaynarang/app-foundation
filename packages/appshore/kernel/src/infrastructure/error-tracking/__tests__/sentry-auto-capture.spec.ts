import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import * as Sentry from '@sentry/nestjs';
import { buildSentryOptions } from '../sentry';

const DSN = 'https://k@o0.ingest.invalid/1';

/**
 * Rule 10: nothing but `reportError` calls the Sentry SDK. The SDK's default Nest integration wraps every
 * `@Processor` process() and `@OnEvent` handler and captures their errors itself, untagged: every failed BullMQ
 * attempt (retries included) and every throwing subscriber. The final job failure is reported once by
 * `reportJobFailure`, so that integration must be off.
 */
describe('Sentry auto-capture', () => {
  it('drops the Nest integration and keeps the other defaults', () => {
    const options = buildSentryOptions({ SENTRY_DSN: DSN, ENV_TYPE: 'development' });
    const integrations = options?.integrations;
    expect(typeof integrations).toBe('function');

    const defaults = Sentry.getDefaultIntegrations({});
    const kept = (integrations as (d: typeof defaults) => typeof defaults)(defaults).map((i) => i.name);

    expect(defaults.map((i) => i.name)).toContain('Nest');
    expect(kept).not.toContain('Nest');
    expect(kept).toHaveLength(defaults.length - 1);
  });

  // Runs in a child Node process: Jest's module loader bypasses the hook Sentry uses to patch Nest decorators, so the
  // auto-capture this guards against never fires inside Jest.
  it('a throwing @Processor process() and @OnEvent handler produce no event; reportError still does', () => {
    const probe = join(__dirname, 'fixtures', 'auto-capture-probe.ts');
    const out = execFileSync(process.execPath, ['--require', require.resolve('tsx/cjs'), probe], {
      cwd: join(__dirname, '..', '..', '..', '..'),
      env: { ...process.env, SENTRY_DSN: '' },
      encoding: 'utf8',
      timeout: 30_000,
    });
    const result = JSON.parse(out.trim().split('\n').pop() as string) as { auto: number; reported: number };

    expect(result).toEqual({ auto: 0, reported: 1 });
  }, 40_000);
});

/**
 * Run by sentry-auto-capture.spec.ts in a plain Node child process. Jest's module loader bypasses the require hook
 * Sentry uses to patch `@nestjs/*` decorators, so the Nest integration's auto-capture only shows outside Jest.
 * Inits the real SDK with buildSentryOptions, a DSN that never resolves and a beforeSend that counts and drops, then
 * throws from a `@Processor` process() and an `@OnEvent` handler, and reports once through reportError.
 * Prints one JSON line: { auto, reported }.
 */
import 'reflect-metadata';
import * as Sentry from '@sentry/nestjs';
import { buildSentryOptions, reportError } from '../../sentry';

async function main(): Promise<void> {
  const options = buildSentryOptions({ SENTRY_DSN: 'https://k@o0.ingest.invalid/1', ENV_TYPE: 'development' });
  if (!options) throw new Error('expected options with a DSN set');
  let count = 0;
  Sentry.init({
    ...options,
    beforeSend() {
      count += 1;
      return null;
    },
  });

  // Loaded after init, so the SDK's require hook sees them, as in the app (instrument.ts runs first).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Processor } = require('@nestjs/bullmq') as typeof import('@nestjs/bullmq');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { OnEvent } = require('@nestjs/event-emitter') as typeof import('@nestjs/event-emitter');

  class ProbeProcessor {
    async process(): Promise<void> {
      throw new Error('job attempt failed');
    }
  }
  Processor('auto-capture-probe')(ProbeProcessor);

  class ProbeListener {
    async handle(): Promise<void> {
      throw new Error('subscriber failed');
    }
  }
  const descriptor = Object.getOwnPropertyDescriptor(ProbeListener.prototype, 'handle') as PropertyDescriptor;
  const patched = OnEvent('auto.capture.probe')(ProbeListener.prototype, 'handle', descriptor) ?? descriptor;
  Object.defineProperty(ProbeListener.prototype, 'handle', patched);

  await new ProbeProcessor().process().catch(() => undefined);
  await new ProbeListener().handle().catch(() => undefined);
  await Sentry.flush(500);
  const auto = count;

  reportError(new Error('reported'), { source: 'job' });
  await Sentry.flush(500);
  const reported = count - auto;

  process.stdout.write(`${JSON.stringify({ auto, reported })}\n`);
  await Sentry.close(0);
}

main().then(
  () => process.exit(0),
  (err: unknown) => {
    process.stderr.write(`${String(err)}\n`);
    process.exit(1);
  },
);

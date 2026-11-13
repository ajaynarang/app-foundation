/**
 * Side-effect import: initialise Sentry before the rest of the application loads, so its integrations (uncaught
 * exceptions, unhandled rejections) are in place. Imported second in `main.ts` and `worker.ts`, right after
 * telemetry. A no-op without `SENTRY_DSN`.
 */
import { initSentry } from './sentry';

initSentry();

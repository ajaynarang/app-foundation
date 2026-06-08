import type { INestApplicationContext } from '@nestjs/common';

/**
 * Tiny module-scoped container reference used by Inngest step handlers
 * (plain async functions, not NestJS classes) to pull services from DI.
 *
 * The backend bootstrap writes the app context here once at startup
 * (main.ts). Step handlers call `nestApp()` to get the container and
 * then `.get(Service)` as usual.
 *
 * This is a pragmatic workaround — Inngest's SDK has no native integration
 * with NestJS DI. We've intentionally avoided the `@inngest/nest` package
 * (see inngest.controller.ts) so rolling our own tiny bridge here is the
 * cost of that choice.
 */

let _app: INestApplicationContext | null = null;

export function setNestAppContext(app: INestApplicationContext): void {
  _app = app;
}

export function nestApp(): INestApplicationContext {
  if (!_app) {
    throw new Error(
      'Nest app context not initialized for Inngest step handlers — ' +
        'main.ts must call setNestAppContext(app) at bootstrap',
    );
  }
  return _app;
}

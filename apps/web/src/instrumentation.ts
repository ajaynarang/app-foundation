import * as Sentry from '@sentry/nextjs';
import { buildSentryOptions } from '@appshore/web-core/shared/lib/sentry-options';

/** Server and edge runtimes. A no-op without NEXT_PUBLIC_SENTRY_DSN. */
export function register() {
  const options = buildSentryOptions();
  if (options) Sentry.init(options);
}

// Reports errors thrown in Server Components, route handlers and middleware.
export const onRequestError = Sentry.captureRequestError;

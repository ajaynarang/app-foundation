import * as Sentry from '@sentry/nextjs';

/**
 * Report an error to Sentry and log it to the console. A no-op for Sentry while `NEXT_PUBLIC_SENTRY_DSN` is unset
 * (the SDK is then never initialised, see `instrumentation-client.ts`). Context values become searchable tags, so
 * they must be identifiers like `source`, never user data.
 *
 * Called from: error boundaries, the global error page, `extractErrorMessage`'s fallback and the SSE provider.
 */
export function captureError(error: unknown, context?: Record<string, string>) {
  Sentry.captureException(error, { tags: context });
  // eslint-disable-next-line no-console
  console.error('[Error]', context?.source || 'unknown', error);
}

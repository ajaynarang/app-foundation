/**
 * Sentry error tracking scaffold.
 *
 * Currently a no-op — logs to console. When Sentry is configured:
 * 1. Install: pnpm add @sentry/nextjs
 * 2. Run: npx @sentry/wizard@latest -i nextjs
 * 3. Set NEXT_PUBLIC_SENTRY_DSN in environment
 * 4. Replace this file's implementation with Sentry SDK calls
 *
 * All error boundaries and utilities already call captureError() —
 * no code changes needed when Sentry is activated.
 */

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

export function initSentry() {
  if (!SENTRY_DSN) return;
  // When Sentry is installed, initialize here:
  // import * as Sentry from '@sentry/nextjs';
  // Sentry.init({ dsn: SENTRY_DSN, tracesSampleRate: 0.1 });
  // eslint-disable-next-line no-console
  console.info('[Sentry] DSN configured — ready for @sentry/nextjs installation');
}

/**
 * Capture an error for tracking. No-op until Sentry DSN is set.
 * Called from: error.tsx boundaries, extractErrorMessage fallback, API client.
 */
export function captureError(error: unknown, context?: Record<string, string>) {
  if (SENTRY_DSN) {
    // When Sentry is installed:
    // import * as Sentry from '@sentry/nextjs';
    // Sentry.captureException(error, { extra: context });
  }
  // Always log for dev visibility
  // eslint-disable-next-line no-console
  console.error('[Error]', context?.source || 'unknown', error);
}

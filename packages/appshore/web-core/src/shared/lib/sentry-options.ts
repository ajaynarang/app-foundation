import type { Breadcrumb, ErrorEvent, EventHint, init } from '@sentry/nextjs';
import { resolveAppEnvironment } from './app-environment';
import { isRequestId } from './request-id';
import { SENTRY_TAG } from './sentry-context';

type SentryOptions = NonNullable<Parameters<typeof init>[0]>;

const CLIENT_ERROR_STATUS_CEILING = 500;

/**
 * Noise the app already handles or cannot act on: chunk-load failures after a deploy (the next navigation fetches
 * the new build), and the benign ResizeObserver browser warning. Aborts are dropped by name below.
 */
const IGNORED_ERRORS: (string | RegExp)[] = [
  /ChunkLoadError/,
  /Loading chunk [\w-]+ failed/,
  /Loading CSS chunk [\w-]+ failed/,
  /Failed to fetch dynamically imported module/,
  'ResizeObserver loop limit exceeded',
  'ResizeObserver loop completed with undelivered notifications',
];

const IGNORED_ERROR_NAMES = new Set(['AbortError', 'TimeoutError']);

/**
 * Sentry v11 replaced `sendDefaultPii` with `dataCollection`. Pages carry personal data, so every category is off;
 * it mirrors the backend's `SENTRY_DATA_COLLECTION`.
 */
export const SENTRY_DATA_COLLECTION: SentryOptions['dataCollection'] = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
};

function isExpectedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (IGNORED_ERROR_NAMES.has(error.name)) return true;
  // ApiError (./api/client) is duck-typed so this module stays free of the API client.
  const status = (error as { status?: unknown }).status;
  return error.name === 'ApiError' && typeof status === 'number' && status < CLIENT_ERROR_STATUS_CEILING;
}

/** An ApiError carries the backend's request id, so the Sentry event links to that request's log lines. */
function tagRequestId(event: ErrorEvent, error: unknown): ErrorEvent {
  const requestId =
    typeof error === 'object' && error !== null ? (error as { requestId?: unknown }).requestId : undefined;
  if (!isRequestId(requestId)) return event;
  return { ...event, tags: { ...event.tags, [SENTRY_TAG.requestId]: requestId } };
}

export function prepareEvent(event: ErrorEvent, hint: EventHint): ErrorEvent | null {
  if (isExpectedError(hint.originalException)) return null;
  return tagRequestId(event, hint.originalException);
}

/** Console output can echo API payloads (names, phone numbers); keep it out of breadcrumbs. */
export function dropConsoleBreadcrumbs(breadcrumb: Breadcrumb): Breadcrumb | null {
  return breadcrumb.category === 'console' ? null : breadcrumb;
}

/**
 * Errors only: no Session Replay, no feedback widget, no tracing, no personal data. `tracesSampleRate` is left unset
 * (not 0) because any defined rate, even 0, switches tracing on. Null when `NEXT_PUBLIC_SENTRY_DSN` is unset, so
 * Sentry stays fully off.
 */
export function buildSentryOptions(
  dsnRaw: string | undefined = process.env.NEXT_PUBLIC_SENTRY_DSN,
): SentryOptions | null {
  const dsn = dsnRaw?.trim();
  if (!dsn) return null;

  return {
    dsn,
    environment: resolveAppEnvironment(),
    dataCollection: SENTRY_DATA_COLLECTION,
    ignoreErrors: IGNORED_ERRORS,
    beforeSend: prepareEvent,
    beforeBreadcrumb: dropConsoleBreadcrumbs,
  };
}

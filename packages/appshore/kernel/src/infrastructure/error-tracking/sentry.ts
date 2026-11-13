import * as Sentry from '@sentry/nestjs';
import type { NodeOptions, SeverityLevel } from '@sentry/nestjs';
import { resolveObservabilityEnv, type ObservabilityEnv } from '../../shared/utils/env-label';
import { SYSTEM_JOB_TENANT } from '../logging/job-log-context';
import { requestContextStorage } from '../logging/request-context.middleware';
import { getActiveTraceContext } from '../logging/trace-context';

const SERVER_ERROR_STATUS = 500;

/**
 * Sentry v11 replaced `sendDefaultPii` with `dataCollection`, whose defaults collect user info, cookies, headers,
 * request and response bodies, query params, AI prompts and database query data. Requests carry personal data, so
 * every category is off: an event carries the stack trace and the route, nothing from the payload
 * (docs/standards/observability.md, rule 12).
 */
export const SENTRY_DATA_COLLECTION: NonNullable<NodeOptions['dataCollection']> = {
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

/** The same three names the web app reports and the Loki `env` label uses, so one filter covers every surface. */
export type SentryEnvironment = ObservabilityEnv;

/**
 * Never throws: this runs from `instrument.ts`, before Nest boots. A bad `ENV_TYPE` is reported loudly by config
 * validation a moment later; error tracking must not crash the process first.
 */
export function resolveSentryEnvironment(raw: string | undefined = process.env.ENV_TYPE): SentryEnvironment {
  const env = resolveObservabilityEnv(raw);
  return env === 'unknown' ? 'development' : env;
}

/**
 * Error tracking only. Tracing stays with the OpenTelemetry pipeline (`infrastructure/telemetry`), so Sentry does not
 * register its own OpenTelemetry provider and no traces sample rate is set. Null when `SENTRY_DSN` is unset.
 */
export function buildSentryOptions(env: NodeJS.ProcessEnv = process.env): NodeOptions | null {
  const dsn = env.SENTRY_DSN?.trim();
  if (!dsn) return null;

  return {
    dsn,
    environment: resolveSentryEnvironment(env.ENV_TYPE),
    release: env.SENTRY_RELEASE?.trim() || undefined,
    dataCollection: SENTRY_DATA_COLLECTION,
    enableOpenTelemetrySetup: false,
  };
}

/** Initialises Sentry when `SENTRY_DSN` is set. Returns whether it is enabled. */
export function initSentry(env: NodeJS.ProcessEnv = process.env): boolean {
  const options = buildSentryOptions(env);
  if (!options) return false;
  Sentry.init(options);
  return true;
}

/**
 * Which kind of code path threw: the `source` tag on every event. `workflow` is the durable workflow engine, named
 * generically because this file survives a scaffold without Desk. `ai` is a handled provider refusal that no other
 * path would report.
 */
export const ERROR_SOURCE = {
  HTTP: 'http',
  JOB: 'job',
  CRON: 'cron',
  EVENT: 'event',
  WORKFLOW: 'workflow',
  AI: 'ai',
} as const;

export type ErrorSource = (typeof ERROR_SOURCE)[keyof typeof ERROR_SOURCE];

/**
 * The only tags a Sentry event may carry. All are ids or names, never personal data: no phones, emails, tokens or
 * amounts. Tenant identity is two tags with one meaning each: `tenantId` is always the public string id,
 * `tenantDbId` always the numeric key.
 */
export interface ErrorTags {
  /** The tenant's public id. A caller that only holds the numeric key may pass it here: it moves to `tenantDbId`. */
  tenantId?: string | number;
  /** The numeric tenant key. */
  tenantDbId?: string | number;
  role?: string;
  jobName?: string;
  jobId?: string;
  queue?: string;
  requestId?: string;
  traceId?: string;
  source?: ErrorSource;
}

export interface ReportOptions {
  /** Defaults to Sentry's `error`. A suspicious but handled event (a refresh token reused) is a `warning`. */
  level?: SeverityLevel;
}

/** Sentry rejects tag values longer than this. */
const MAX_TAG_LENGTH = 200;

/** Tags from the ambient request or job context and the active trace. */
export function currentErrorTags(): ErrorTags {
  const ctx = requestContextStorage.getStore();
  const { traceId } = getActiveTraceContext();
  return {
    tenantId: ctx?.tenantId,
    tenantDbId: ctx?.tenantDbId,
    role: ctx?.role,
    jobName: ctx?.jobName,
    jobId: ctx?.jobId,
    requestId: ctx?.requestId,
    traceId,
  };
}

function toSentryTags(tags: ErrorTags): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tags)) {
    if (value === undefined || value === null || value === '') continue;
    out[key] = String(value).slice(0, MAX_TAG_LENGTH);
  }
  return out;
}

/**
 * Report an exception from outside the HTTP envelope writer: a final job failure, a workflow function that used up
 * its retries, a domain-event subscriber, a cron tenant, an AI refusal. Explicit tags win over the ambient context.
 * A no-op when `SENTRY_DSN` is unset (rule 10: nothing else calls the SDK).
 */
export function reportError(err: unknown, tags: ErrorTags = {}, options: ReportOptions = {}): void {
  if (!Sentry.isInitialized()) return;
  const explicit = normalizeTenantTags(stripUndefined(tags));
  const ambient = normalizeTenantTags(currentErrorTags());
  // A caller that names a tenant owns both tenant tags: never pair its id with the ambient context's public id,
  // which may belong to another tenant.
  if (explicit.tenantId !== undefined || explicit.tenantDbId !== undefined) {
    delete ambient.tenantId;
    delete ambient.tenantDbId;
  }
  Sentry.captureException(err, {
    tags: toSentryTags({ ...ambient, ...explicit }),
    ...(options.level ? { level: options.level } : {}),
  });
}

const NUMERIC_ID = /^\d+$/;

/**
 * One meaning per tenant tag: a numeric `tenantId` (the database key, which crons and job payloads carry) moves to
 * `tenantDbId`; `system` is no tenant at all.
 */
export function normalizeTenantTags(tags: ErrorTags): ErrorTags {
  const out: ErrorTags = { ...tags };
  const raw = out.tenantId;
  if (raw === undefined || raw === null || raw === '') {
    delete out.tenantId;
  } else if (typeof raw === 'number' || NUMERIC_ID.test(raw)) {
    delete out.tenantId;
    if (out.tenantDbId === undefined || out.tenantDbId === null || out.tenantDbId === '') out.tenantDbId = raw;
  } else if (raw === SYSTEM_JOB_TENANT) {
    delete out.tenantId;
  }
  return out;
}

function stripUndefined(tags: ErrorTags): ErrorTags {
  return Object.fromEntries(Object.entries(tags).filter(([, value]) => value !== undefined)) as ErrorTags;
}

/**
 * Reports a server-side failure (5xx) only; a client error is expected behaviour. Carries the request's tenant,
 * role, requestId and traceId. Called from one place: `writeErrorEnvelope`, after it wrote the body.
 */
export function reportServerError(exception: unknown, status: number): void {
  if (status < SERVER_ERROR_STATUS) return;
  reportError(exception, { source: ERROR_SOURCE.HTTP });
}

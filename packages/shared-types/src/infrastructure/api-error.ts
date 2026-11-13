import { z } from 'zod';

/**
 * The API error contract (ADR "API contract", section 2). Every error body is an {@link ApiErrorEnvelope}, and
 * every envelope carries a machine `code` so a client (the web app, the mobile app or an agent) can tell "refresh
 * and retry" (`STALE`) from "this will never succeed" (`INVALID_STATE`) without reading the copy. A domain may add
 * its own codes (`FEATURE_DISABLED`, `PASSWORD_NOT_SET`, …); these are the cross-cutting ones every route shares.
 */
export const ApiErrorCode = {
  /** 400 — malformed or invalid input; `fieldErrors` names the field(s) at fault. */
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  /** 401 — not signed in, or the credential is invalid or expired. */
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  /** 403 — signed in but not allowed (role, scope, plan). */
  FORBIDDEN: 'FORBIDDEN',
  /** 404 — missing, or in another tenant (existence is never confirmed across tenants). */
  NOT_FOUND: 'NOT_FOUND',
  /** 405 — the route exists but not for this method. */
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  /** 409 — the record is not in a state that allows this (illegal transition, closed, already decided). */
  INVALID_STATE: 'INVALID_STATE',
  /** 409 — someone changed the record since you read it; refresh and try again. */
  STALE: 'STALE',
  /** 409 — a record with this value already exists. */
  DUPLICATE: 'DUPLICATE',
  /** 409 — this `Idempotency-Key` was already used for a different request (another route or body). */
  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',
  /** 409 — a request with this `Idempotency-Key` is still running; retry once it has finished. */
  IDEMPOTENCY_KEY_IN_USE: 'IDEMPOTENCY_KEY_IN_USE',
  /**
   * 409 — the email and password match accounts in more than one workspace; the body's `workspaces` lists them and
   * the client retries with one `tenantId`. Only duplicate accounts left from before one-account-per-email can cause it.
   */
  WORKSPACE_SELECTION_REQUIRED: 'WORKSPACE_SELECTION_REQUIRED',
  /** 413 — the upload or body is too large. */
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  /** 429 — rate limited; `Retry-After` says when to try again. */
  RATE_LIMITED: 'RATE_LIMITED',
  /** 400 — a webhook URL that is not public HTTPS (SSRF guard). */
  UNSAFE_WEBHOOK_URL: 'UNSAFE_WEBHOOK_URL',
  /** 503 — a dependency (AI provider, identity provider, …) is not available right now. */
  UNAVAILABLE: 'UNAVAILABLE',
  /** 500 — something failed on our side. */
  INTERNAL: 'INTERNAL',
} as const;
export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

/** The code an error carries when the thrower did not name one — derived from its status. */
export function defaultApiErrorCode(status: number): ApiErrorCode {
  switch (status) {
    case 400:
    case 422:
      return ApiErrorCode.VALIDATION_FAILED;
    case 401:
      return ApiErrorCode.UNAUTHENTICATED;
    case 403:
      return ApiErrorCode.FORBIDDEN;
    case 404:
      return ApiErrorCode.NOT_FOUND;
    case 405:
      return ApiErrorCode.METHOD_NOT_ALLOWED;
    case 409:
      return ApiErrorCode.INVALID_STATE;
    case 413:
      return ApiErrorCode.PAYLOAD_TOO_LARGE;
    case 429:
      return ApiErrorCode.RATE_LIMITED;
    case 502:
    case 503:
    case 504:
      return ApiErrorCode.UNAVAILABLE;
    default:
      return status >= 500 ? ApiErrorCode.INTERNAL : ApiErrorCode.VALIDATION_FAILED;
  }
}

/** Field name → one user-facing message. Nested fields use dot paths (`items.0.title`). */
export type FieldErrors = Record<string, string>;

/** One workspace a sign-in can land in: the tenant's public id and its display name. */
export interface WorkspaceChoice {
  tenantId: string;
  name: string;
}

/** The one error body every non-protocol route answers. No other keys. */
export interface ApiErrorEnvelope {
  statusCode: number;
  /** An {@link ApiErrorCode} or a domain code (`FEATURE_DISABLED`, `PASSWORD_NOT_SET`, …). */
  code: string;
  /** User-facing copy — safe to show in a toast. */
  detail: string;
  /** Only on 400, when a field is at fault. */
  fieldErrors?: FieldErrors;
  /** Only on 409 `WORKSPACE_SELECTION_REQUIRED`: the workspaces the sign-in matched. */
  workspaces?: WorkspaceChoice[];
  timestamp: string;
  path: string;
  method: string;
  /** Development only. */
  debugDetail?: string;
}

/**
 * The envelope as a schema, for the OpenAPI document and for tests that hold a real response to it.
 * Typed against {@link ApiErrorEnvelope} so the two cannot drift.
 */
export const ApiErrorEnvelopeSchema: z.ZodType<ApiErrorEnvelope> = z.object({
  statusCode: z.number().int().describe('The HTTP status, repeated'),
  code: z.string().describe('An ApiErrorCode, or a code one area adds — treat an unknown code by its HTTP status'),
  detail: z.string().describe('User-facing copy — safe to show'),
  fieldErrors: z.record(z.string(), z.string()).optional().describe('Only on 400: field → message'),
  workspaces: z
    .array(z.object({ tenantId: z.string().describe("The tenant's public id"), name: z.string() }))
    .optional()
    .describe('Only on 409 WORKSPACE_SELECTION_REQUIRED: retry the sign-in with one of these tenantIds'),
  timestamp: z.string().describe('ISO-8601'),
  path: z.string(),
  method: z.string(),
  debugDetail: z.string().optional().describe('Development only'),
});

/** The keys an {@link ApiErrorEnvelope} may carry. The filter emits nothing else (held by error-envelope.spec.ts). */
export const API_ERROR_ENVELOPE_KEYS = [
  'statusCode',
  'code',
  'detail',
  'fieldErrors',
  'workspaces',
  'timestamp',
  'path',
  'method',
  'debugDetail',
] as const;

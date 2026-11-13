import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@appshore/db';
import type { Request, Response } from 'express';
import {
  ApiErrorCode,
  defaultApiErrorCode,
  type ApiErrorEnvelope,
  type FieldErrors,
  type WorkspaceChoice,
} from '@app/shared-types';
import { isZodError, zodFieldErrors } from '@appshore/kernel/shared/errors/api-errors';
import { isSilentPath } from '@appshore/kernel/infrastructure/logging/log-filter';
import { toLoggableError, type LoggableError } from '@appshore/kernel/infrastructure/queue/job-events';
import { stripQueryString } from '@appshore/kernel/shared/utils/log-redaction';

/**
 * The one error envelope (ADR "API contract", section 2). Every error body the API sends — from the global
 * filter, a scoped filter that extends it, or a `@Res` / streaming route before its headers are sent — is built
 * here, so the shape and the `code` cannot drift between endpoints. Only these keys are ever emitted:
 * `statusCode, code, detail, fieldErrors?, workspaces?, timestamp, path, method, debugDetail?`. Anything else a
 * thrower attached is dropped; `workspaces` passes only on `WORKSPACE_SELECTION_REQUIRED`. Held by `error-envelope.spec.ts` here and in the backend's architecture specs.
 */

const logger = new Logger('HttpExceptionFilter');

const GENERIC_500 = 'Something went wrong. Please try again or contact support.';
const RATE_LIMITED_COPY = 'Too many requests. Please wait a moment and try again.';
/** `ThrottlerException`'s message (and Nest's bare 429 text) — replaced with {@link RATE_LIMITED_COPY}. */
const THROTTLER_DEFAULT_COPY = /^(ThrottlerException: )?Too Many Requests$/i;

/** Nest's bare defaults (`new UnauthorizedException()`, the roles guard) → copy a person can act on. */
const NEST_DEFAULT_COPY: Record<string, string> = {
  Unauthorized: 'Sign in to continue.',
  Forbidden: "You don't have permission to do this.",
  'Forbidden resource': "You don't have permission to do this.",
  'Not Found': 'This record was not found.',
};

/** The status, code and copy an exception maps to — before the request-specific fields are added. */
export interface ErrorShape {
  status: number;
  code: string;
  detail: string;
  fieldErrors?: FieldErrors;
  /** The workspaces a sign-in matched — only on `WORKSPACE_SELECTION_REQUIRED`. */
  workspaces?: WorkspaceChoice[];
  /** Technical detail: logged, and sent as `debugDetail` in development only. */
  debugDetail?: string;
}

const firstString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : Array.isArray(value) && typeof value[0] === 'string' ? value[0] : undefined;

/** Only string messages keyed by field — anything else a thrower attached never reaches the wire. */
function fieldErrorsOf(value: unknown): FieldErrors | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/** Only `{ tenantId, name }` string pairs — ids, hashes or anything else a thrower attached never reach the wire. */
function workspacesOf(value: unknown): WorkspaceChoice[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const choices = value
    .filter(
      (entry): entry is WorkspaceChoice =>
        !!entry &&
        typeof entry === 'object' &&
        typeof (entry as WorkspaceChoice).tenantId === 'string' &&
        typeof (entry as WorkspaceChoice).name === 'string',
    )
    .map(({ tenantId, name }) => ({ tenantId, name }));
  return choices.length > 0 ? choices : undefined;
}

/** A thrown non-Error, for the log — never itself a reason the filter fails (circular objects, BigInt). */
/** `toLoggableError`, with a thrown non-Error described as JSON rather than `[object Object]`. */
function loggableErrorOf(exception: unknown): LoggableError {
  return exception instanceof Error
    ? toLoggableError(exception)
    : { type: typeof exception, message: describe(exception) };
}

function describe(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function fromHttpException(exception: HttpException): ErrorShape {
  const status = exception.getStatus();
  const response = exception.getResponse();
  const body: Record<string, unknown> =
    typeof response === 'string' ? { message: response } : (response as Record<string, unknown>);

  const code = typeof body.code === 'string' ? body.code : defaultApiErrorCode(status);
  const stated =
    (typeof body.detail === 'string' && body.detail) ||
    (typeof body.error_description === 'string' && body.error_description) ||
    firstString(body.message);
  // A 429 keeps its thrower's own copy (a limit that says when to try again); only the throttler's bare
  // text — or no text at all — becomes the generic line.
  const detail =
    status === HttpStatus.TOO_MANY_REQUESTS && (!stated || THROTTLER_DEFAULT_COPY.test(stated))
      ? RATE_LIMITED_COPY
      : (stated && (NEST_DEFAULT_COPY[stated] ?? stated)) || (status >= 500 ? GENERIC_500 : 'Request failed');

  return {
    status,
    code,
    detail,
    // fieldErrors belong to a 400 only.
    ...(status === HttpStatus.BAD_REQUEST && fieldErrorsOf(body.fieldErrors)
      ? { fieldErrors: fieldErrorsOf(body.fieldErrors) }
      : {}),
    // workspaces belong to the login's workspace-selection answer only.
    ...(code === ApiErrorCode.WORKSPACE_SELECTION_REQUIRED && workspacesOf(body.workspaces)
      ? { workspaces: workspacesOf(body.workspaces) }
      : {}),
  };
}

function fromPrismaKnown(exception: Prisma.PrismaClientKnownRequestError): ErrorShape {
  switch (exception.code) {
    case 'P2002': {
      const target = exception.meta?.target;
      const fields = Array.isArray(target) ? target.join(', ') : 'unknown';
      return {
        status: HttpStatus.CONFLICT,
        code: ApiErrorCode.DUPLICATE,
        detail: 'A record with this value already exists. Please use a different value.',
        debugDetail: `Unique constraint failed on fields: (${fields})`,
      };
    }
    case 'P2025':
      return {
        status: HttpStatus.NOT_FOUND,
        code: ApiErrorCode.NOT_FOUND,
        detail: 'This record was not found. It may have been deleted.',
        debugDetail: (exception.meta?.cause as string) || 'Record not found',
      };
    case 'P2003':
      return {
        status: HttpStatus.CONFLICT,
        code: ApiErrorCode.INVALID_STATE,
        detail: 'This record cannot be changed because it is linked to other data.',
        debugDetail: `Foreign key constraint failed on field: ${JSON.stringify(exception.meta?.field_name ?? 'unknown')}`,
      };
    // A value the column cannot hold (a non-uuid where a uuid id is stored — a typo'd URL id or a forged list
    // cursor) is bad input, never a 500.
    case 'P2007':
      return {
        status: HttpStatus.BAD_REQUEST,
        code: ApiErrorCode.VALIDATION_FAILED,
        detail: 'A value in this request is not in the expected format.',
        debugDetail: `Prisma error P2007: ${exception.message}`,
      };
    case 'P2014':
      return {
        status: HttpStatus.CONFLICT,
        code: ApiErrorCode.INVALID_STATE,
        detail: 'This change would break a required relationship between records.',
        debugDetail: `Required relation violation: ${exception.message}`,
      };
    default:
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        code: ApiErrorCode.INTERNAL,
        detail: 'A database error occurred. Please try again.',
        debugDetail: `Prisma error ${exception.code}: ${exception.message}`,
      };
  }
}

/**
 * The body parser's "over the limit" error. It is an `http-errors` error raised in middleware, not a Nest
 * `HttpException`, and Nest passes it to the filter as it is. Recognised by its `type` alone: a status on any other
 * plain error is not trusted.
 */
const isBodyTooLarge = (exception: unknown): exception is Error =>
  exception instanceof Error && (exception as { type?: unknown }).type === 'entity.too.large';

/** Map any thrown value to its error shape. Unknown errors never leak their message (it goes to `debugDetail`). */
export function errorShapeOf(exception: unknown): ErrorShape {
  if (exception instanceof HttpException) return fromHttpException(exception);
  if (exception instanceof Prisma.PrismaClientKnownRequestError) return fromPrismaKnown(exception);
  if (exception instanceof Prisma.PrismaClientValidationError) {
    return {
      status: HttpStatus.BAD_REQUEST,
      code: ApiErrorCode.VALIDATION_FAILED,
      detail: 'Invalid request data. Please check your input and try again.',
      debugDetail: exception.message,
    };
  }
  if (isZodError(exception)) {
    const fieldErrors = zodFieldErrors(exception.issues);
    const messages = Object.values(fieldErrors);
    return {
      status: HttpStatus.BAD_REQUEST,
      code: ApiErrorCode.VALIDATION_FAILED,
      detail: messages.length === 1 ? messages[0] : `${messages.length} fields are missing or invalid`,
      fieldErrors,
    };
  }
  if (isBodyTooLarge(exception)) {
    return {
      status: HttpStatus.PAYLOAD_TOO_LARGE,
      code: ApiErrorCode.PAYLOAD_TOO_LARGE,
      detail: 'This request is too large. Send less data and try again.',
      debugDetail: exception.message,
    };
  }
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: ApiErrorCode.INTERNAL,
    detail: GENERIC_500,
    debugDetail: exception instanceof Error ? exception.message : describe(exception),
  };
}

/** The envelope for a request — exactly the whitelisted keys. Logs it (5xx error with stack, 4xx warn). */
export function buildErrorEnvelope(exception: unknown, request: Pick<Request, 'url' | 'method'>): ApiErrorEnvelope {
  const shape = errorShapeOf(exception);
  const envelope: ApiErrorEnvelope = {
    statusCode: shape.status,
    code: shape.code,
    detail: shape.detail,
    ...(shape.fieldErrors ? { fieldErrors: shape.fieldErrors } : {}),
    ...(shape.workspaces ? { workspaces: shape.workspaces } : {}),
    timestamp: new Date().toISOString(),
    path: request.url,
    method: request.method,
  };
  if (process.env.NODE_ENV === 'development' && shape.debugDetail) envelope.debugDetail = shape.debugDetail;

  // The path only: the SSE stream, invite and reset links carry their token in the query string (rule 3). The
  // body keeps `path` as sent, since the client already holds it.
  const path = stripQueryString(request.url);
  const line = `${request.method} ${path} - Status: ${shape.status} ${shape.code} - ${shape.detail}`;
  // The raw exception rides as an `err` field, never flattened into the message (rule 4); the err serializer masks
  // any email or phone a provider error echoes.
  if (shape.status >= 500) {
    logger.error({ msg: line, err: loggableErrorOf(exception) });
  } else if (!isSilentPath(path)) {
    logger.warn(shape.debugDetail ? { msg: line, err: loggableErrorOf(exception) } : line);
  }
  return envelope;
}

/**
 * Answer an error with the envelope. The global filter writes through this, and so does a `@Res()` / streaming
 * route that fails before its headers are sent, so this is the one place an error body is written. Returns false —
 * and writes nothing — once headers are out; the caller then ends its stream itself.
 */
export function writeErrorEnvelope(
  response: Response,
  request: Pick<Request, 'url' | 'method'>,
  exception: unknown,
): boolean {
  if (response.headersSent) return false;
  const envelope = buildErrorEnvelope(exception, request);
  // A streaming route may have staged its stream headers already (chunked text) — the envelope is plain JSON.
  response.removeHeader('Transfer-Encoding');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.status(envelope.statusCode).json(envelope);
  return true;
}

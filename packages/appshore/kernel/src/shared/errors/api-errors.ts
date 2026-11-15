import { BadRequestException, ConflictException } from '@nestjs/common';
import { ApiErrorCode, type FieldErrors } from '@app/shared-types';

/**
 * Exceptions that carry their machine `code` (ADR "API contract", section 2). Throw these instead of a bare Nest
 * exception whenever the code is not the status default: a 400 that names its field, a 409 that says which kind
 * of conflict.
 */

/**
 * The exception body. `message` mirrors `detail` only so `exception.message` (logs, `toThrow('…')`) reads the copy —
 * the filter never puts `message` on the wire.
 */
function body(code: ApiErrorCode, detail: string, extra: Record<string, unknown> = {}) {
  return { code, detail, message: detail, ...extra };
}

/** 400 VALIDATION_FAILED blaming one field — `fieldErrors[field] = detail`. */
export function fieldError(field: string, detail: string): BadRequestException {
  return fieldErrors({ [field]: detail }, detail);
}

/** 400 VALIDATION_FAILED blaming several fields; `detail` defaults to the first message (or a count). */
export function fieldErrors(errors: FieldErrors, detail?: string): BadRequestException {
  const messages = Object.values(errors);
  const summary = detail ?? (messages.length === 1 ? messages[0] : `${messages.length} fields are missing or invalid`);
  return new BadRequestException(body(ApiErrorCode.VALIDATION_FAILED, summary, { fieldErrors: errors }));
}

/** 409 INVALID_STATE — the record's state does not allow this (illegal transition, closed, already decided). */
export function invalidState(detail: string): ConflictException {
  return new ConflictException(body(ApiErrorCode.INVALID_STATE, detail));
}

/** 409 STALE — the record changed since the caller read it; refresh and retry. */
export function stale(detail: string): ConflictException {
  return new ConflictException(body(ApiErrorCode.STALE, detail));
}

/** 409 DUPLICATE — a record with this value already exists. */
export function duplicate(detail: string): ConflictException {
  return new ConflictException(body(ApiErrorCode.DUPLICATE, detail));
}

/** A Zod issue, structurally — the kernel does not depend on zod. */
export interface ZodIssueLike {
  path: ReadonlyArray<PropertyKey>;
  message: string;
}

/** Zod issues → `fieldErrors` (first message per dot path; a root-level issue is `_root`). */
export function zodFieldErrors(issues: readonly ZodIssueLike[]): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of issues) {
    const field = issue.path.length > 0 ? issue.path.map(String).join('.') : '_root';
    out[field] ??= issue.message;
  }
  return out;
}

/** True for a ZodError (duck-typed by name + issues, so the kernel needs no zod import). */
export function isZodError(error: unknown): error is Error & { issues: ZodIssueLike[] } {
  return error instanceof Error && error.name === 'ZodError' && Array.isArray((error as { issues?: unknown }).issues);
}

interface SafeParseSchema<T> {
  safeParse(input: unknown): { success: true; data: T } | { success: false; error: { issues: ZodIssueLike[] } };
}

/**
 * Parse input at the HTTP boundary with a Zod schema: the data, or a 400 VALIDATION_FAILED with `fieldErrors`.
 * The controller-safe replacement for `Schema.parse()`, whose uncaught `ZodError` used to be a 500.
 */
export function parseWithSchema<T>(schema: SafeParseSchema<T>, input: unknown, detail?: string): T {
  const result = schema.safeParse(input);
  // `in` narrows without strictNullChecks (the kernel's tsconfig); `if (result.success)` does not.
  if ('error' in result) throw fieldErrors(zodFieldErrors(result.error.issues), detail);
  return result.data;
}

/** An enum state as copy reads it — `PENDING_REVIEW` → `pending review` (never the raw enum name). */
export function stateLabel(state: string): string {
  return state.toLowerCase().replace(/_/g, ' ');
}

/** The summary `detail` for a list whose query failed its schema — `fieldErrors` names each param. */
export const LIST_FILTERS_INVALID = 'Some list filters are not valid — check them and try again';

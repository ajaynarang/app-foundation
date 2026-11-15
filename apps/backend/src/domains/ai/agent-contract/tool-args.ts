import { ApiErrorCode } from '@app/shared-types';
import type { ZodIssue } from 'zod';
import { withoutInternalKeys } from './arg-redactor';

/** What a tool call with bad arguments answers: the same `fieldErrors` shape HTTP validation uses. */
export interface ToolValidationFailure {
  error: string;
  code: typeof ApiErrorCode.VALIDATION_FAILED;
  fieldErrors: Record<string, string>;
}

export type ToolArgsResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; failure: ToolValidationFailure };

interface SafeParsable {
  safeParse(input: unknown): { success: true; data: unknown } | { success: false; error: { issues: ZodIssue[] } };
}

function isSafeParsable(value: unknown): value is SafeParsable {
  return !!value && typeof (value as SafeParsable).safeParse === 'function';
}

/**
 * Validate a caller's tool arguments against the tool's own zod `parameters` before any service runs. Every
 * `_`-prefixed key (`_tenantId`, `_role`, `_confirmToken`, ...) is dropped first: those are the server's to set, and
 * the executor injects its own after. Returns the parsed arguments (defaults applied, unknown keys stripped) or a
 * `VALIDATION_FAILED` with one message per field.
 */
export function validateToolArgs(parameters: unknown, args: Record<string, unknown> | undefined): ToolArgsResult {
  const own = withoutInternalKeys(args ?? {});
  if (!isSafeParsable(parameters)) return { ok: true, data: own };

  const parsed = parameters.safeParse(own);
  // `in` narrowing: the backend compiles without strictNullChecks, where a boolean discriminant does not narrow.
  if (!('error' in parsed)) return { ok: true, data: (parsed.data ?? {}) as Record<string, unknown> };

  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path.length > 0 ? issue.path.join('.') : '_root';
    fieldErrors[field] ??= issue.message;
  }
  const count = Object.keys(fieldErrors).length;
  return {
    ok: false,
    failure: {
      error: count === 1 ? 'One field is missing or invalid' : `${count} fields are missing or invalid`,
      code: ApiErrorCode.VALIDATION_FAILED,
      fieldErrors,
    },
  };
}

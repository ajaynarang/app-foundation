import { createHash } from 'crypto';
import { withoutInternalKeys } from './arg-redactor';

/**
 * The digest that binds a confirmation to one exact write. There is one, for both paths: a third-party agent's
 * challenge token (the pipeline) and a signed-in user's chat grant (`confirm-action`). The side that records the
 * intent and the pipeline that is about to run the write compute it the same way, so a confirmation can only be
 * spent on the call it was given for.
 *
 * - Every top-level `_` key is dropped (`_confirmToken`, `_tenantId`, ...): the server owns them, and the tool
 *   never sees a caller's copy (`validateToolArgs`).
 * - The rest is parsed through the tool's own zod schema: defaults applied, unknown keys dropped. So the model
 *   re-spelling the same call (key order, an omitted default, an extra key) still matches.
 * - Canonical JSON, object keys sorted at every depth, then SHA-256 over the EXACT values. Never the redacted
 *   copy the invocation log keeps, and never a top-level allow-list: a change hidden in a field the log redacts,
 *   or inside a nested object, is a different call and needs a new confirmation.
 */

interface SafeParseSchema {
  safeParse(input: unknown): { success: true; data: unknown } | { success: false; error: { message: string } };
}

function hasSafeParse(schema: unknown): schema is SafeParseSchema {
  return !!schema && typeof (schema as { safeParse?: unknown }).safeParse === 'function';
}

export type PreparedIntentArgs = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

/** The arguments as the tool will see them, or why the tool would reject them. */
export function prepareIntentArgs(schema: unknown, args: Record<string, unknown> | undefined): PreparedIntentArgs {
  const own = withoutInternalKeys(args ?? {});
  if (!hasSafeParse(schema)) return { ok: true, data: own };
  const parsed = schema.safeParse(own);
  // `in` narrowing: the backend compiles without strictNullChecks, where a boolean discriminant does not narrow.
  if ('error' in parsed) return { ok: false, error: parsed.error.message };
  return { ok: true, data: (parsed.data ?? {}) as Record<string, unknown> };
}

/** JSON with object keys sorted at every depth; `undefined` object values are left out, as JSON.stringify does. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** SHA-256 hex of the canonical JSON of a value. */
export function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

/**
 * Digest of a write's arguments (see the file header). Arguments the schema rejects still get a digest, of the
 * stripped raw arguments, so a mismatch is refused rather than thrown.
 */
export function intentDigest(schema: unknown, args: Record<string, unknown> | undefined): string {
  const prepared = prepareIntentArgs(schema, args);
  return sha256Canonical('data' in prepared ? prepared.data : withoutInternalKeys(args ?? {}));
}

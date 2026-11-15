const INTERNAL_KEYS = new Set(['_tenantId', '_userId', '_confirmToken']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d\s\-()]{7,}$/;
const SSN_RE = /^\d{3}-\d{2}-\d{4}$/;

/**
 * The invocation log's copy of a call's arguments: internal keys dropped, values shaped like an email, phone or SSN
 * replaced, at every depth. For the log only. A confirmation digest is never taken over this copy
 * (`intent-digest.ts`): two calls that differ only in a redacted value would look the same.
 */
export function redactArgs(input: unknown): unknown {
  if (input === null || input === undefined) return input;
  if (Array.isArray(input)) return input.map((v) => redactArgs(v));
  if (typeof input === 'string') {
    if (SSN_RE.test(input)) return '[redacted-ssn]';
    if (EMAIL_RE.test(input)) return '[redacted-email]';
    if (PHONE_RE.test(input)) return '[redacted-phone]';
    return input;
  }
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (INTERNAL_KEYS.has(k)) continue;
      out[k] = redactArgs(v);
    }
    return out;
  }
  return input;
}

/** The caller's own arguments: every `_`-prefixed key (server-injected or control, like `_confirmToken`) dropped. */
export function withoutInternalKeys(args: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(args).filter(([key]) => !key.startsWith('_')));
}

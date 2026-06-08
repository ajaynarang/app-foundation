import * as crypto from 'crypto';

const INTERNAL_KEYS = new Set(['_tenantId', '_userId', '_confirmToken']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d\s\-()]{7,}$/;
const SSN_RE = /^\d{3}-\d{2}-\d{4}$/;

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

/** Stable SHA-256 of canonicalized JSON (object keys sorted). */
export function digestArgs(args: Record<string, unknown>): string {
  const stable = JSON.stringify(args, Object.keys(args).sort());
  return crypto.createHash('sha256').update(stable).digest('hex');
}

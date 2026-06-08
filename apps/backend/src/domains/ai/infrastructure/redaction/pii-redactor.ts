/**
 * Allowlist-based PII redactor for structured payloads sent to AI providers.
 *
 * Scope (deliberate, per the AI Cost Telemetry plan, Sprint 2):
 *   - Redacts values whose FIELD NAME matches a known-sensitive key
 *     (ssn, dlNumber, bankAccount, …). Case-insensitive, recurses into
 *     nested objects + arrays.
 *   - Does NOT scan free text for PII patterns (regex / NER) — that's a
 *     sprint-3+ concern with real engineering cost and false-positive risk.
 *     So a driver-license number pasted into a free-text chat message is
 *     NOT caught here; only a `{ dlNumber: "..." }` field is.
 *
 * Conservative by design: false positives (over-redacting a field that
 * happens to share an allowlisted name) are acceptable; false negatives on
 * free text are explicitly out of scope. Primitives pass through untouched —
 * we only ever redact based on the KEY, never the value content.
 *
 * Used at the wrapper boundary (StructuredOutputService) so every structured
 * extraction gets it for free, and (sprint-3) could extend to tool args.
 */

/** Known-sensitive field names. Compared case-insensitively. */
export const PII_FIELD_ALLOWLIST: readonly string[] = [
  'ssn',
  'socialSecurityNumber',
  'social_security_number',
  'driverLicense',
  'driverLicenseNumber',
  'dlNumber',
  'dl_number',
  'licenseNumber',
  'bankAccount',
  'bankAccountNumber',
  'accountNumber',
  'routingNumber',
  'aba',
  'dateOfBirth',
  'dob',
  'password',
  'apiKey',
  'secretKey',
  'privateKey',
  'accessToken',
  'refreshToken',
];

const REDACTED = '[REDACTED]';

// Lowercase set for O(1) case-insensitive lookup.
const ALLOWLIST_LOWER = new Set(PII_FIELD_ALLOWLIST.map((k) => k.toLowerCase()));

/**
 * Raw file bytes (a PDF Buffer in a `file` message part) have no field names
 * to redact, so don't copy them field-by-field. Doing that turns the bytes
 * into a plain `{ '0': n, '1': n, … }` object, which the AI SDK rejects with
 * "The messages do not match the ModelMessage[] schema" — before the model is
 * even called. So leave binary content exactly as-is.
 */
function isBinaryContent(value: object): boolean {
  return ArrayBuffer.isView(value) || value instanceof ArrayBuffer;
}

/**
 * Return a deep copy of `payload` with any allowlisted-key values replaced by
 * `[REDACTED]`. Non-object inputs (string/number/etc.) are returned as-is —
 * there's no key to match on. Arrays are mapped element-wise. Binary content
 * (Buffer / typed array / ArrayBuffer) passes through by reference.
 *
 * Pure: never mutates the input.
 */
export function redactPii<T>(payload: T): T {
  if (Array.isArray(payload)) {
    return payload.map((item) => redactPii(item)) as unknown as T;
  }
  if (payload !== null && typeof payload === 'object') {
    if (isBinaryContent(payload)) return payload;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      out[key] = ALLOWLIST_LOWER.has(key.toLowerCase()) ? REDACTED : redactPii(value);
    }
    return out as unknown as T;
  }
  return payload;
}

/**
 * Redact a chat-style messages array in place-safe fashion. Each message's
 * `content` may be a string (passed through — free text, out of scope) or a
 * structured array of parts (recursed). This keeps the wrapper's call simple:
 * redact the whole `messages` array before handing it to the model.
 */
export function redactMessages<T>(messages: T): T {
  return redactPii(messages);
}

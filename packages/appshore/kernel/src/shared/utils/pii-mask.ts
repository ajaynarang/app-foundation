/**
 * Substring-level PII masking for free text that leaves the process as telemetry
 * (AI prompts and completions, trace attributes). Phones and emails are replaced
 * in place so the surrounding prompt stays readable for debugging.
 *
 * Phone matching is deliberately conservative: E.164 (`+15551234567`) and
 * NANP numbers written with separators (`(555) 123-4567`, `555-123-4567`,
 * `+1 555.123.4567`). Bare digit runs are left alone so order numbers, epoch
 * timestamps, amounts and ids are not destroyed.
 *
 * This is the telemetry mask. Log lines use the field-level helpers in
 * `log-redaction.ts` (`maskEmail`, `maskPhone`), which keep a hint of the value.
 */

export const PII_MASK_TOKEN = {
  phone: '<PHONE>',
  email: '<EMAIL>',
} as const;

// The lookbehind makes the engine try a local part only at the start of a run.
// Without it a long run with no `@` (a base64 blob in a prompt) is rescanned
// from every position: quadratic, and this runs synchronously on span end.
const EMAIL_PATTERN = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

const E164_PHONE_PATTERN = /(?<![\w+])\+\d{10,15}(?!\d)/g;

const NANP_PHONE_PATTERN = /(?<![\w+])(?:\+?1[\s.-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.-])\d{3}[\s.-]\d{4}(?!\d)/g;

export function maskPii(text: string): string {
  const withoutEmails = text.includes('@') ? text.replace(EMAIL_PATTERN, PII_MASK_TOKEN.email) : text;
  return withoutEmails
    .replace(E164_PHONE_PATTERN, PII_MASK_TOKEN.phone)
    .replace(NANP_PHONE_PATTERN, PII_MASK_TOKEN.phone);
}

const CIRCULAR_MARKER = '[Circular]';

function isPlainObject(value: object): value is Record<string, unknown> {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const UNSERIALISABLE_MARKER = '[Unserialisable]';

/** Values with no free text of their own, safe to export as they are. */
function isOpaqueValue(value: object): boolean {
  return value instanceof Date || ArrayBuffer.isView(value) || value instanceof ArrayBuffer;
}

/**
 * Turns a class instance into the plain JSON a telemetry exporter would send
 * anyway, so its strings can be masked. An Error keeps its name, message and
 * stack, which JSON.stringify would drop.
 */
function toPlainValue(value: object): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  try {
    return JSON.parse(JSON.stringify(value)) as unknown;
  } catch {
    return UNSERIALISABLE_MARKER;
  }
}

/**
 * Masks every string inside a value, returning a copy. Arrays and plain objects
 * are walked; Dates and binary buffers are returned untouched; any other object
 * (class instances, Errors, Maps) is reduced to its JSON form first so no string
 * inside it escapes unmasked. A cycle is cut with a marker instead of recursing forever.
 */
export function maskPiiDeep<T>(value: T): T {
  return maskValue(value, new WeakSet()) as T;
}

function maskValue(value: unknown, ancestors: WeakSet<object>): unknown {
  if (typeof value === 'string') return maskPii(value);
  if (value === null || typeof value !== 'object') return value;
  if (ancestors.has(value)) return CIRCULAR_MARKER;
  if (isOpaqueValue(value)) return value;
  if (!Array.isArray(value) && !isPlainObject(value)) return maskValue(toPlainValue(value), ancestors);

  ancestors.add(value);
  const masked = Array.isArray(value)
    ? value.map((item: unknown) => maskValue(item, ancestors))
    : Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, maskValue(entry, ancestors)]));
  ancestors.delete(value);
  return masked;
}

import { scrubContactDetails, stripQueryString } from '../../shared/utils/log-redaction';

/**
 * pino-http serializers. pino-http first runs its standard serializer and then
 * hands the result to these, so each one only removes what must not be logged.
 */

interface SerializedRequest {
  url?: string;
  query?: unknown;
}

interface SerializedError {
  type?: string;
  message?: string;
  stack?: string;
  /** pino-std-serializers' non-enumerable copy of the value that was logged. */
  raw?: unknown;
}

/** Deep enough for Nodemailer's `envelope.to[]` and `rejectedErrors[].response`. */
const MAX_SCRUB_DEPTH = 5;

/**
 * The SSE stream authenticates with `?token=<JWT>` (EventSource can't send
 * headers), so the query string is a credential. Drop it from `req.url` and
 * drop the parsed `req.query` copy too.
 */
export function serializeRequestForLog<T extends SerializedRequest>(req: T): T {
  req.url = stripQueryString(req.url);
  req.query = undefined;
  return req;
}

/**
 * Errors keep their type and stack; contact details echoed by providers are
 * masked. pino's std serializer copies every enumerable prop of the error, so
 * the scrub walks all of them, not just `message` and `stack`: a Nodemailer
 * SMTP failure carries the recipient in `rejected`, `envelope.to`,
 * `rejectedErrors[]` and `response`.
 */
export function serializeErrorForLog<T extends SerializedError>(err: T): T {
  if (!err || typeof err !== 'object') return err;
  const out = scrubEntries(err, 0, new WeakSet()) as T;
  const type = loggedType(err);
  if (type && typeof out === 'object') out.type = type;
  return out;
}

/**
 * The std serializer names the type after the constructor, so a plain `toLoggableError(e)` value reads `Object` and
 * the class name it carries in `type` is lost. Take it back from the value that was logged.
 */
function loggedType(err: SerializedError): string | undefined {
  if (err.type !== 'Object') return undefined;
  const raw = err.raw;
  if (!raw || typeof raw !== 'object' || !isPlainObject(raw)) return undefined;
  const type = (raw as { type?: unknown }).type;
  return typeof type === 'string' && type ? type : undefined;
}

/**
 * Strings are masked. Arrays, plain objects and nested errors are copied, never
 * mutated: a nested object can still be the live error's own `envelope`. Other
 * objects (Date, Buffer) hold no free text and pass through. Past the depth
 * limit or on a cycle the value is dropped rather than logged unscrubbed.
 */
function scrubValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return scrubContactDetails(value);
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    if (depth > MAX_SCRUB_DEPTH || seen.has(value)) return '[Truncated]';
    seen.add(value);
    return value.map((item) => scrubValue(item, depth + 1, seen));
  }
  if (!isPlainObject(value) && !(value instanceof Error)) return value;
  return scrubEntries(value, depth, seen);
}

function scrubEntries(value: object, depth: number, seen: WeakSet<object>): Record<string, unknown> | string {
  if (depth > MAX_SCRUB_DEPTH || seen.has(value)) return '[Truncated]';
  seen.add(value);
  const copy: Record<string, unknown> = {};
  // A nested Error's message and stack are own but non-enumerable.
  const keys = value instanceof Error ? ['name', 'message', 'stack', ...Object.keys(value)] : Object.keys(value);
  for (const key of new Set(keys)) {
    const child = (value as Record<string, unknown>)[key];
    if (child !== undefined) copy[key] = scrubValue(child, depth + 1, seen);
  }
  return copy;
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional, type ApiPropertyOptions } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import { IsOptional } from 'class-validator';
import { fieldError } from '../errors/api-errors';
import {
  MAX_CURSOR_LIMIT,
  MAX_LIST_SEARCH_LENGTH,
  parseDateBound,
  parseEnumList,
  parseEnumValue,
  parseNamedSort,
  parseSearchTerm,
  parseSingleValue,
  type RawQueryValue,
} from './list-query';

/**
 * Query DTOs (ADR "API contract", section 3) — a query string is a class, like a body.
 *
 * Each decorator below declares one query param: the wire name (snake_case stays on the wire, the property is
 * camelCase), the `list-query` parser that reads it, and `@IsOptional()` so the strict global pipe keeps it. The
 * parser runs as a class-transformer `@Transform`, so a bad value is the parser's own 400 VALIDATION_FAILED whose
 * `fieldErrors` names the WIRE param — the same answer a hand-parsed `@Query('x')` gave. An undeclared param is a
 * 400 naming it (the pipe forbids unknown fields).
 *
 *   export class TicketListQueryDto extends DatedListQueryDto {
 *     @QuerySort(TICKET_SORTS, DEFAULT_TICKET_SORT) sort!: TicketSort;
 *     @QueryEnumList(TICKET_STATUSES, { name: 'status' }) statuses?: TicketStatus[];
 *     @QueryString({ name: 'owner_public_id' }) ownerPublicId?: string;
 *   }
 *   list(@Query() query: TicketListQueryDto) { … }
 */

interface WireOptions {
  /** The param's name on the wire, when it differs from the property (`owner_public_id` → `ownerPublicId`). */
  name?: string;
  /** What the param does — shown in the published OpenAPI document. */
  description?: string;
}

/**
 * How a param reads in the OpenAPI document: its schema, beside the wire name. Every kit decorator fills
 * this from what it parses, so a query DTO documents exactly the params it accepts — under their wire names.
 */
export type QueryParamDoc = Pick<
  ApiPropertyOptions,
  'type' | 'enum' | 'isArray' | 'format' | 'minimum' | 'maximum' | 'default' | 'maxLength' | 'pattern' | 'description'
>;

const WIRE_NAMES = Symbol('queryWireNames');

/** The wire name a query-DTO property was declared with (its own name when not renamed). */
export function queryWireName(target: object | undefined, property: string): string {
  const names = (target?.constructor as unknown as Record<symbol, Record<string, string> | undefined>)?.[WIRE_NAMES];
  return names?.[property] ?? property;
}

/**
 * Raw keys that spell a renamed param by its PROPERTY name (`?ownerPublicId=` for `owner_public_id`). The pipe's
 * whitelist checks the transformed object, where that key never lands, so without this it would be silently
 * ignored instead of refused like any other undeclared param.
 */
export function propertySpelledParams(metatype: unknown, raw: unknown): string[] {
  const names = (metatype as Record<symbol, Record<string, string> | undefined> | undefined)?.[WIRE_NAMES];
  if (!names || !raw || typeof raw !== 'object') return [];
  const wires = new Set(Object.values(names));
  return Object.keys(raw).filter(
    (key) => Object.prototype.hasOwnProperty.call(names, key) && names[key] !== key && !wires.has(key),
  );
}

/**
 * The building block: one query param read by `parse(raw, wireName)`. Every other decorator is this with a parser.
 * `raw` is what the HTTP layer delivered — a string, a string[] for a repeated key, or undefined.
 */
export function QueryParam<T>(
  parse: (raw: RawQueryValue, wire: string) => T,
  options: WireOptions = {},
  doc: QueryParamDoc = { type: String },
) {
  return (target: object, property: string | symbol): void => {
    const key = String(property);
    const wire = options.name ?? key;
    const ctor = target.constructor as unknown as Record<symbol, Record<string, string>>;
    // Own copy per class, so a subclass renaming a param never edits its base.
    const inherited = ctor[WIRE_NAMES] ?? {};
    Reflect.defineProperty(ctor, WIRE_NAMES, { value: { ...inherited, [key]: wire }, configurable: true });
    applyDecorators(
      Expose(wire === key ? undefined : { name: wire }),
      Transform(({ obj }) => parse((obj as Record<string, RawQueryValue>)[wire], wire), { toClassOnly: true }),
      IsOptional(),
      // The published contract names the WIRE param (`include_involved`), never the property (`includeInvolved`).
      ApiPropertyOptional({
        ...doc,
        name: wire,
        ...(options.description ? { description: options.description } : {}),
      } as ApiPropertyOptions),
    )(target, property);
  };
}

/** One value used as it is (a cursor, a public id, a key). Empty → undefined; repeated → 400. */
export function QueryString(options: WireOptions & { maxLength?: number; pattern?: RegExp; message?: string } = {}) {
  return QueryParam(
    (raw, wire) => {
      const value = parseSingleValue(raw, wire);
      if (value === undefined) return undefined;
      if (options.maxLength !== undefined && value.length > options.maxLength) {
        throw fieldError(wire, options.message ?? `"${wire}" is too long`);
      }
      if (options.pattern && !options.pattern.test(value))
        throw fieldError(wire, options.message ?? `Invalid "${wire}"`);
      return value;
    },
    options,
    {
      type: String,
      ...(options.maxLength !== undefined ? { maxLength: options.maxLength } : {}),
      ...(options.pattern ? { pattern: options.pattern.source } : {}),
    },
  );
}

/** Several free values, comma-joined or repeated (`?ids=a,b` ≡ `?ids=a&ids=b`). Empty → undefined. */
export function QueryStringList(options: WireOptions & { maxItems?: number } = {}) {
  return QueryParam(
    (raw, wire) => {
      if (raw === undefined || raw === null) return undefined;
      const values: unknown[] = Array.isArray(raw) ? raw : [raw];
      if (values.some((value) => typeof value !== 'string')) throw fieldError(wire, `Invalid "${wire}"`);
      const parts = (values as string[])
        .flatMap((value) => value.split(','))
        .map((part) => part.trim())
        .filter(Boolean);
      if (parts.length === 0) return undefined;
      if (options.maxItems !== undefined && parts.length > options.maxItems) {
        throw fieldError(wire, `Send at most ${options.maxItems} values in "${wire}"`);
      }
      return [...new Set(parts)];
    },
    options,
    { type: String, description: 'Comma-joined or repeated values' },
  );
}

/** `?q=` — one value, control characters → spaces, trimmed, capped at {@link MAX_LIST_SEARCH_LENGTH}. */
export function QuerySearch(options: WireOptions = {}) {
  return QueryParam((raw, wire) => parseSearchTerm(raw, wire), options, {
    type: String,
    maxLength: MAX_LIST_SEARCH_LENGTH,
    description: 'Free-text search',
  });
}

/** `?sort=` — a NAMED option from the endpoint's whitelist; missing → `fallback`, unknown → 400. */
export function QuerySort<T extends string>(allowed: readonly T[], fallback: T) {
  return QueryParam(
    (raw) => parseNamedSort(raw, allowed, fallback),
    {},
    {
      type: String,
      enum: [...allowed],
      default: fallback,
      description: 'Sort order',
    },
  );
}

/** A single enum filter (`?source=EMAIL`). Empty → undefined; unknown → 400. */
export function QueryEnum<T extends string>(allowed: readonly T[], options: WireOptions = {}) {
  return QueryParam((raw, wire) => parseEnumValue(raw, allowed, wire), options, { type: String, enum: [...allowed] });
}

/** A multi-value enum filter, comma-joined or repeated (`?status=A,B`). Empty → undefined; unknown → 400. */
export function QueryEnumList<T extends string>(allowed: readonly T[], options: WireOptions = {}) {
  return QueryParam((raw, wire) => parseEnumList(raw, allowed, wire), options, {
    type: String,
    description: `Comma-joined or repeated, of: ${allowed.join(', ')}`,
  });
}

/**
 * An inclusive date bound — an ISO-8601 instant or a bare `YYYY-MM-DD` (read as a UTC day: `from` is its first
 * millisecond, `to` its last). A year outside 0001–9999 is a 400.
 */
export function QueryDate(bound: 'from' | 'to', options: WireOptions = {}) {
  return QueryParam((raw, wire) => parseDateBound(raw, bound, wire), options, {
    type: String,
    description: `${bound === 'from' ? 'On or after' : 'On or before'} — ISO-8601 instant or YYYY-MM-DD (a UTC day)`,
  });
}

const WHOLE_NUMBER = /^-?\d+$/;

/** Read a whole number; anything else (`abc`, `1.5`, `1e3`, repeated) is a 400 naming the param. */
function parseWholeNumber(raw: RawQueryValue, wire: string): number | undefined {
  const value = parseSingleValue(raw, wire)?.trim();
  if (value === undefined || value === '') return undefined;
  if (!WHOLE_NUMBER.test(value) || !Number.isSafeInteger(Number(value))) {
    throw fieldError(wire, `"${wire}" must be a whole number`);
  }
  return Number(value);
}

export interface QueryIntOptions extends WireOptions {
  min?: number;
  max?: number;
  /** Out of range is pulled into range instead of refused — for page sizes and other "at most" knobs. */
  clamp?: boolean;
  /** Used when the param is missing or blank. */
  default?: number;
}

/** A whole number; out of `min`…`max` is a 400 (or clamped with `clamp: true`). */
export function QueryInt(options: QueryIntOptions = {}) {
  return QueryParam(
    (raw, wire) => {
      const value = parseWholeNumber(raw, wire);
      if (value === undefined) return options.default;
      const { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = options;
      if (value >= min && value <= max) return value;
      if (options.clamp) return Math.min(Math.max(value, min), max);
      throw fieldError(wire, `"${wire}" must be between ${min} and ${max}`);
    },
    options,
    {
      type: 'integer',
      ...(options.min !== undefined ? { minimum: options.min } : {}),
      ...(options.max !== undefined ? { maximum: options.max } : {}),
      ...(options.default !== undefined ? { default: options.default } : {}),
    },
  );
}

/**
 * The page size: a whole number clamped to 1…`max` (100 for cursor lists). Missing or blank → `default` (left
 * undefined for cursor lists, where the service supplies its default of 50). `?limit=abc` is a 400.
 */
export function QueryLimit(options: { max?: number; default?: number; name?: string } = {}) {
  const max = options.max ?? MAX_CURSOR_LIMIT;
  return QueryInt({
    min: 1,
    max,
    clamp: true,
    default: options.default,
    name: options.name,
    description: `Page size, 1–${max} (out of range is clamped)`,
  });
}

/** `true` / `false` only — anything else is a 400 (never "anything but `true` is false"). Empty → undefined. */
export function QueryBool(options: WireOptions = {}) {
  return QueryParam(
    (raw, wire) => {
      const value = parseEnumValue<'true' | 'false'>(raw, ['true', 'false'], wire);
      return value === undefined ? undefined : value === 'true';
    },
    options,
    { type: Boolean },
  );
}

/** `limit` + `cursor`: the paging half of every cursor list. */
export class CursorQueryDto {
  /** Page size, 1…100 (default 50 in the service). */
  @QueryLimit()
  limit?: number;

  /** `nextCursor` of the previous page. Opaque to the client; the service decodes and validates it. */
  @QueryString({ description: '`nextCursor` from the previous page' })
  cursor?: string;
}

/** A searchable cursor list: `limit`, `cursor`, `q`. Declare `sort` and filters on the subclass. */
export class ListQueryDto extends CursorQueryDto {
  @QuerySearch()
  q?: string;
}

/** A searchable cursor list over a date field: `limit`, `cursor`, `q`, `from`, `to` (inclusive). */
export class DatedListQueryDto extends ListQueryDto {
  @QueryDate('from')
  from?: Date;

  @QueryDate('to')
  to?: Date;
}

/**
 * Read a raw query object into a query DTO exactly as an HTTP request would be (the global `AppValidationPipe`):
 * the DTO, or the 400 VALIDATION_FAILED naming the param. For tests and for callers that hold a raw query
 * outside a route.
 */
export async function readQueryDto<T extends object>(dto: new () => T, raw: Record<string, unknown>): Promise<T> {
  // Lazy: the pipe module imports the exception factory, which imports this module.
  const { AppValidationPipe } = await import('./app-validation-pipe');
  return (await new AppValidationPipe().transform(raw, { type: 'query', metatype: dto })) as T;
}

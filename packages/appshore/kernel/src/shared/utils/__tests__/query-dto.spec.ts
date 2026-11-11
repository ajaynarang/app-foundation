import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { IsIn } from 'class-validator';
import { AppValidationPipe, ProtocolWireDto } from '../app-validation-pipe';
import {
  CursorQueryDto,
  DatedListQueryDto,
  ListQueryDto,
  QueryBool,
  QueryEnum,
  QueryEnumList,
  QueryInt,
  QueryLimit,
  QueryParam,
  QuerySort,
  QueryString,
  QueryStringList,
  propertySpelledParams,
  queryWireName,
  readQueryDto,
} from '../query-dto';
import { validationExceptionFactory } from '../validation-exception-factory';

const SORTS = ['newest', 'oldest'] as const;
const STATUSES = ['OPEN', 'DONE'] as const;

class ThingQueryDto extends DatedListQueryDto {
  @QuerySort(SORTS, 'newest')
  sort!: (typeof SORTS)[number];

  @QueryEnumList(STATUSES, { name: 'status' })
  statuses?: Array<(typeof STATUSES)[number]>;

  @QueryEnum(STATUSES, { name: 'single_status' })
  singleStatus?: (typeof STATUSES)[number];

  @QueryString({ name: 'owner_public_id', pattern: /^usr_\w+$/ })
  ownerPublicId?: string;

  @QueryString({ name: 'short_key', maxLength: 3, message: 'Too long' })
  shortKey?: string;

  @QueryStringList({ name: 'ids', maxItems: 2 })
  ids?: string[];

  @QueryBool({ name: 'include_involved' })
  includeInvolved?: boolean;

  @QueryInt({ name: 'days', min: 1, max: 90 })
  days?: number;

  @QueryInt({ name: 'top', min: 1, max: 10, clamp: true, default: 5 })
  top?: number;

  @QueryDate_('closed_since')
  closedSince?: Date;
}

// Indirection so the decorator under test reads like the real ones.
function QueryDate_(name: string) {
  return QueryParam((raw, wire) => (raw === undefined ? undefined : new Date(String(raw))), { name });
}

class AdminLimitQueryDto extends CursorQueryDto {
  @QueryLimit({ name: 'page_size', max: 500, default: 20 })
  pageSize?: number;
}

/** A class-validator rule on a renamed property — its fieldError must use the wire name. */
class ValidatedRenameDto {
  @QueryParam((raw) => raw, { name: 'tenant_slug' })
  @IsIn(['acme'])
  tenantSlug?: string;
}

const pipe = new AppValidationPipe();

async function parse<T>(dto: new () => T, query: Record<string, unknown>): Promise<T> {
  return (await pipe.transform(query, { type: 'query', metatype: dto })) as T;
}

async function rejection(dto: new () => unknown, query: Record<string, unknown>) {
  try {
    await parse(dto, query);
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return (error as BadRequestException).getResponse() as { code: string; fieldErrors: Record<string, string> };
  }
  throw new Error('expected a 400');
}

describe('query DTO kit', () => {
  it('reads a full query: wire names in, camelCase properties out, parsed types', async () => {
    const q = await parse(ThingQueryDto, {
      limit: '20',
      cursor: 'abc',
      q: '  hello\u0000world ',
      from: '2026-01-01',
      to: '2026-01-31',
      sort: 'oldest',
      status: 'OPEN,DONE',
      single_status: 'OPEN',
      owner_public_id: 'usr_1',
      ids: ['a,b'],
      include_involved: 'true',
      days: '30',
      top: '50',
    });
    expect(q).toMatchObject({
      limit: 20,
      cursor: 'abc',
      q: 'hello world',
      sort: 'oldest',
      statuses: ['OPEN', 'DONE'],
      singleStatus: 'OPEN',
      ownerPublicId: 'usr_1',
      ids: ['a', 'b'],
      includeInvolved: true,
      days: 30,
      top: 10,
    });
    expect(q).toBeInstanceOf(ThingQueryDto);
    expect((q as ThingQueryDto).from?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect((q as ThingQueryDto).to?.toISOString()).toBe('2026-01-31T23:59:59.999Z');
    expect(q).not.toHaveProperty('owner_public_id');
  });

  it('an empty query: defaults only (sort fallback, int default), nothing else set', async () => {
    const q = await parse(ThingQueryDto, {});
    expect(q.sort).toBe('newest');
    expect(q.top).toBe(5);
    expect(q.limit).toBeUndefined();
    expect(q.statuses).toBeUndefined();
    expect(q.includeInvolved).toBeUndefined();
  });

  it('blank values mean "not set"', async () => {
    const q = await parse(ThingQueryDto, { limit: '', cursor: '', q: '   ', include_involved: '', ids: ',', top: ' ' });
    expect(q).toMatchObject({ limit: undefined, cursor: undefined, q: undefined, ids: undefined, top: 5 });
    expect(q.includeInvolved).toBeUndefined();
  });

  it.each([
    [{ limit: 'abc' }, 'limit', '"limit" must be a whole number'],
    [{ limit: '1.5' }, 'limit', '"limit" must be a whole number'],
    [{ limit: '1e3' }, 'limit', '"limit" must be a whole number'],
    [{ limit: '99999999999999999999' }, 'limit', '"limit" must be a whole number'],
    [{ limit: ['1', '2'] }, 'limit', 'Send "limit" only once'],
    [{ cursor: ['a', 'b'] }, 'cursor', 'Send "cursor" only once'],
    [{ sort: 'priority' }, 'sort', 'Unknown sort option'],
    [{ status: 'OPEN,NOPE' }, 'status', 'Unknown status value'],
    [{ single_status: 'NOPE' }, 'single_status', 'Unknown single_status value'],
    [{ from: 'not-a-date' }, 'from', 'Invalid "from" date'],
    [{ to: '+275000-01-01' }, 'to', 'Invalid "to" date'],
    [{ owner_public_id: 'x' }, 'owner_public_id', 'Invalid "owner_public_id"'],
    [{ short_key: 'abcd' }, 'short_key', 'Too long'],
    [{ ids: 'a,b,c' }, 'ids', 'Send at most 2 values in "ids"'],
    [{ ids: [['a']] }, 'ids', 'Invalid "ids"'],
    [{ include_involved: 'yes' }, 'include_involved', 'Unknown include_involved value'],
    [{ days: '0' }, 'days', '"days" must be between 1 and 90'],
    [{ days: 'ten' }, 'days', '"days" must be a whole number'],
    [{ unknown_param: '1' }, 'unknown_param', 'property unknown_param should not exist'],
  ])('%j → 400 naming %s', async (query, field, message) => {
    const body = await rejection(ThingQueryDto, query);
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.fieldErrors).toEqual({ [field]: message });
  });

  it('a renamed param sent by its property name is refused like any undeclared param', async () => {
    const body = await rejection(ThingQueryDto, { ownerPublicId: 'usr_1' });
    expect(body.fieldErrors).toEqual({ ownerPublicId: 'property ownerPublicId should not exist' });
    // Object.prototype keys are not property names (no false "renamed" hit).
    expect(propertySpelledParams(ThingQueryDto, { toString: 'x', constructor: 'y' })).toEqual([]);
    // A protocol shape that ignores unknown fields ignores a property-name spelling too.
    @ProtocolWireDto({ ignoreUnknownFields: true })
    class LenientDto {
      @QueryString({ name: 'return_to' })
      returnTo?: string;
    }
    await expect(parse(LenientDto, { returnTo: 'x', return_to: 'y' })).resolves.toEqual({ returnTo: 'y' });
    // A property whose wire name is its own name is fine.
    await expect(parse(ThingQueryDto, { limit: '2' })).resolves.toMatchObject({ limit: 2 });
  });

  it('limits are clamped, never refused for size', async () => {
    expect((await parse(ListQueryDto, { limit: '500' })).limit).toBe(100);
    expect((await parse(ListQueryDto, { limit: '0' })).limit).toBe(1);
    expect((await parse(ListQueryDto, { limit: '-4' })).limit).toBe(1);
    expect((await parse(AdminLimitQueryDto, { page_size: '400' })).pageSize).toBe(400);
    expect((await parse(AdminLimitQueryDto, { page_size: '900' })).pageSize).toBe(500);
    expect((await parse(AdminLimitQueryDto, {})).pageSize).toBe(20);
  });

  it('reports the wire name for a class-validator rule on a renamed property', async () => {
    const body = await rejection(ValidatedRenameDto, { tenant_slug: 'other' });
    expect(Object.keys(body.fieldErrors)).toEqual(['tenant_slug']);
  });

  it('readQueryDto reads a raw query like a request', async () => {
    await expect(readQueryDto(ListQueryDto, { limit: '7' })).resolves.toMatchObject({ limit: 7 });
    await expect(readQueryDto(ListQueryDto, { limit: 'x' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('queryWireName falls back to the property name', () => {
    expect(queryWireName(new ThingQueryDto(), 'ownerPublicId')).toBe('owner_public_id');
    expect(queryWireName(new ThingQueryDto(), 'limit')).toBe('limit');
    expect(queryWireName(undefined, 'limit')).toBe('limit');
  });

  it('a subclass rename does not leak into its base', () => {
    expect(queryWireName(new DatedListQueryDto(), 'ownerPublicId')).toBe('ownerPublicId');
  });

  it('the exception factory still prefixes nested errors with the property path', () => {
    const error = validationExceptionFactory([
      { property: 'items', children: [{ property: 'name', constraints: { isString: 'name must be a string' } }] },
    ] as never);
    expect((error.getResponse() as { fieldErrors: Record<string, string> }).fieldErrors).toEqual({
      'items.name': 'name must be a string',
    });
  });

  describe('OpenAPI: each param is documented under its WIRE name', () => {
    const doc = (dto: object, property: string) =>
      Reflect.getMetadata('swagger/apiModelProperties', (dto as { prototype: object }).prototype, property) as Record<
        string,
        unknown
      >;

    it('names the wire param, not the property, with the schema its parser reads', () => {
      expect(doc(ThingQueryDto, 'includeInvolved')).toMatchObject({
        name: 'include_involved',
        type: Boolean,
        required: false,
      });
      expect(doc(ThingQueryDto, 'statuses')).toMatchObject({ name: 'status', type: String });
      expect(doc(ThingQueryDto, 'singleStatus')).toMatchObject({ name: 'single_status', enum: ['OPEN', 'DONE'] });
      expect(doc(ThingQueryDto, 'sort')).toMatchObject({ enum: ['newest', 'oldest'], default: 'newest' });
      expect(doc(ThingQueryDto, 'ownerPublicId')).toMatchObject({ name: 'owner_public_id', pattern: '^usr_\\w+$' });
      expect(doc(ThingQueryDto, 'shortKey')).toMatchObject({ maxLength: 3 });
      expect(doc(ThingQueryDto, 'days')).toMatchObject({ type: 'integer', minimum: 1, maximum: 90 });
      expect(doc(ThingQueryDto, 'top')).toMatchObject({ default: 5 });
      expect(doc(ThingQueryDto, 'ids')).toMatchObject({ name: 'ids', type: String });
      expect(doc(ThingQueryDto, 'from')).toMatchObject({ name: 'from', type: String });
      expect(doc(ThingQueryDto, 'q')).toMatchObject({ name: 'q', description: 'Free-text search' });
    });

    it('documents the paging params every cursor list inherits', () => {
      expect(doc(CursorQueryDto, 'limit')).toMatchObject({ name: 'limit', type: 'integer', minimum: 1, maximum: 100 });
      expect(doc(CursorQueryDto, 'cursor')).toMatchObject({
        name: 'cursor',
        description: expect.stringMatching(/nextCursor/),
      });
      expect(doc(AdminLimitQueryDto, 'pageSize')).toMatchObject({ name: 'page_size', maximum: 500, default: 20 });
    });

    it('a bare QueryParam documents a string', () => {
      expect(doc(ValidatedRenameDto, 'tenantSlug')).toMatchObject({ name: 'tenant_slug', type: String });
    });
  });
});

import { BadRequestException } from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { z } from 'zod';
import { ApiErrorCode } from '@app/shared-types';
import { fieldError, parseWithSchema } from '@appshore/kernel/shared/errors/api-errors';
import { validationExceptionFactory } from '@appshore/kernel/shared/utils/validation-exception-factory';
import {
  parseDateBound,
  parseEnumList,
  parseEnumValue,
  parseNamedSort,
  parseSearchTerm,
  parseSingleValue,
} from '@appshore/kernel/shared/utils/list-query';
import { CursorQueryDto, QueryString, readQueryDto } from '@appshore/kernel/shared/utils/query-dto';

/**
 * ADR "API contract", section 2: every 400 caused by a field names it in `fieldErrors`, whichever door the input
 * came through: a class-validator DTO, a query DTO, a list query param, a Zod schema at the boundary, or a
 * controller's own check. One shape — `fieldErrors: Record<field, message>` + `code: VALIDATION_FAILED` — everywhere.
 */

const responseOf = (fn: () => unknown): Record<string, unknown> => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return (error as BadRequestException).getResponse() as Record<string, unknown>;
  }
  throw new Error('expected a 400');
};

const expectFieldError = (body: Record<string, unknown>, field: string) => {
  expect(body.code).toBe(ApiErrorCode.VALIDATION_FAILED);
  expect(body.fieldErrors).toEqual(expect.objectContaining({ [field]: expect.any(String) }));
  expect(typeof body.detail).toBe('string');
};

describe('fieldErrors everywhere', () => {
  it.each([
    ['sort', () => parseNamedSort('createdAt', ['newest'] as const, 'newest')],
    ['status', () => parseEnumList('NOPE', ['OPEN'] as const, 'status')],
    ['status', () => parseEnumList([1 as unknown as string], ['OPEN'] as const, 'status')],
    ['source', () => parseEnumValue('NOPE', ['EMAIL'] as const, 'source')],
    ['from', () => parseDateBound('not-a-date', 'from')],
    ['to', () => parseDateBound('+275000-01-01', 'to')],
    ['cursor', () => parseSingleValue(['a', 'b'], 'cursor')],
    ['q', () => parseSearchTerm(['a', 'b'])],
  ])('list query param %s', (field, fn) => {
    expectFieldError(responseOf(fn), field);
  });

  it('a class-validator DTO failure (nested fields use dot paths)', () => {
    const errors = [
      Object.assign(new ValidationError(), {
        property: 'items',
        children: [
          Object.assign(new ValidationError(), {
            property: '0',
            children: [
              Object.assign(new ValidationError(), {
                property: 'title',
                constraints: { isString: 'title must be text' },
              }),
            ],
          }),
        ],
      }),
    ];
    const body = validationExceptionFactory(errors).getResponse() as Record<string, unknown>;
    expectFieldError(body, 'items.0.title');
  });

  it('a Zod schema at the boundary (parseWithSchema — never Schema.parse in a controller)', () => {
    const schema = z.object({ limit: z.coerce.number().int().max(100) });
    expectFieldError(
      responseOf(() => parseWithSchema(schema, { limit: '500' })),
      'limit',
    );
  });

  it("a controller's own field check (fieldError)", () => {
    expectFieldError(
      responseOf(() => {
        throw fieldError('closed_since', 'Send "closed_since" together with one status');
      }),
      'closed_since',
    );
  });

  it('a query DTO names the WIRE param, for a bad value and for an unknown param', async () => {
    class ThingQueryDto extends CursorQueryDto {
      @QueryString({ name: 'owner_public_id', pattern: /^usr_\w+$/ })
      ownerPublicId?: string;
    }
    const rejectionOf = async (raw: Record<string, unknown>) => {
      try {
        await readQueryDto(ThingQueryDto, raw);
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        return (error as BadRequestException).getResponse() as Record<string, unknown>;
      }
      throw new Error('expected a 400');
    };
    expectFieldError(await rejectionOf({ limit: 'abc' }), 'limit');
    expectFieldError(await rejectionOf({ owner_public_id: 'nope' }), 'owner_public_id');
    expectFieldError(await rejectionOf({ page: '2' }), 'page');
  });
});

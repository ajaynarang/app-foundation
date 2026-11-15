import 'reflect-metadata';
import { ApiErrorEnvelopeSchema, cursorListSchema } from '@app/shared-types';
import { ApiProperty } from '@nestjs/swagger';
import { ApiResult, componentRef, defineResponseSchema, responseSchemas } from '../api-result';
import { ApiErrorEnvelopeResponse, defineCursorListSchema } from '../common-responses';

const responsesOf = (fn: unknown) => Reflect.getMetadata('swagger/apiResponse', fn as object) as Record<string, any>;

class ThingDto {
  @ApiProperty()
  name!: string;
}

// Fresh schema objects from shared-types (platform has no zod dependency of its own).
const Thing = cursorListSchema(ApiErrorEnvelopeSchema);
const ThingResponse = defineResponseSchema('Thing', Thing);

class Controller {
  @ApiResult(ThingResponse)
  get() {}

  @ApiResult(ThingResponse, 201)
  create() {}

  @ApiResult([ThingResponse])
  list() {}

  @ApiResult(ThingDto, 202, 'Queued')
  queue() {}

  @ApiResult([ThingDto], 418)
  teapot() {}
}

describe('ApiResult / defineResponseSchema', () => {
  it('registers a schema once under its name; the same pair again is a no-op', () => {
    expect(responseSchemas().get('Thing')).toBe(Thing);
    expect(defineResponseSchema('Thing', Thing)).toEqual({ name: 'Thing', schema: Thing });
  });

  it('refuses a second schema under one name, and a name that is not PascalCase', () => {
    expect(() => defineResponseSchema('Thing', cursorListSchema(ApiErrorEnvelopeSchema))).toThrow(/already defined/);
    expect(() => defineResponseSchema('thing-list', Thing)).toThrow(/PascalCase/);
  });

  it('documents a named schema by $ref, with the status and a default description', () => {
    expect(responsesOf(Controller.prototype.get)['200']).toMatchObject({
      description: 'OK',
      schema: componentRef('Thing'),
    });
    expect(responsesOf(Controller.prototype.create)['201']).toMatchObject({
      description: expect.stringMatching(/Created/),
    });
    expect(responsesOf(Controller.prototype.list)['200'].schema).toEqual({
      type: 'array',
      items: { $ref: '#/components/schemas/Thing' },
    });
  });

  it('documents a response class by type (and as an array)', () => {
    expect(responsesOf(Controller.prototype.queue)['202']).toMatchObject({ type: ThingDto, description: 'Queued' });
    expect(responsesOf(Controller.prototype.teapot)['418']).toMatchObject({
      type: ThingDto,
      isArray: true,
      description: 'OK',
    });
  });

  it('ships the error envelope and a cursor-list factory', () => {
    expect(responseSchemas().get(ApiErrorEnvelopeResponse.name)).toBeDefined();
    const list = defineCursorListSchema('ThingList', Thing);
    expect((list.schema as { shape: object }).shape).toHaveProperty('nextCursor');
  });
});

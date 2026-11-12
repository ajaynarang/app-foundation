import { applyDecorators, type Type } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

/**
 * Response documentation for the published contract (ADR "API contract", section 4).
 *
 * A route's success body is documented from the type of record, the Zod schema in `@app/shared-types`, never by
 * re-typing its shape: `defineResponseSchema('UserDetail', UserDetailSchema)` names it once, and
 * `@ApiResult(UserDetailResponse, 201)` puts `$ref: '#/components/schemas/UserDetail'` on the route. The backend's
 * document builder turns every registered schema into its `components.schemas` entry. Where no Zod schema exists,
 * pass a response class whose properties carry `@ApiProperty`.
 *
 *   export const UserDetailResponse = defineResponseSchema('UserDetail', UserDetailSchema);
 *
 *   @Post()
 *   @HttpCode(HttpStatus.CREATED)
 *   @ApiResult(UserDetailResponse, HttpStatus.CREATED)
 *   create(...)
 *
 * A bodiless route documents itself with `@ApiNoContentResponse()`.
 */

/** A named response schema: the registry entry an {@link ApiResult} points at. */
export interface ResponseSchemaRef {
  readonly name: string;
  /** The Zod schema (any `zod` v3 type), converted by the document builder. */
  readonly schema: unknown;
}

const REGISTRY = new Map<string, unknown>();

/** Name a Zod schema as a response component. One name, one schema: a second schema under the same name throws. */
export function defineResponseSchema(name: string, schema: unknown): ResponseSchemaRef {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) throw new Error(`Response schema name "${name}" must be PascalCase`);
  const existing = REGISTRY.get(name);
  if (existing !== undefined && existing !== schema) {
    throw new Error(`Response schema "${name}" is already defined with a different schema`);
  }
  REGISTRY.set(name, schema);
  return Object.freeze({ name, schema });
}

/** Every named response schema, by name: what the document builder publishes under `components.schemas`. */
export function responseSchemas(): ReadonlyMap<string, unknown> {
  return REGISTRY;
}

export const componentRef = (name: string) => ({ $ref: `#/components/schemas/${name}` });

type ResultTarget = ResponseSchemaRef | Type<unknown>;

const isSchemaRef = (target: ResultTarget): target is ResponseSchemaRef =>
  typeof target === 'object' && target !== null && 'name' in target && 'schema' in target;

const DESCRIPTION: Record<number, string> = {
  200: 'OK',
  201: 'Created: the new resource',
  202: 'Accepted: the work is queued; the body is the record to poll',
};

/**
 * Document the route's success body: a named response schema or a response class, or `[x]` for a bare array (only
 * the reasoned `BOUNDED_LISTS` of `api-contract.allowlist.json`; every other list is a cursor-list schema). `status`
 * is the route's own status (`@HttpCode`); the generator's audit checks the two agree.
 */
export function ApiResult(target: ResultTarget | [ResultTarget], status = 200, description?: string) {
  const isArray = Array.isArray(target);
  const one = isArray ? target[0] : target;
  const text = description ?? DESCRIPTION[status] ?? 'OK';
  if (isSchemaRef(one)) {
    const ref = componentRef(one.name);
    return applyDecorators(
      ApiResponse({ status, description: text, schema: isArray ? { type: 'array', items: ref } : ref }),
    );
  }
  return applyDecorators(ApiResponse({ status, description: text, type: one, isArray }));
}

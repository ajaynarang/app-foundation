import { ApiErrorEnvelopeSchema, cursorListSchema } from '@app/shared-types';
import { defineResponseSchema, type ResponseSchemaRef } from './api-result';

/** The one error body (ADR "API contract", section 2): every error response in the published document references it. */
export const ApiErrorEnvelopeResponse = defineResponseSchema('ApiErrorEnvelope', ApiErrorEnvelopeSchema);

/** A cursor-paged list of `item` under its own name (`UserList`). */
export function defineCursorListSchema(name: string, item: Parameters<typeof cursorListSchema>[0]): ResponseSchemaRef {
  return defineResponseSchema(name, cursorListSchema(item));
}

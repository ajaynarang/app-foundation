import { LoginActivityEventSchema, LoginActivitySummarySchema } from '@app/shared-types';
import { defineResponseSchema } from '../../shared/openapi/api-result';
import { defineCursorListSchema } from '../../shared/openapi/common-responses';

/** Login events, newest first — `tenant` is present only on the Super Admin view. */
export const LoginActivityListResponse = defineCursorListSchema('LoginActivityList', LoginActivityEventSchema);
export const LoginActivitySummaryResponse = defineResponseSchema('LoginActivitySummary', LoginActivitySummarySchema);

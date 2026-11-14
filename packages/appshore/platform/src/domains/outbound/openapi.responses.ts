import { OutboundAllowEntrySchema, OutboundStatusSchema, OutboundSuppressionSchema } from '@app/shared-types';
import { defineResponseSchema } from '../../shared/openapi/api-result';
import { defineCursorListSchema } from '../../shared/openapi/common-responses';

/** The outbound gate's mode for this environment. */
export const OutboundStatusResponse = defineResponseSchema('OutboundStatus', OutboundStatusSchema);
/** One allow-list entry. */
export const OutboundAllowEntryResponse = defineResponseSchema('OutboundAllowEntry', OutboundAllowEntrySchema);
/** Sends the gate held back, newest first (masked recipient, redacted preview). */
export const OutboundSuppressionListResponse = defineCursorListSchema(
  'OutboundSuppressionList',
  OutboundSuppressionSchema,
);

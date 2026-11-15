import { z } from 'zod';
import { FeedbackStatusSchema, UserRoleSchema } from '@app/shared-types';
import { defineResponseSchema } from '@appshore/platform/shared/openapi/api-result';
import { defineCursorListSchema } from '@appshore/platform/shared/openapi/common-responses';

/** The feedback domain's response bodies: the wire form of `toPublicFeedback`, named once. */

const PersonRefSchema = z.object({
  userId: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
});

/** A feedback row by its public id. `user` / `tenant` / `resolver` come with the admin reads and writes only. */
const PublicFeedbackSchema = z.object({
  feedbackId: z.string().uuid(),
  category: z.string().nullable().describe('bug | idea | general, or null while uncategorized'),
  sentiment: z.number().int().min(1).max(5),
  message: z.string(),
  page: z.string().nullable(),
  status: FeedbackStatusSchema,
  note: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  user: PersonRefSchema.extend({ email: z.string().nullable(), role: UserRoleSchema }).optional(),
  tenant: z.object({ tenantId: z.string(), companyName: z.string().nullable() }).optional(),
  resolver: PersonRefSchema.nullable().optional(),
});

export const FeedbackResponse = defineResponseSchema('Feedback', PublicFeedbackSchema);
export const FeedbackListResponse = defineCursorListSchema('FeedbackList', PublicFeedbackSchema);

/** `GET /admin/feedback/stats` — the total, one count per status (keyed by the status), and counts per sentiment. */
export const FeedbackStatsResponse = defineResponseSchema(
  'FeedbackStats',
  z.object({
    total: z.number().int(),
    NEW: z.number().int(),
    REVIEWED: z.number().int(),
    RESOLVED: z.number().int(),
    bySentiment: z.array(z.object({ sentiment: z.number().int(), count: z.number().int() })),
  }),
);

/** The tenants that have submitted feedback, by company name (the admin tenant picker). */
export const FeedbackTenantListResponse = defineCursorListSchema(
  'FeedbackTenantList',
  z.object({
    id: z.number().int().describe('Tenant numeric id (listed in id-boundary.allowlist.json)'),
    tenantId: z.string(),
    companyName: z.string(),
  }),
);

/** `POST /admin/feedback/bulk-categorize` — `total` is absent when there was nothing to categorize. */
export const FeedbackBulkCategorizeResponse = defineResponseSchema(
  'FeedbackBulkCategorize',
  z.object({ categorized: z.number().int(), total: z.number().int().optional() }),
);

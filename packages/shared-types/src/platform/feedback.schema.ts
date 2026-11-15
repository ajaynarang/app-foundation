import { z } from 'zod';
import { cursorListSchema } from '../infrastructure/cursor-list';

// ---------------------------------------------------------------------------
// Feedback category & status enums
// ---------------------------------------------------------------------------
export const FeedbackCategoryEnum = z.enum(['bug', 'idea', 'general']);
export type FeedbackCategory = z.infer<typeof FeedbackCategoryEnum>;

export const FeedbackStatusEnum = z.enum(['NEW', 'REVIEWED', 'RESOLVED']);
// `FeedbackStatus` type comes from the generated Prisma mirror — not re-declared
// here to avoid a barrel re-export collision.

// ---------------------------------------------------------------------------
// Core feedback schema
// ---------------------------------------------------------------------------
/** A person on a feedback row, named by their public user id. */
const FeedbackPersonSchema = z.object({
  userId: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
});

/**
 * A feedback row as the API shows it: named by its public id (`feedbackId`, a uuid, also the id in the admin
 * URL); people and tenants by theirs. No numeric key crosses the API.
 */
export const FeedbackSchema = z.object({
  feedbackId: z.string().uuid(),
  category: FeedbackCategoryEnum.nullable(),
  sentiment: z.number().int().min(1).max(5),
  message: z.string(),
  page: z.string().nullable(),
  status: FeedbackStatusEnum,
  note: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  resolvedAt: z.string().nullable(),
  user: FeedbackPersonSchema.extend({ email: z.string().nullable(), role: z.string() }).optional(),
  tenant: z.object({ tenantId: z.string(), companyName: z.string().nullable() }).optional(),
  resolver: FeedbackPersonSchema.nullable().optional(),
});

export type Feedback = z.infer<typeof FeedbackSchema>;

// ---------------------------------------------------------------------------
// Feedback stats (admin dashboard)
// ---------------------------------------------------------------------------
export const FeedbackStatsSchema = z.object({
  total: z.number(),
  new: z.number(),
  reviewed: z.number(),
  resolved: z.number(),
  bySentiment: z.array(
    z.object({
      sentiment: z.number(),
      count: z.number(),
    }),
  ),
});

export type FeedbackStats = z.infer<typeof FeedbackStatsSchema>;

// ---------------------------------------------------------------------------
// List response: a cursor list, newest first. On the admin list, `counts` holds every status.
// ---------------------------------------------------------------------------
export const FeedbackListResponseSchema = cursorListSchema(FeedbackSchema);

export type FeedbackListResponse = z.infer<typeof FeedbackListResponseSchema>;

// ---------------------------------------------------------------------------
// Create feedback request
// ---------------------------------------------------------------------------
export const CreateFeedbackSchema = z.object({
  sentiment: z.number().int().min(1).max(5),
  message: z.string().min(1).max(5000),
  page: z.string().max(500).optional(),
});

export type CreateFeedback = z.infer<typeof CreateFeedbackSchema>;

// ---------------------------------------------------------------------------
// Resolve feedback request
// ---------------------------------------------------------------------------
export const ResolveFeedbackSchema = z.object({
  note: z.string().min(1).max(2000),
});

export type ResolveFeedback = z.infer<typeof ResolveFeedbackSchema>;

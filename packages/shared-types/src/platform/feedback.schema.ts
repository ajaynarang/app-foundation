import { z } from 'zod';

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
export const FeedbackSchema = z.object({
  id: z.number(),
  category: FeedbackCategoryEnum.nullable(),
  sentiment: z.number().int().min(1).max(5),
  message: z.string(),
  page: z.string().nullable(),
  status: FeedbackStatusEnum,
  note: z.string().nullable(),
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
  user: z
    .object({
      id: z.number(),
      firstName: z.string(),
      lastName: z.string(),
      email: z.string(),
      phone: z.string().nullable(),
      role: z.string(),
    })
    .optional(),
  tenant: z
    .object({
      id: z.number(),
      companyName: z.string(),
    })
    .optional(),
  resolver: z
    .object({
      id: z.number(),
      firstName: z.string(),
      lastName: z.string(),
    })
    .nullable()
    .optional(),
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
// Paginated list response
// ---------------------------------------------------------------------------
export const FeedbackListResponseSchema = z.object({
  data: z.array(FeedbackSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});

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

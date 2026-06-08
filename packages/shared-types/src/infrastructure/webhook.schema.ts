import { z } from 'zod';
import {
  JobStatus,
  JobStatusSchema,
  NotificationCategory,
  NotificationCategorySchema,
  NotificationType,
  NotificationTypeSchema,
} from '../generated/prisma-enums';

// ─── Notifications ───

// `NotificationCategorySchema` and `NotificationTypeSchema` are re-exported
// from the codegen mirror — the Prisma enums are the single source of truth.
// `JobStatusSchema` likewise.
export { NotificationCategory, NotificationCategorySchema, NotificationType, NotificationTypeSchema };

/**
 * In-app notification user-read state. NOT the same value space as the
 * Prisma `NotificationStatus` enum (`PENDING/SENT/FAILED`) which tracks
 * delivery state. Renamed from `NotificationStatusSchema` to make the
 * distinction explicit and stop shadowing the generated mirror.
 */
export const NotificationInboxStatusSchema = z.enum(['UNREAD', 'READ', 'DISMISSED']);
export type NotificationInboxStatus = z.infer<typeof NotificationInboxStatusSchema>;

export const NotificationSchema = z.object({
  id: z.number(),
  notificationId: z.string(),
  type: z.string(),
  category: NotificationCategorySchema.nullable(),
  title: z.string().nullable(),
  message: z.string().nullable(),
  actionUrl: z.string().nullable(),
  actionLabel: z.string().nullable(),
  iconType: z.string().nullable(),
  status: z.string(),
  readAt: z.string().nullable(),
  dismissedAt: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  groupKey: z.string().nullable().optional(),
  groupCount: z.number().default(1).optional(),
  createdAt: z.string(),
});

export const NotificationCountSchema = z.object({
  total: z.number(),
  system: z.number(),
  team: z.number(),
  billing: z.number(),
});

export const ListNotificationsParamsSchema = z.object({
  status: z.string().optional(),
  category: z.string().optional(),
  page: z.number().optional(),
  limit: z.number().optional(),
});

// ─── System Activity / Jobs ───

export { JobStatus, JobStatusSchema };
export const HealthStatusSchema = z.enum(['HEALTHY', 'WARNING', 'CRITICAL']);

export const JobSchema = z.object({
  // Numeric PK — the `jobs` table migrated from a CUID string PK to an Int PK
  // (PR #734/735). Consumers must treat `id` as a number, not a string.
  id: z.number(),
  tenantId: z.number(),
  submittedBy: z.number().nullable(),
  category: z.string(),
  type: z.string(),
  status: JobStatusSchema,
  priority: z.number(),
  inputData: z.record(z.string(), z.any()),
  resultData: z.record(z.string(), z.any()).nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  errorDetails: z.record(z.string(), z.any()).nullable().optional(),
  attempts: z.number(),
  maxAttempts: z.number(),
  progress: z.number().nullable().optional(),
  queuedAt: z.string(),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  tenant: z.object({ id: z.number(), companyName: z.string() }).optional(),
});

export const TypeSummarySchema = z.object({
  type: z.string(),
  displayName: z.string(),
  lastRunAt: z.string().nullable(),
  lastRunStatus: z.enum(['COMPLETED', 'FAILED', 'CANCELLED']).nullable(),
  todayTotal: z.number(),
  todaySucceeded: z.number(),
  todayFailed: z.number(),
  schedule: z.string().nullable(),
  nextRun: z.string().nullable(),
});

export const CategorySummarySchema = z.object({
  category: z.string(),
  displayName: z.string(),
  lastRunAt: z.string().nullable(),
  todayTotal: z.number(),
  todaySucceeded: z.number(),
  todayFailed: z.number(),
  health: HealthStatusSchema,
  types: z.array(TypeSummarySchema),
});

export const JobMetricsSchema = z.object({
  totalToday: z.number(),
  successRate: z.number(),
  failedCount: z.number(),
  avgDurationMs: z.number(),
});

export const PaginatedJobsSchema = z.object({
  items: z.array(JobSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

// Inferred types — `NotificationCategory`, `NotificationType`, `JobStatus`
// already come from the generated mirror via the re-export above.
// `NotificationInboxStatus` is exported next to its Schema declaration.
export type Notification = z.infer<typeof NotificationSchema>;
export type NotificationCount = z.infer<typeof NotificationCountSchema>;
export type ListNotificationsParams = z.infer<typeof ListNotificationsParamsSchema>;
export type HealthStatus = z.infer<typeof HealthStatusSchema>;
export type Job = z.infer<typeof JobSchema>;
export type TypeSummary = z.infer<typeof TypeSummarySchema>;
export type CategorySummary = z.infer<typeof CategorySummarySchema>;
export type JobMetrics = z.infer<typeof JobMetricsSchema>;
export type PaginatedJobs = z.infer<typeof PaginatedJobsSchema>;

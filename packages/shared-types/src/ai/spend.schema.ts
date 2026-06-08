import { z } from 'zod';
import { AiSurfaceSchema, AiInvocationStatusSchema } from '../generated/prisma-enums';

/**
 * Wire shapes for the super-admin AI Spend view.
 *
 * Views land in PR 5; sprint-2 PR 10 layers budget config + the cost-vs-quota
 * panel on top. Schemas here cover only the read-side shapes available
 * today.
 */

const NumericString = z.string(); // Postgres `numeric` serializes as string

/**
 * One row in the home table: per-tenant 7-day spend total + sparkline data.
 * `sparkline` is the last N days' costUsd in chronological order so the UI
 * can render an inline trend without a second roundtrip.
 */
export const AiSpendTenantSummarySchema = z.object({
  tenantId: z.number().int(),
  tenantSlug: z.string(),
  companyName: z.string(),
  windowCostUsd: NumericString, // sum across the chosen window
  windowCallCount: z.number().int(),
  windowErrorCount: z.number().int(),
  sparkline: z.array(
    z.object({
      day: z.string(), // YYYY-MM-DD
      costUsd: NumericString,
    }),
  ),
  lastActivityAt: z.string().nullable(), // ISO 8601
});
export type AiSpendTenantSummary = z.infer<typeof AiSpendTenantSummarySchema>;

/**
 * Drill-in: per-surface breakdown for one tenant within the chosen window.
 * The page sums these to get the tenant total, but exposes them as rows so
 * the UI can show a bar chart and surface filter.
 */
export const AiSpendSurfaceRowSchema = z.object({
  surface: AiSurfaceSchema,
  windowCostUsd: NumericString,
  windowCallCount: z.number().int(),
  windowErrorCount: z.number().int(),
  windowTotalTokens: z.number().int(),
});
export type AiSpendSurfaceRow = z.infer<typeof AiSpendSurfaceRowSchema>;

/**
 * Single invocation row for the drill-in list. The full ledger has more
 * columns; we expose what the UI shows.
 */
export const AiSpendInvocationItemSchema = z.object({
  id: z.string().uuid(),
  surface: AiSurfaceSchema,
  agentId: z.string().nullable(),
  model: z.string(),
  provider: z.string(),
  costUsd: NumericString.nullable(),
  promptTokens: z.number().int(),
  completionTokens: z.number().int(),
  cachedTokens: z.number().int().nullable(),
  latencyMs: z.number().int().nullable(),
  status: AiInvocationStatusSchema,
  langfuseTraceId: z.string().nullable(),
  linkRefType: z.string().nullable(),
  linkRefId: z.string().nullable(),
  createdAt: z.string(),
});
export type AiSpendInvocationItem = z.infer<typeof AiSpendInvocationItemSchema>;

/**
 * Cursor-paginated list payload. We pass the last row's createdAt+id as the
 * next cursor (keyset pagination — invocation list is high-volume and
 * offset-paging falls over fast).
 */
export const AiSpendInvocationListSchema = z.object({
  items: z.array(AiSpendInvocationItemSchema),
  nextCursor: z.string().nullable(),
});
export type AiSpendInvocationList = z.infer<typeof AiSpendInvocationListSchema>;

/**
 * A tenant's AI cost budget caps (USD). Numeric strings — Prisma serializes
 * Decimal as string. Soft = banner; hard = block + fallback.
 */
export const AiBudgetSchema = z.object({
  dailySoftUsd: z.string(),
  dailyHardUsd: z.string(),
  monthlySoftUsd: z.string(),
  monthlyHardUsd: z.string(),
  notes: z.string().nullable(),
});
export type AiBudget = z.infer<typeof AiBudgetSchema>;

/**
 * Update payload for a tenant's budget. All four caps required, notes
 * optional. Values are dollars (numbers). Validated: each ≥ 0, hard ≥ soft,
 * monthly ≥ daily.
 */
export const UpdateAiBudgetSchema = z
  .object({
    dailySoftUsd: z.number().min(0),
    dailyHardUsd: z.number().min(0),
    monthlySoftUsd: z.number().min(0),
    monthlyHardUsd: z.number().min(0),
    notes: z.string().max(500).nullable().optional(),
  })
  .refine((b) => b.dailyHardUsd >= b.dailySoftUsd, {
    message: 'Daily hard cap must be ≥ daily soft cap',
    path: ['dailyHardUsd'],
  })
  .refine((b) => b.monthlyHardUsd >= b.monthlySoftUsd, {
    message: 'Monthly hard cap must be ≥ monthly soft cap',
    path: ['monthlyHardUsd'],
  })
  .refine((b) => b.monthlyHardUsd >= b.dailyHardUsd, {
    message: 'Monthly hard cap must be ≥ daily hard cap',
    path: ['monthlyHardUsd'],
  });
export type UpdateAiBudgetInput = z.infer<typeof UpdateAiBudgetSchema>;

/**
 * Side-by-side cost vs quota for one tenant. Quota counts feature uses
 * (from the plan/billing system); cost is USD spend (from the ledger). Both
 * exist independently — this panel makes the distinction visible.
 */
export const AiCostVsQuotaSchema = z.object({
  windowDays: z.number().int(),
  cost: z.object({
    totalUsd: z.string(),
    callCount: z.number().int(),
  }),
  budget: AiBudgetSchema,
  // Quota rows are best-effort: the quota system is separate and may not
  // expose every surface. Empty array = no quota data available.
  quota: z.array(
    z.object({
      featureKey: z.string(),
      label: z.string(),
      used: z.number().int(),
      limit: z.number().int().nullable(), // null = unlimited
    }),
  ),
});
export type AiCostVsQuota = z.infer<typeof AiCostVsQuotaSchema>;

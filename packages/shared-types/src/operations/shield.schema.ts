import { z } from 'zod';
import {
  ShieldAuditScope,
  ShieldAuditScopeSchema,
  ShieldAuditStatus,
  ShieldAuditStatusSchema,
  ShieldFindingCategory,
  ShieldFindingCategorySchema,
  ShieldFindingSeverity,
  ShieldFindingSeveritySchema,
  ShieldStatusLabel,
  ShieldStatusLabelSchema,
} from '../generated/prisma-enums';

// Shield enums re-exported from the codegen mirror — Prisma enums are the
// single source of truth.
export {
  ShieldAuditScope,
  ShieldAuditScopeSchema,
  ShieldAuditStatus,
  ShieldAuditStatusSchema,
  ShieldFindingCategory,
  ShieldFindingCategorySchema,
  ShieldFindingSeverity,
  ShieldFindingSeveritySchema,
  ShieldStatusLabel,
  ShieldStatusLabelSchema,
};

export const ShieldFindingSourceSchema = z.enum(['RULE', 'AI', 'CUSTOM']);
export type ShieldFindingSource = z.infer<typeof ShieldFindingSourceSchema>;

export const ShieldFindingSchema = z.object({
  id: z.string(),
  auditId: z.string(),
  category: ShieldFindingCategorySchema,
  severity: ShieldFindingSeveritySchema,
  source: ShieldFindingSourceSchema,
  title: z.string(),
  description: z.string(),
  regulation: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  entityName: z.string().optional(),
  impact: z.string().optional(),
  recommendation: z.string().optional(),
  dueDate: z.string().optional(),
  isResolved: z.boolean(),
  resolvedAt: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string(),
});
export type ShieldFinding = z.infer<typeof ShieldFindingSchema>;

export const ShieldAIInsightSchema = z.object({
  title: z.string(),
  description: z.string(),
});
export type ShieldAIInsight = z.infer<typeof ShieldAIInsightSchema>;

export const ShieldPriorityActionSchema = z.object({
  priority: z.number(),
  action: z.string(),
  dueDate: z.string().optional(),
});
export type ShieldPriorityAction = z.infer<typeof ShieldPriorityActionSchema>;

export const ShieldCoverageItemSchema = z.object({
  check: z.string(),
  regulation: z.string(),
  source: z.enum(['rule', 'ai']),
});
export type ShieldCoverageItem = z.infer<typeof ShieldCoverageItemSchema>;

export const ShieldAuditSchema = z.object({
  id: z.string(),
  scope: ShieldAuditScopeSchema,
  status: ShieldAuditStatusSchema,
  overallScore: z.number().nullable(),
  hosScore: z.number().nullable(),
  driversScore: z.number().nullable(),
  vehiclesScore: z.number().nullable(),
  loadsScore: z.number().nullable(),
  statusLabel: ShieldStatusLabelSchema.nullable(),
  triggeredBy: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  durationMs: z.number().nullable(),
  includeAi: z.boolean(),
  aiSummary: z.string().nullable(),
  aiInsights: z.array(ShieldAIInsightSchema).nullable(),
  aiActions: z.array(ShieldPriorityActionSchema).nullable(),
  aiModelUsed: z.string().nullable(),
  aiDurationMs: z.number().nullable(),
  auditPeriodDays: z.number().optional(),
  coverage: z.record(z.string(), z.array(ShieldCoverageItemSchema)).nullable().optional(),
  createdAt: z.string(),
  findings: z.array(ShieldFindingSchema).optional(),
  triggeredByUser: z.object({ firstName: z.string(), lastName: z.string() }).optional(),
  _count: z.object({ findings: z.number() }).optional(),
});
export type ShieldAudit = z.infer<typeof ShieldAuditSchema>;

export const ShieldInProgressAuditSchema = z.object({
  id: z.string(),
  status: ShieldAuditStatusSchema,
  scope: ShieldAuditScopeSchema,
  createdAt: z.string(),
});
export type ShieldInProgressAudit = z.infer<typeof ShieldInProgressAuditSchema>;

export const ShieldLatestResponseSchema = z.object({
  hasAudit: z.boolean(),
  inProgress: z.boolean(),
  hasFailed: z.boolean(),
  nextScheduledAt: z.string(),
  inProgressAudit: ShieldInProgressAuditSchema.optional(),
  message: z.string().optional(),
  audit: ShieldAuditSchema.optional(),
});
export type ShieldLatestResponse = z.infer<typeof ShieldLatestResponseSchema>;

export const TriggerAuditResponseSchema = z.object({
  queued: z.boolean(),
  auditId: z.string(),
  message: z.string().optional(),
});
export type TriggerAuditResponse = z.infer<typeof TriggerAuditResponseSchema>;

export const AuditHistoryResponseSchema = z.object({
  audits: z.array(ShieldAuditSchema),
  total: z.number(),
});
export type AuditHistoryResponse = z.infer<typeof AuditHistoryResponseSchema>;

export const ShieldCustomRuleSchema = z.object({
  id: z.string(),
  tenantId: z.number(),
  rule: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ShieldCustomRule = z.infer<typeof ShieldCustomRuleSchema>;

export const TriggerAuditParamsSchema = z.object({
  scope: ShieldAuditScopeSchema,
  includeAi: z.boolean().optional(),
  includeCustomRules: z.boolean().optional(),
  auditPeriodDays: z.number().optional(),
});
export type TriggerAuditParams = z.infer<typeof TriggerAuditParamsSchema>;

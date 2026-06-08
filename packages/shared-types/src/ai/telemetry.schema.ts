import { z } from 'zod';
import { AiSurface, AiSurfaceSchema, AiInvocationStatus, AiInvocationStatusSchema } from '../generated/prisma-enums';

// Re-export the generated AI enums (both value + Zod schema) through the
// package root so frontend code can `import { AiSurface } from
// '@app/shared-types'` — same convention the other schema files use for
// their Prisma enums. Without this, only the Schema leaks out, not the value.
export { AiSurface, AiSurfaceSchema, AiInvocationStatus, AiInvocationStatusSchema };

/**
 * Identifying context for a single LLM or embedding call. Required by
 * `AiTelemetryService.record()` and by the surface-side wrapper helpers.
 *
 * `tenantId` and `surface` are mandatory — untagged cost is a bug, not a
 * default. `userId` is optional because system-driven calls (Desk scheduler,
 * batch ingest) have no end-user; in those cases the agent identity flows
 * through `agentId` instead.
 *
 * `linkRefType` + `linkRefId` form a polymorphic pointer back to the surface
 * entity (document, desk step, conversation message, alert, etc.). The
 * super-admin AI Spend view uses this to drill from a cost row back to the
 * thing that produced it.
 *
 * `parentInvocationId` links a fallback retry (or a sub-call inside a
 * tool-call chain) back to the primary invocation. Same call, multiple model
 * attempts, one ledger trail.
 *
 * `idempotencyKey` is optional but strongly encouraged for retried surfaces
 * (document parsers, desk steps). Duplicate writes with the same key are
 * no-ops at the DB layer.
 */
export const AiCallContextSchema = z.object({
  tenantId: z.number().int().positive(),
  userId: z.number().int().positive().optional(),
  surface: AiSurfaceSchema,
  agentId: z.string().max(80).optional(),
  linkRefType: z.string().max(40).optional(),
  linkRefId: z.string().max(64).optional(),
  parentInvocationId: z.string().uuid().optional(),
  idempotencyKey: z.string().max(200).optional(),
  langfuseTraceId: z.string().max(128).optional(),
});
export type AiCallContext = z.infer<typeof AiCallContextSchema>;

/**
 * Token + latency + outcome data captured from a single model call. The
 * wrapper reads these off the AI SDK / Mastra result, normalizes shape, and
 * passes them to `AiTelemetryService.record()` along with the context.
 *
 * `provider` and `model` are part of usage (not context) because a single
 * logical surface can route to different providers/models for primary vs
 * fallback — the cost ledger needs the actual model that ran.
 */
export const AiUsageSchema = z.object({
  provider: z.string().max(40),
  model: z.string().max(80),
  promptTokens: z.number().int().min(0),
  completionTokens: z.number().int().min(0),
  totalTokens: z.number().int().min(0),
  cachedTokens: z.number().int().min(0).optional(),
  latencyMs: z.number().int().min(0).optional(),
  status: AiInvocationStatusSchema,
  errorCode: z.string().max(80).optional(),
});
export type AiUsage = z.infer<typeof AiUsageSchema>;

/**
 * Budget evaluation state. `ok` → call proceeds silently. `soft` → call
 * proceeds but the UI surfaces a banner. `hard` → call is blocked and the
 * surface falls back. Spent figures are USD strings (Decimal-serialized).
 */
export const AiBudgetStateSchema = z.object({
  state: z.enum(['ok', 'soft', 'hard']),
  dailyUsdSpent: z.string(),
  monthlyUsdSpent: z.string(),
  dailySoftUsd: z.string(),
  dailyHardUsd: z.string(),
  monthlySoftUsd: z.string(),
  monthlyHardUsd: z.string(),
});
export type AiBudgetState = z.infer<typeof AiBudgetStateSchema>;

/**
 * Wire shape returned by `AiTelemetryService.record()`. Callers usually only
 * need `id` so they can stamp it onto the surface row (e.g.
 * `DeskEpisodeStep.aiInvocationId`). The full row is available for tests and
 * for the super-admin view.
 */
export const AiInvocationRecordSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.number().int(),
  surface: AiSurfaceSchema,
  model: z.string(),
  provider: z.string(),
  costUsd: z.string().nullable(), // Decimal serialized as string by Prisma
  totalTokens: z.number().int(),
  status: AiInvocationStatusSchema,
  createdAt: z.string(), // ISO 8601
});
export type AiInvocationRecord = z.infer<typeof AiInvocationRecordSchema>;

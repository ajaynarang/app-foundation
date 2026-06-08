import { z } from 'zod';
import { AgentScopeSchema } from '@app/shared-types';
import { ApprovalDecisionSchema } from './enums';

/**
 * Types shared between the durable workflow code, step activities, and the
 * backend API. These describe workflow I/O and the structured inputs/outputs of
 * each step.
 */

// ─── Workflow input ──────────────────────────────────────────────────────────

export const WorkflowInputSchema = z.object({
  episodeId: z.string().uuid(),
});
export type WorkflowInput = z.infer<typeof WorkflowInputSchema>;

// ─── Preflight result (Hydrate-embedded) ─────────────────────────────────────

export const PreflightResultSchema = z.union([
  z.object({ action: z.literal('proceed') }),
  z.object({ action: z.literal('skip'), outcome: z.string(), reason: z.string() }),
  z.object({ action: z.literal('abort'), outcome: z.string(), reason: z.string() }),
]);
export type PreflightResult = z.infer<typeof PreflightResultSchema>;

// ─── Memory items attached to hydrate output ─────────────────────────────────

export const MemoryItemSchema = z.object({
  id: z.string().uuid(),
  kind: z.string(),
  content: z.string(),
  confidence: z.number().min(0).max(1),
  createdAt: z.string().datetime(),
});
export type MemoryItem = z.infer<typeof MemoryItemSchema>;

// ─── Hydrate output ──────────────────────────────────────────────────────────

export const HydrateOutputSchema = z.object({
  entity: z.record(z.unknown()),
  memories: z.array(MemoryItemSchema),
  preflight: PreflightResultSchema,
});
export type HydrateOutput = z.infer<typeof HydrateOutputSchema>;

// ─── Gate result (returned by gate activity) ─────────────────────────────────

export const GateResultSchema = z.union([
  z.object({
    gated: z.literal(false),
    rule: z.string(),
    toolScope: AgentScopeSchema,
    tier: z.enum(['read', 'standard', 'sensitive']),
  }),
  z.object({
    gated: z.literal(true),
    rule: z.string(),
    toolScope: AgentScopeSchema.nullable(),
    tier: z.enum(['read', 'standard', 'sensitive']).nullable(),
    approvalId: z.string().uuid(),
    checks: z.record(z.unknown()).optional(),
    confidence: z.number().nullable().optional(),
    threshold: z.number().nullable().optional(),
  }),
]);
export type GateResult = z.infer<typeof GateResultSchema>;

// ─── Approval payload (signal sent to workflow on human decision) ───────────

export const ApprovalPayloadSchema = z.object({
  decision: ApprovalDecisionSchema,
  terminateEpisode: z.boolean().default(false),
  editedAction: z.record(z.unknown()).nullable().optional(),
  rejectionReason: z.string().max(2000).nullable().optional(),
  decidedByUserId: z.number().int().positive(),
});
export type ApprovalPayload = z.infer<typeof ApprovalPayloadSchema>;

// ─── Standard outcomes (per responsibility declares its own vocabulary) ─────

export const SHARED_OUTCOMES = [
  'rejected_by_operator',
  'approval_expired',
  'no_action_needed',
  'preflight_skipped',
  'preflight_aborted',
] as const;

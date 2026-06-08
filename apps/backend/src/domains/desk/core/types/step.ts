import { z } from 'zod';
import { StepKindSchema, StepStatusSchema } from './enums';

/**
 * Shape of a DeskEpisodeStep row as exposed to the UI.
 * Server serializes Decimal → string for `costUsd`.
 */

export const GateDecisionRecordSchema = z.object({
  gated: z.boolean(),
  rule: z.string(),
  toolScope: z.string().nullable().optional(),
  tier: z.enum(['read', 'standard', 'sensitive']).nullable().optional(),
  approvalId: z.string().uuid().optional(),
  checks: z.record(z.unknown()).optional(),
  confidence: z.number().nullable().optional(),
  threshold: z.number().nullable().optional(),
});
export type GateDecisionRecord = z.infer<typeof GateDecisionRecordSchema>;

export const StepRecordSchema = z.object({
  id: z.string().uuid(),
  episodeId: z.string().uuid(),
  agentId: z.number().int().positive().nullable(),
  sequence: z.number().int().nonnegative(),
  kind: StepKindSchema,
  status: StepStatusSchema,

  // LLM metadata
  model: z.string().nullable(),
  promptKey: z.string().nullable(),
  tokensInput: z.number().int().nonnegative().nullable(),
  tokensOutput: z.number().int().nonnegative().nullable(),
  costUsd: z.string().nullable(), // Decimal serialized

  // Tool metadata
  toolName: z.string().nullable(),
  toolScope: z.string().nullable(), // full scope string at execute time
  toolTier: z.enum(['read', 'standard', 'sensitive']).nullable(), // derived tier for quick audit queries
  toolArgs: z.record(z.unknown()).nullable(),
  toolResult: z.record(z.unknown()).nullable(),

  // Gate
  gateDecision: GateDecisionRecordSchema.nullable(),

  // LLM output + confidence
  output: z.record(z.unknown()).nullable(),
  confidence: z.number().nullable(),
  errorMessage: z.string().nullable(),

  durationMs: z.number().int().nonnegative().nullable(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable(),
});
export type StepRecord = z.infer<typeof StepRecordSchema>;

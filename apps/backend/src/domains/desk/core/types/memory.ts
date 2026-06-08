import { z } from 'zod';
import { AgentKeySchema, MemoryPolaritySchema, MemoryScopeSchema } from './enums';

/**
 * DeskMemory — REST shapes for what the agent has learned and what the operator
 * has told it.
 *
 *   • scope    — ENTITY | PATTERN | PLAYBOOK
 *   • polarity — REINFORCE | CORRECT
 *
 * `authoredByUserId IS NOT NULL` distinguishes operator-authored playbook rules
 * from LLM-extracted memories.
 */

export const MemoryRecordSchema = z.object({
  id: z.string().uuid(),
  agentKey: AgentKeySchema,
  scope: MemoryScopeSchema,
  polarity: MemoryPolaritySchema,
  content: z.string(),
  sourceEpisodeId: z.string().uuid().nullable(),
  entityRef: z.record(z.unknown()).nullable(),
  entityPredicate: z.record(z.unknown()).nullable(),
  authoredByUserId: z.number().int().nullable(),
  isActive: z.boolean(),
  isPinned: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  expiresAt: z.string().datetime().nullable(),
});
export type MemoryRecord = z.infer<typeof MemoryRecordSchema>;

// ─── List query ──────────────────────────────────────────────────────────────

/**
 * Coerce a query-string boolean. `z.coerce.boolean()` uses JS truthiness, which
 * means the literal string `"false"` becomes `true` — wrong for HTTP query
 * params. We accept the standard truthy/falsy string set explicitly.
 */
const QueryBooleanSchema = z.preprocess((v) => {
  if (typeof v !== 'string') return v;
  const norm = v.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(norm)) return true;
  if (['false', '0', 'no', 'off', ''].includes(norm)) return false;
  return v;
}, z.boolean());

export const ListMemoriesQuerySchema = z.object({
  agentKey: AgentKeySchema.optional(),
  scope: MemoryScopeSchema.optional(),
  polarity: MemoryPolaritySchema.optional(),
  authoredByOperatorOnly: QueryBooleanSchema.optional(),
  sourceEpisodeId: z.string().uuid().optional(),
  activeOnly: QueryBooleanSchema.optional().default(true),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});
export type ListMemoriesQuery = z.infer<typeof ListMemoriesQuerySchema>;

export const ListMemoriesResponseSchema = z.object({
  rows: z.array(MemoryRecordSchema),
});
export type ListMemoriesResponse = z.infer<typeof ListMemoriesResponseSchema>;

// ─── Update ──────────────────────────────────────────────────────────────────

export const UpdateMemoryRequestSchema = z
  .object({
    content: z.string().min(1).max(4000).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field required',
  });
export type UpdateMemoryRequest = z.infer<typeof UpdateMemoryRequestSchema>;

// ─── Pin toggle ──────────────────────────────────────────────────────────────

export const SetMemoryPinnedRequestSchema = z.object({
  isPinned: z.boolean(),
});
export type SetMemoryPinnedRequest = z.infer<typeof SetMemoryPinnedRequestSchema>;

// ─── Add a rule (operator-authored playbook) ─────────────────────────────────

export const AddPlaybookRuleRequestSchema = z.object({
  agentKey: AgentKeySchema,
  content: z.string().min(1).max(2000),
});
export type AddPlaybookRuleRequest = z.infer<typeof AddPlaybookRuleRequestSchema>;

// ─── LLM memory-extract output schema ────────────────────────────────────────

export const MemoryExtractSchema = z.object({
  content: z.string().min(1).max(280),
});
export type MemoryExtract = z.infer<typeof MemoryExtractSchema>;

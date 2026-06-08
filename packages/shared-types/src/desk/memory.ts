import { z } from 'zod';
import { AgentKeySchema, MemoryPolaritySchema, MemoryScopeSchema } from './enums';

/**
 * DeskMemory — REST shapes for what Sally has learned and what the
 * operator has told her.
 *
 * Two dimensions:
 *   • scope    — ENTITY (subject-specific) | PATTERN (subject-class) | PLAYBOOK (agent-wide rule)
 *   • polarity — REINFORCE | CORRECT
 *
 * `authoredByUserId IS NOT NULL` distinguishes operator-authored playbook
 * rules (Rules tab) from LLM-extracted memories (Memory tab). Two
 * affordances on the same underlying table because the discriminator is
 * unambiguous.
 *
 * `entityRef` carries the structural pointer for entity-scoped memories
 * (e.g. `{ customerId: '42', invoiceNumber: 'INV-1' }`).
 * `entityPredicate` is reserved for future pattern-scoped memories that
 * carry a structured predicate; opaque JSON for now.
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

// ─── List query ─────────────────────────────────────────────────────────

/**
 * Coerce a query-string boolean. `z.coerce.boolean()` uses JS truthiness,
 * which means the literal string `"false"` becomes `true` — wrong for HTTP
 * query params. We accept the standard truthy/falsy string set explicitly.
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
  /**
   * Drives the Rules-tab vs. Memory-tab split:
   *   • true  → only operator-authored rows (`authoredByUserId IS NOT NULL`)
   *   • false → only LLM-extracted rows      (`authoredByUserId IS NULL`)
   *   • omit  → no filter (admin / debug views)
   */
  authoredByOperatorOnly: QueryBooleanSchema.optional(),
  /**
   * When provided, scopes the list to memories written from the given
   * episode — used by the Handled-mode sheet's "Sally learned from this"
   * card.
   */
  sourceEpisodeId: z.string().uuid().optional(),
  activeOnly: QueryBooleanSchema.optional().default(true),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});
export type ListMemoriesQuery = z.infer<typeof ListMemoriesQuerySchema>;

export const ListMemoriesResponseSchema = z.object({
  rows: z.array(MemoryRecordSchema),
});
export type ListMemoriesResponse = z.infer<typeof ListMemoriesResponseSchema>;

// ─── Update ─────────────────────────────────────────────────────────────
//
// Editable in-place ONLY for operator-authored playbook rows; the
// controller enforces this via `authoredByUserId IS NOT NULL`. UI hides
// the Edit button on LLM-extracted memory cards (Memory tab).

export const UpdateMemoryRequestSchema = z
  .object({
    content: z.string().min(1).max(4000).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field required',
  });
export type UpdateMemoryRequest = z.infer<typeof UpdateMemoryRequestSchema>;

// ─── Pin toggle ─────────────────────────────────────────────────────────
// Pinned memories are exempt from auto-decay in the reinforcer.

export const SetMemoryPinnedRequestSchema = z.object({
  isPinned: z.boolean(),
});
export type SetMemoryPinnedRequest = z.infer<typeof SetMemoryPinnedRequestSchema>;

// ─── Add a rule (operator-authored playbook) ────────────────────────────
// Posted by the Rules tab "Add a rule" form. Skips LLM extract; content
// goes in verbatim.

export const AddPlaybookRuleRequestSchema = z.object({
  agentKey: AgentKeySchema,
  content: z.string().min(1).max(2000),
});
export type AddPlaybookRuleRequest = z.infer<typeof AddPlaybookRuleRequestSchema>;

// ─── LLM memory-extract output schema ───────────────────────────────────
// Shared between the writer service and the LangFuse-tracked extraction
// prompt so both speak the same contract.

export const MemoryExtractSchema = z.object({
  content: z.string().min(1).max(280),
});
export type MemoryExtract = z.infer<typeof MemoryExtractSchema>;

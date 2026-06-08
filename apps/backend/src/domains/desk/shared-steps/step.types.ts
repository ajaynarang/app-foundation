import type { MemoryPolarity, MemoryScope } from '@prisma/client';

/**
 * Generic I/O shapes for the shared Desk step engine (gate / execute /
 * close) plus the small primitives every responsibility's own hydrate step
 * reuses. Responsibility-SPECIFIC shapes (e.g. AR's invoice entity, the
 * perceive/decide/draft payloads) live in that responsibility's own
 * `step.types.ts` — never here, so the shared engine stays job-blind and a
 * new responsibility never edits this file.
 */

// ─── Shared hydrate primitives ──────────────────────────────────────────
// Reused by each responsibility's own HydrateOutput so memory + preflight
// are shaped identically across responsibilities. The shared engine itself
// does not depend on these.

export interface HydrateMemoryItem {
  id: string;
  scope: MemoryScope;
  polarity: MemoryPolarity;
  content: string;
  confidence: number;
  createdAt: string;
}

export interface HydratePreflightResult {
  action: 'proceed' | 'skip' | 'abort';
  outcome?: string;
  reason?: string;
}

/**
 * The only part of a responsibility's hydrate output the shared engine
 * reads. Each responsibility's own `HydrateOutput` is assignable to this
 * (it names its counterparty keys on `relationshipRef`). The gate + close
 * steps type the persisted hydrate row as this — never a per-responsibility
 * shape — so they stay job-blind.
 */
export interface SharedHydrateOutput {
  /**
   * Generic counterparty keys a responsibility names on its own hydrate
   * output so the shared close step can fold them into the memory entityRef
   * (e.g. AR keys `{ customerId }`, settlement keys `{ driverId }`). The
   * close step copies whatever is provided without knowing the entity shape.
   */
  relationshipRef?: Record<string, string>;
}

// ─── Gate ───────────────────────────────────────────────────────────────
/**
 * Gate step returns enough for the workflow to branch on + for the
 * approval service to create the approval row, keyed to the step.
 */
export interface GateStepOutput {
  needsApproval: boolean;
  approvalId?: string; // set iff needsApproval
  rule: string;
}

// ─── Execute ────────────────────────────────────────────────────────────
export interface ExecuteInput {
  episodeId: string;
  tool: string; // MCP tool name (looked up via ScopeRegistry)
  args: Record<string, unknown>;
}

export interface ExecuteOutput {
  toolResult: Record<string, unknown>;
}

// ─── Close ──────────────────────────────────────────────────────────────
/**
 * Closing transition — caller-supplied. close.step does not infer this
 * from the outcome string because two transitions can share an outcome
 * (followup_sent can come from auto_send OR approve_unchanged OR
 * approve_edited). Only the caller knows which it was.
 *
 * Tool / LLM errors are deliberately absent — they go through `failed`
 * terminalStatus without a transition (writer no-ops).
 */
export type CloseTransition =
  | 'no_action'
  | 'auto_send'
  | 'approve_unchanged'
  | 'approve_edited'
  | 'reject'
  | 'reject_and_close'
  | 'approval_expired'
  | 'snooze';

export interface CloseInput {
  episodeId: string;
  outcome: string; // a DeskOutcome value — see core/outcomes
  outcomeNote?: string;
  terminalStatus?: 'RESOLVED' | 'ESCALATED' | 'FAILED' | 'REJECTED_BY_OPERATOR' | 'CANCELLED' | 'EXPIRED';
  /**
   * Closing transition — drives memory writer + reinforcer. Optional
   * to keep failure paths (tool/llm errors) backwards-compatible; they
   * close without a transition and the writer no-ops.
   */
  transition?: CloseTransition;
}

export interface CloseOutput {
  episodeId: string;
  outcome: string;
  closedAt: string;
}

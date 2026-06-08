import type { CloseInput } from './step.types';

/**
 * Canonical Desk episode outcome vocabulary — the single source of truth for
 * every `outcome` string passed to `closeStep`. Referenced by the shared
 * close step (for the default terminal-status mapping) and by every
 * responsibility's workflow/hydrate steps. Use these consts instead of bare
 * string literals so a typo is a compile error, not a silent fallthrough.
 *
 * Grouped by origin:
 *   - SHARED: produced by the engine or reused across responsibilities.
 *   - Per-responsibility: produced only by that responsibility's workflow.
 */
export const DESK_OUTCOMES = {
  // ── Shared (engine + cross-responsibility) ──────────────────────────
  NO_ACTION_NEEDED: 'no_action_needed',
  ESCALATED_TO_HUMAN: 'escalated_to_human',
  APPROVAL_EXPIRED: 'approval_expired',
  REJECTED_BY_OPERATOR: 'rejected_by_operator',
  PREFLIGHT_ABORTED: 'preflight_aborted',
  PREFLIGHT_SKIPPED: 'preflight_skipped',
  FAILED: 'failed',

  // ── Generic success ─────────────────────────────────────────────────
  // The `outcome` column is free-form VarChar — each responsibility declares
  // its own terminal outcome strings. Add yours here so a typo is a compile
  // error, not a silent fallthrough.
  COMPLETED: 'completed',
} as const;

export type DeskOutcome = (typeof DESK_OUTCOMES)[keyof typeof DESK_OUTCOMES];

/**
 * Default `outcome → terminalStatus` mapping the close step applies when the
 * caller doesn't pass an explicit `terminalStatus`. Anything not listed here
 * resolves to the close step's `'RESOLVED'` fallback — so a responsibility
 * that needs a non-RESOLVED terminal status (e.g. an ESCALATED admin
 * hand-off) MUST pass `terminalStatus` explicitly at the close call site.
 *
 * Kept intentionally identical to the original tight map: only the outcomes
 * that are unambiguously one terminal status across every responsibility
 * live here; per-responsibility outcomes (invoice_drafted, reminder_sent,
 * settlement_approved, …) pass their status explicitly or take the default.
 */
export const TERMINAL_STATUS_BY_OUTCOME: Partial<Record<DeskOutcome, CloseInput['terminalStatus']>> = {
  [DESK_OUTCOMES.COMPLETED]: 'RESOLVED',
  [DESK_OUTCOMES.NO_ACTION_NEEDED]: 'RESOLVED',
  [DESK_OUTCOMES.ESCALATED_TO_HUMAN]: 'ESCALATED',
  [DESK_OUTCOMES.REJECTED_BY_OPERATOR]: 'REJECTED_BY_OPERATOR',
  [DESK_OUTCOMES.APPROVAL_EXPIRED]: 'EXPIRED',
  [DESK_OUTCOMES.PREFLIGHT_SKIPPED]: 'RESOLVED',
  [DESK_OUTCOMES.PREFLIGHT_ABORTED]: 'RESOLVED',
};

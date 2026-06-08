import type { ApprovalDecision } from '@sally/shared-types';

/**
 * 6-state human-decision pill (D5) — the single source of truth for how
 * we translate `(humanDecision, outcome, activeSuppression)` into the
 * chip label and tone. Used by both the Handled-page row and the
 * Handled-mode sheet header so the UI agrees in one place.
 *
 * Precedence (first match wins):
 *   1. activeSuppression      → "Snoozed"
 *   2. outcome = approval_expired → "Expired"
 *   3. humanDecision          → "Rejected" | "Edited" | "Approved"
 *   4. fallback               → "Autonomous" (Sally ran without asking)
 */
export type HandledPillState = 'Autonomous' | 'Approved' | 'Edited' | 'Rejected' | 'Snoozed' | 'Expired';

export interface DerivePillInput {
  humanDecision: ApprovalDecision | null;
  outcome: string;
  /**
   * Populated when a live entity-suppression targets this episode's
   * entity. Task 12 wires the real data; Task 7 passes `null` from the
   * sheet (Handled page rows already pass the real value).
   */
  activeSuppression: { suppressUntil: string | null } | null;
}

export function derivePill(input: DerivePillInput): HandledPillState {
  if (input.activeSuppression) return 'Snoozed';
  if (input.outcome === 'approval_expired') return 'Expired';
  if (input.humanDecision === 'REJECTED') return 'Rejected';
  if (input.humanDecision === 'EDITED') return 'Edited';
  if (input.humanDecision === 'APPROVED') return 'Approved';
  return 'Autonomous';
}

/**
 * Tone classes (Tailwind, dark-mode-safe). Approved + Edited both read
 * as success — EDITED is the learning-signal but both were net-positive
 * decisions for the customer.
 */
export const PILL_TONE: Record<HandledPillState, string> = {
  Autonomous: 'bg-muted text-muted-foreground',
  Approved: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  Edited: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  Rejected: 'bg-destructive/15 text-destructive',
  Snoozed: 'bg-caution/15 text-caution',
  Expired: 'bg-muted text-muted-foreground',
};

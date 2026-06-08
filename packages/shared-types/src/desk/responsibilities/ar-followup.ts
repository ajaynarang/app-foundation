import { z } from 'zod';
import type { ConditionsUISpec } from '../responsibility';

/**
 * AR Follow-up responsibility — types shared between backend, worker, and UI.
 *
 * Owned by sally-billing. Scans overdue invoices and drafts friendly reminder
 * emails. See .docs/plans/06-sally-ai/2026-04-20-desk-architecture-v3.md.
 */

// ─── User-editable conditions (hard rules) ──────────────────────────────

export const ArFollowupConditionsSchema = z.object({
  /** Auto-proceed only when the invoice amount is at or below this cap. */
  maxAmountUsd: z.number().positive().optional(),

  /** Auto-proceed only on the first reminder for a given invoice. */
  firstReminderOnly: z.boolean().optional(),

  /** Always gate (request approval) for these customer IDs. */
  excludeCustomerIds: z.array(z.string()).optional(),
});
export type ArFollowupConditions = z.infer<typeof ArFollowupConditionsSchema>;

/** Settings-page UI spec — rendered by the responsibility settings page. */
export const ArFollowupConditionsUI: ConditionsUISpec = {
  fields: [
    {
      key: 'maxAmountUsd',
      label: 'Auto when invoice amount is at most',
      control: 'currency',
      placeholder: '2000',
      helpText: 'Leave empty for no cap. Sally will ask for approval on larger invoices.',
    },
    {
      key: 'firstReminderOnly',
      label: 'Only auto for first reminder',
      control: 'checkbox',
      helpText: 'Second and later reminders will always require approval.',
      default: true,
    },
    {
      key: 'excludeCustomerIds',
      label: 'Always ask for these customers',
      control: 'customer-multiselect',
      helpText: 'Sally will request approval for every invoice from these customers, regardless of amount.',
    },
  ],
};

// ─── Voice schemas (per LLM step) ───────────────────────────────────────

/** Perceive — understand the current invoice state. */
export const ArFollowupPerceiveSchema = z.object({
  invoiceState: z.enum([
    'current',
    'approaching_due',
    'past_due_1_30',
    'past_due_30_60',
    'past_due_60_90',
    'severely_overdue',
    'disputed',
    'paid',
  ]),
  daysFromDue: z.number().int(),
  lastContact: z.object({
    kind: z.enum(['none', 'email_sent', 'email_received', 'call_logged']),
    daysAgo: z.number().int().nullable(),
  }),
  paymentHistorySignal: z.enum(['reliable', 'slow_but_pays', 'inconsistent', 'risky']),
  promiseToPayOnFile: z.object({
    exists: z.boolean(),
    dueDate: z.string().nullable(),
    broken: z.boolean(),
  }),
  summary: z.string(),
  // NOTE: Anthropic's structured-output endpoint rejects `minimum`/`maximum`
  // on number fields, so we describe confidence in prose and let the prompt
  // enforce the 0..1 range. Keep this as plain z.number() everywhere below.
  confidence: z.number(),
});
export type ArFollowupPerceive = z.infer<typeof ArFollowupPerceiveSchema>;

/** Decide — pick the action. */
export const ArFollowupDecideSchema = z.object({
  action: z.enum(['send_reminder', 'record_promise', 'escalate', 'no_action']),
  reasoning: z.string(),
  tone: z.enum(['friendly', 'firm', 'escalation']).optional(),
  urgency: z.enum(['low', 'normal', 'high']).optional(),

  /** Tool args for record_promise / escalate branches (no separate draft step). */
  plannedArgs: z.record(z.unknown()).optional(),

  confidence: z.number(),
});
export type ArFollowupDecide = z.infer<typeof ArFollowupDecideSchema>;

/** Draft — the email artifact. */
export const ArFollowupDraftSchema = z.object({
  to: z.string(),
  subject: z.string(),
  body: z.string(),
  toneUsed: z.enum(['friendly', 'firm', 'escalation']),
  mentionsAmount: z.boolean(),
  mentionsDueDate: z.boolean(),
  confidence: z.number(),
});
export type ArFollowupDraft = z.infer<typeof ArFollowupDraftSchema>;

// ─── Outcomes (AR-specific) ─────────────────────────────────────────────

export const AR_FOLLOWUP_OUTCOMES = [
  'followup_sent',
  'promise_recorded',
  'escalated_to_human',
  'no_action_needed',
  'rejected_by_operator',
  'preflight_skipped',
  'preflight_aborted',
  'approval_expired',
] as const;
export type ArFollowupOutcome = (typeof AR_FOLLOWUP_OUTCOMES)[number];

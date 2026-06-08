import { z } from 'zod';
import type { ConditionsUISpec } from '../responsibility';

/**
 * Closeout Review responsibility — types shared between backend, worker, and UI.
 *
 * Owned by sally-billing. Scans loads delivered 48h+ ago that never got an
 * invoice and, when the load is genuinely billable, drafts a DRAFT invoice
 * for human approval. When the load is blocked (no customer, no billable
 * charges, missing POD / rate-con) it does no_action and flags the gap
 * rather than generating a wrong invoice.
 *
 * See .docs/plans/06-sally-ai/2026-05-21-desk-closeout-review-design.md.
 */

// ─── Defaults ───────────────────────────────────────────────────────────

/** Default minimum hours since delivery before a load is swept. A load must
 *  sit un-invoiced this long before Closeout Review opens an episode for it. */
export const CLOSEOUT_REVIEW_DEFAULT_MIN_HOURS = 48;

// ─── User-editable conditions (hard rules) ──────────────────────────────

export const CloseoutReviewConditionsSchema = z.object({
  /** Only catch loads delivered at least this many hours ago. */
  minHoursSinceDelivery: z.number().positive().optional(),

  /** Never open an episode for loads belonging to these customer IDs. */
  excludeCustomerIds: z.array(z.string()).optional(),

  /** Auto-proceed only when the billable total is at or above this floor. */
  minChargeUsd: z.number().positive().optional(),

  /** Auto-proceed only when the billable total is at or below this cap. */
  maxChargeUsd: z.number().positive().optional(),
});
export type CloseoutReviewConditions = z.infer<typeof CloseoutReviewConditionsSchema>;

/** Settings-page UI spec — rendered by the responsibility settings page. */
export const CloseoutReviewConditionsUI: ConditionsUISpec = {
  fields: [
    {
      key: 'minHoursSinceDelivery',
      label: 'Catch loads delivered at least this many hours ago',
      control: 'number',
      helpText: 'Leave empty to use the default of 48 hours. Lower values catch loads sooner.',
      min: 1,
    },
    {
      key: 'minChargeUsd',
      label: 'Auto only when billable total is at least',
      control: 'currency',
      placeholder: '100',
      helpText: 'Leave empty for no floor. Sally will ask for approval on smaller invoices.',
    },
    {
      key: 'maxChargeUsd',
      label: 'Auto only when billable total is at most',
      control: 'currency',
      placeholder: '10000',
      helpText: 'Leave empty for no cap. Sally will ask for approval on larger invoices.',
    },
    {
      key: 'excludeCustomerIds',
      label: 'Always ask for these customers',
      control: 'customer-multiselect',
      helpText: 'Sally will request approval for every load from these customers, regardless of amount.',
    },
  ],
};

// ─── Voice schemas (per LLM step) ───────────────────────────────────────

/** Perceive — understand the current billing state of a delivered load. */
export const CloseoutReviewPerceiveSchema = z.object({
  billingState: z.enum([
    'billable',
    'blocked_no_charges',
    'blocked_missing_documents',
    'blocked_not_approved',
    'blocked_other',
  ]),
  hoursSinceDelivery: z.number().int(),
  hasBillableCharges: z.boolean(),
  blockers: z.array(z.string()),
  summary: z.string(),
  // NOTE: Anthropic's structured-output endpoint rejects `minimum`/`maximum`
  // on number fields, so we describe confidence in prose and let the prompt
  // enforce the 0..1 range. Keep this as plain z.number() everywhere below.
  confidence: z.number(),
});
export type CloseoutReviewPerceive = z.infer<typeof CloseoutReviewPerceiveSchema>;

/** Decide — draft the invoice or stand down. */
export const CloseoutReviewDecideSchema = z.object({
  action: z.enum(['draft_invoice', 'no_action']),
  reasoning: z.string(),
  /** Why we are NOT drafting (set when action === 'no_action'). */
  blockerReason: z.string().optional(),
  confidence: z.number(),
});
export type CloseoutReviewDecide = z.infer<typeof CloseoutReviewDecideSchema>;

/** Draft — the invoice-preview artifact for the approval sheet. */
export const CloseoutReviewDraftLineItemSchema = z.object({
  description: z.string(),
  quantity: z.number(),
  unitPriceDollars: z.number(),
  totalDollars: z.number(),
});
export type CloseoutReviewDraftLineItem = z.infer<typeof CloseoutReviewDraftLineItemSchema>;

export const CloseoutReviewDraftSchema = z.object({
  customerName: z.string(),
  totalDollars: z.number(),
  lineItems: z.array(CloseoutReviewDraftLineItemSchema),
  summary: z.string(),
  confidence: z.number(),
});
export type CloseoutReviewDraft = z.infer<typeof CloseoutReviewDraftSchema>;

// ─── Outcomes (closeout-specific) ───────────────────────────────────────

export const CLOSEOUT_REVIEW_OUTCOMES = [
  'invoice_drafted',
  'no_action_needed',
  'rejected_by_operator',
  'escalated_to_human',
  'preflight_skipped',
  'preflight_aborted',
  'approval_expired',
] as const;
export type CloseoutReviewOutcome = (typeof CLOSEOUT_REVIEW_OUTCOMES)[number];

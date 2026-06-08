import { z } from 'zod';
import { ApprovalDecisionSchema } from './enums';

/**
 * DeskApproval REST shape.
 * Consumed by the Desk overview (pending queue) and approval decision sheet.
 */

// ─── Approval artifact (two-axis model) ─────────────────────────────────
//
// Every pending approval presents an *artifact* — the thing Sally built for
// the operator to approve. Three shapes cover every responsibility:
//
//   • 'email'     → purpose-built renderer for From/To/Subject/Body
//   • 'message'   → channel-aware outbound message (SMS or email) for
//                   responsibilities that can pick a channel at runtime
//                   (e.g. document_expiry reminders to a driver/admin)
//   • 'diff'      → before/after field comparison (e.g. payroll adjustment)
//   • 'composite' → universal block-stream fallback (field / body / list /
//                   flag / keyvalue / link) any new responsibility can ship
//                   without touching the frontend
//
// The decision action set is identical across all three:
//   Approve · Edit & approve · Reject (terminates the episode).

const ApprovalFlagSchema = z.object({
  variant: z.enum(['info', 'warn', 'critical']),
  text: z.string(),
});
export type ApprovalFlag = z.infer<typeof ApprovalFlagSchema>;

export const ApprovalArtifactBlockSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('field'),
    label: z.string(),
    value: z.string(),
    mono: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('body'),
    format: z.enum(['text', 'markdown']),
    content: z.string(),
  }),
  z.object({
    type: z.literal('list'),
    label: z.string().optional(),
    items: z.array(z.string()),
  }),
  z.object({
    type: z.literal('flag'),
    variant: z.enum(['info', 'warn', 'critical']),
    text: z.string(),
  }),
  z.object({
    type: z.literal('keyvalue'),
    label: z.string(),
    value: z.string(),
    hint: z.string().optional(),
  }),
  z.object({
    type: z.literal('link'),
    href: z.string(),
    label: z.string(),
    external: z.boolean().optional(),
  }),
]);
export type ApprovalArtifactBlock = z.infer<typeof ApprovalArtifactBlockSchema>;

export const ApprovalArtifactSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('email'),
    to: z.string(),
    subject: z.string(),
    body: z.string(),
    flags: z.array(ApprovalFlagSchema).optional(),
  }),
  z.object({
    kind: z.literal('message'),
    /** Outbound channel for this reminder. */
    channel: z.enum(['sms', 'email', 'both']),
    /** Resolved recipient — email address and/or E.164 phone. */
    to: z.string(),
    /** Email subject, present when the channel includes email. */
    subject: z.string().nullable().optional(),
    /** The message body shown to the operator (email body or SMS text). */
    body: z.string(),
    flags: z.array(ApprovalFlagSchema).optional(),
  }),
  z.object({
    kind: z.literal('diff'),
    before: z.record(z.unknown()),
    after: z.record(z.unknown()),
    summary: z.string().optional(),
    flags: z.array(ApprovalFlagSchema).optional(),
  }),
  z.object({
    kind: z.literal('composite'),
    summary: z.string().optional(),
    blocks: z.array(ApprovalArtifactBlockSchema),
  }),
]);
export type ApprovalArtifact = z.infer<typeof ApprovalArtifactSchema>;

// ─── Decision presentation payload ──────────────────────────────────────
//
// These four optional fields are what the canonical approval sheet renders
// above the artifact. Computed by the per-responsibility approval adapter
// at gate time and stored on the approval record so the audit trail
// preserves exactly what the human saw when they made the call.

export const ApprovalDecisionHeaderSchema = z.object({
  /** Emoji or lucide-icon name. */
  icon: z.string().optional(),
  /** "Send reminder to Granite State Lumber" */
  title: z.string(),
  /** "Invoice NL-INV-1015 · $968.00 · 47 days overdue" */
  entityMeta: z.string(),
});
export type ApprovalDecisionHeader = z.infer<typeof ApprovalDecisionHeaderSchema>;

export const ApprovalRecordSchema = z.object({
  id: z.string().uuid(),
  episodeId: z.string().uuid(),
  stepId: z.string().uuid(),

  requestedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  proposedAction: z.record(z.unknown()),

  claimedByUserId: z.number().int().positive().nullable(),
  claimedAt: z.string().datetime().nullable(),

  decision: ApprovalDecisionSchema.nullable(),
  decidedByUserId: z.number().int().positive().nullable(),
  decidedAt: z.string().datetime().nullable(),
  editedAction: z.record(z.unknown()).nullable(),
  rejectionReason: z.string().nullable(),
  terminateEpisode: z.boolean(),

  // Canonical decision-sheet payload (T23). Null on older rows written
  // before the adapter shipped; UI must treat absent fields as "unknown"
  // and render graceful defaults.
  artifact: ApprovalArtifactSchema.nullable().optional(),
  decisionHeader: ApprovalDecisionHeaderSchema.nullable().optional(),
  /** Sally's one-line italic read rendered above the artifact. */
  sallysRead: z.string().nullable().optional(),
  /** Up to 3 bullet strings rendered inside the "How Sally got here" disclosure. */
  context: z.array(z.string()).nullable().optional(),
  /** 0..1 — drives the confidence bar in the disclosure. */
  confidence: z.number().min(0).max(1).nullable().optional(),
});
export type ApprovalRecord = z.infer<typeof ApprovalRecordSchema>;

// ─── Decide endpoint payload ────────────────────────────────────────────
//
// Three canonical UI buttons — same words for every approval, every
// responsibility, every artifact type:
//   • Approve         → { decision: APPROVED }
//   • Edit & approve  → { decision: EDITED, editedAction }
//   • Reject          → { decision: REJECTED, rejectionReason, terminate: true }
//
// `terminate` remains on the wire for backwards compatibility with older
// flows (and with auto-expire, which rejects without an operator). Rejects
// from the canonical sheet always pass terminate=true.

export const DecideApprovalRequestSchema = z
  .object({
    decision: ApprovalDecisionSchema,
    editedAction: z.record(z.unknown()).optional(),
    rejectionReason: z.string().max(2000).optional(),
    terminate: z.boolean().default(false),
  })
  .superRefine((val, ctx) => {
    if (val.decision === 'EDITED' && !val.editedAction) {
      ctx.addIssue({ code: 'custom', message: 'editedAction required when decision=EDITED', path: ['editedAction'] });
    }
    if (val.decision === 'REJECTED' && !val.rejectionReason) {
      ctx.addIssue({
        code: 'custom',
        message: 'rejectionReason required when decision=REJECTED',
        path: ['rejectionReason'],
      });
    }
    if (val.terminate && val.decision !== 'REJECTED') {
      ctx.addIssue({ code: 'custom', message: 'terminate=true requires decision=REJECTED', path: ['terminate'] });
    }
  });
export type DecideApprovalRequest = z.infer<typeof DecideApprovalRequestSchema>;

// ─── Claim endpoint ─────────────────────────────────────────────────────

export const ClaimApprovalResponseSchema = z.object({
  claimedByUserId: z.number().int().positive(),
  claimedAt: z.string().datetime(),
});
export type ClaimApprovalResponse = z.infer<typeof ClaimApprovalResponseSchema>;

// ─── Queue view (GET /desk/approvals) ───────────────────────────────────
// Richer than ApprovalRecord — includes the parent episode's entity +
// responsibility so the dispatcher can triage without clicking in.

export const PendingApprovalListItemSchema = ApprovalRecordSchema.extend({
  episode: z.object({
    id: z.string().uuid(),
    entityType: z.string().nullable(),
    entityId: z.string().nullable(),
    entityLabel: z.string().nullable(),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
    responsibility: z.object({
      key: z.string(),
      title: z.string(),
    }),
  }),
});
export type PendingApprovalListItem = z.infer<typeof PendingApprovalListItemSchema>;

// ─── Scope filter (Mine vs All) ─────────────────────────────────────────
// Default per role: DISPATCHER → 'mine', OWNER/ADMIN/SUPER_ADMIN → 'all'.

export const APPROVAL_SCOPES = ['mine', 'all'] as const;
export const ApprovalScopeSchema = z.enum(APPROVAL_SCOPES);
export type ApprovalScope = z.infer<typeof ApprovalScopeSchema>;

export const ListApprovalsQuerySchema = z.object({
  scope: ApprovalScopeSchema.optional(),
});
export type ListApprovalsQuery = z.infer<typeof ListApprovalsQuerySchema>;

// ─── Handoff counts (Mine/All × waiting/escalated + Handled rollups) ────
//
// Backs the 3-tab Desk shell. Needs You tab reads mine/all (waiting +
// escalated); Handled tab reads handled.today + handled.last7d. Six
// integer aggregates in one round trip — tenant-local midnight via
// Luxon on the backend. 30s staleTime. See design spec §2.

export const HandoffCountsSchema = z.object({
  mine: z.object({
    waiting: z.number().int().nonnegative(),
    escalated: z.number().int().nonnegative(),
  }),
  all: z.object({
    waiting: z.number().int().nonnegative(),
    escalated: z.number().int().nonnegative(),
  }),
  handled: z.object({
    today: z.object({
      mine: z.number().int().nonnegative(),
      all: z.number().int().nonnegative(),
    }),
    last7d: z.object({
      mine: z.number().int().nonnegative(),
      all: z.number().int().nonnegative(),
    }),
  }),
});
export type HandoffCounts = z.infer<typeof HandoffCountsSchema>;

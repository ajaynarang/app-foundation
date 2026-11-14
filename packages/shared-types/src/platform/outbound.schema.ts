import { z } from 'zod';
import { OutboundAllowKindSchema, type OutboundAllowKind } from '../generated/prisma-enums';
import { cursorListSchema, type CursorList } from '../infrastructure/cursor-list';

// ─── Outbound gate (ADR "Outbound gate") — the super-admin Outbound page ─────────────────────

export { OutboundAllowKindSchema };
export type { OutboundAllowKind };

/** `live` sends to everyone (production); `allowlist` sends only to the allow-list (every other environment). */
export const OutboundModeSchema = z.enum(['live', 'allowlist']);
export type OutboundMode = z.infer<typeof OutboundModeSchema>;

/**
 * The channel a held-back send was for. Mirrors the kernel's `OUTBOUND_CHANNEL` (the `app_outbound_failed{channel}`
 * vocabulary), which the backend writes on every row.
 */
export const OutboundChannelSchema = z.enum(['email', 'sms', 'push', 'whatsapp', 'webhook']);
export type OutboundChannel = z.infer<typeof OutboundChannelSchema>;

/** `GET /super-admin/outbound/status` */
export const OutboundStatusSchema = z.object({
  mode: OutboundModeSchema,
  isLive: z.boolean(),
  /** The observability environment name (`ENV_TYPE` mapped): production, staging or development. */
  environment: z.enum(['production', 'staging', 'development', 'unknown']),
  /** How many entries `OUTBOUND_ALLOWLIST_BOOTSTRAP` adds. The values stay in the environment. */
  bootstrapEntries: z.number().int().min(0),
});
export type OutboundStatus = z.infer<typeof OutboundStatusSchema>;

/** One allow-list entry. `id` is its public id (uuid); the author is named by public `userId`. */
export const OutboundAllowEntrySchema = z.object({
  id: z.string(),
  kind: OutboundAllowKindSchema,
  value: z.string(),
  note: z.string().nullable(),
  createdAt: z.string(),
  createdBy: z
    .object({
      userId: z.string(),
      email: z.string().nullable(),
      firstName: z.string().nullable(),
      lastName: z.string().nullable(),
    })
    .nullable(),
});
export type OutboundAllowEntry = z.infer<typeof OutboundAllowEntrySchema>;

/** `POST /super-admin/outbound/allow-list` */
export const CreateOutboundAllowEntrySchema = z.object({
  kind: OutboundAllowKindSchema,
  value: z.string().min(1).max(255),
  note: z.string().max(200).optional(),
});
export type CreateOutboundAllowEntryInput = z.infer<typeof CreateOutboundAllowEntrySchema>;

/**
 * One send the gate held back that has no delivery-ledger row. The recipient is masked and the subject is a redacted
 * preview (codes and links removed). The tenant is named by its public `tenantId`.
 */
export const OutboundSuppressionSchema = z.object({
  id: z.string(),
  channel: OutboundChannelSchema,
  recipient: z.string(),
  subject: z.string().nullable(),
  source: z.string(),
  createdAt: z.string(),
  tenant: z.object({ tenantId: z.string(), companyName: z.string() }).nullable(),
});
export type OutboundSuppression = z.infer<typeof OutboundSuppressionSchema>;

export const OutboundSuppressionListSchema = cursorListSchema(OutboundSuppressionSchema);
/** `GET /super-admin/outbound/held-back` — newest first. */
export type OutboundSuppressionList = CursorList<OutboundSuppression>;

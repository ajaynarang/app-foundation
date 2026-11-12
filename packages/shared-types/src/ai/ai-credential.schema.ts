import { z } from 'zod';
import { AiCredentialStatusSchema, AiCredentialTypeSchema } from '../generated/prisma-enums';

/** A workspace's AI retention policy as the API speaks it (`Tenant.aiZeroRetention`). `ZDR` is zero data retention. */
export const AiRetentionPolicySchema = z.enum(['STANDARD', 'ZDR']);
export type AiRetentionPolicy = z.infer<typeof AiRetentionPolicySchema>;

/** The credential types a workspace connects by pasting a key. An AWS role has its own flow. */
export const PasteKeyCredentialTypeSchema = z.enum(['ANTHROPIC_KEY', 'OPENROUTER_KEY', 'VERCEL_GATEWAY_KEY']);
export type PasteKeyCredentialType = z.infer<typeof PasteKeyCredentialTypeSchema>;

/**
 * One workspace credential as the API shows it. Never the numeric id, the encrypted secret or the AWS external id:
 * `lastFour` is the only trace of the secret, which is never readable again.
 */
export const AiCredentialSummarySchema = z.object({
  publicId: z.string(),
  type: AiCredentialTypeSchema,
  status: AiCredentialStatusSchema,
  priority: z.number().int(),
  lastFour: z.string().nullable(),
  awsRegion: z.string().nullable(),
  roleArn: z.string().nullable(),
  zdrAttested: z.boolean(),
  zdrAttestedAt: z.string().nullable(),
  /** The current retention policy rules this credential out: it is kept but never used, and shown dimmed. */
  inertUnderPolicy: z.boolean(),
  lastValidatedAt: z.string().nullable(),
  /** The provider's reason for the last failed test or credit refusal, with the secret redacted. */
  lastError: z.string().nullable(),
  createdAt: z.string(),
});
export type AiCredentialSummary = z.infer<typeof AiCredentialSummarySchema>;

/**
 * Who pays for a need right now: `platform`, the serving credential's public id, or `none` when the need is blocked
 * (nothing configured, a failing workspace key, or no route the retention policy allows).
 */
export const AiNeedPayersSchema = z.object({
  language: z.string(),
  embedding: z.string(),
});
export type AiNeedPayers = z.infer<typeof AiNeedPayersSchema>;

/** `GET /ai-settings`: the policy, whether this deployment allows workspace keys, who pays per need, and the cards. */
export const AiSettingsSchema = z.object({
  policy: AiRetentionPolicySchema,
  /** False when the operator has not set `AI_CREDENTIALS_KEY`: no key can be connected (existing ones can be removed). */
  byokEnabled: z.boolean(),
  payers: AiNeedPayersSchema,
  credentials: z.array(AiCredentialSummarySchema),
});
export type AiSettings = z.infer<typeof AiSettingsSchema>;

export const UpdateAiPolicyInputSchema = z.object({
  policy: AiRetentionPolicySchema,
});
export type UpdateAiPolicyInput = z.infer<typeof UpdateAiPolicyInputSchema>;

/** `POST /ai-settings/credentials`. */
export const ConnectKeyInputSchema = z.object({
  type: PasteKeyCredentialTypeSchema,
  secret: z.string().min(8).max(4096),
  /** `ANTHROPIC_KEY` only: the owner attests the organisation has a zero-retention agreement with Anthropic. */
  zdrAttested: z.boolean().optional(),
});
export type ConnectKeyInput = z.infer<typeof ConnectKeyInputSchema>;

/** A live test of a credential. `detail` is redacted and safe to show as it is. */
export const ProbeResultSchema = z.object({
  ok: z.boolean(),
  latencyMs: z.number().int(),
  detail: z.string(),
});
export type ProbeResult = z.infer<typeof ProbeResultSchema>;

/** Connect and "Test again" answer with the card and the test's result. */
export const AiCredentialConnectResultSchema = z.object({
  credential: AiCredentialSummarySchema,
  probe: ProbeResultSchema,
});
export type AiCredentialConnectResult = z.infer<typeof AiCredentialConnectResultSchema>;

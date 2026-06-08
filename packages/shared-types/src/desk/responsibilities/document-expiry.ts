import { z } from 'zod';
import type { ConditionsUISpec } from '../responsibility';

/**
 * Document Expiry responsibility — types shared between backend, worker, and UI.
 *
 * Owned by sally-compliance. Acts on Shield's open DRIVERS credential-expiry
 * findings (CDL + medical card in v1): drafts a renewal reminder to the driver
 * (or the admin for CRITICAL/expired credentials), gets it approved, and sends
 * it. Shield is the SENSOR (it detects + scores expiry); this responsibility is
 * the ACTUATOR — it does not re-implement expiry detection.
 *
 * See .docs/plans/06-sally-ai/2026-05-21-desk-document-expiry-design.md.
 */

// ─── Credential types (v1: CDL + medical card) ──────────────────────────
//
// These map 1:1 to the Shield rule-engine regulations the fan-out filters
// on (49 CFR 391.11 = CDL, 49 CFR 391.41 = medical card). Lower-snake by
// design — they are open-set credential identifiers (more added later via
// the conditions filter), not a DB enum. Kept here as the single source of
// truth for both the fan-out discriminator and the conditions UI.

export const DOCUMENT_EXPIRY_CREDENTIAL_TYPES = ['cdl', 'medical_card'] as const;
export const DocumentExpiryCredentialTypeSchema = z.enum(DOCUMENT_EXPIRY_CREDENTIAL_TYPES);
export type DocumentExpiryCredentialType = z.infer<typeof DocumentExpiryCredentialTypeSchema>;

/** Human label per credential — used in drafts, headers, and the UI. */
export const DOCUMENT_EXPIRY_CREDENTIAL_LABELS: Record<DocumentExpiryCredentialType, string> = {
  cdl: 'CDL',
  medical_card: 'Medical card',
};

/**
 * Shield regulation reference → credential type. The fan-out uses this to
 * (a) restrict findings to the v1 credential set and (b) derive the stable
 * `credentialType` used in the dedupe key. Mirrors the regulation strings
 * set by ShieldRuleEngineService.checkDrivers() / checkExpiryDate().
 */
export const DOCUMENT_EXPIRY_REGULATION_TO_CREDENTIAL: Record<string, DocumentExpiryCredentialType> = {
  '49 CFR 391.11': 'cdl',
  '49 CFR 391.41': 'medical_card',
};

// ─── Severity (mirrors ShieldFindingSeverity values we act on) ──────────
// Open findings can be CRITICAL or WARNING; INFO is never actioned.

export const DOCUMENT_EXPIRY_SEVERITIES = ['CRITICAL', 'WARNING'] as const;
export const DocumentExpirySeveritySchema = z.enum(DOCUMENT_EXPIRY_SEVERITIES);
export type DocumentExpirySeverity = z.infer<typeof DocumentExpirySeveritySchema>;

// ─── User-editable conditions (hard rules) ──────────────────────────────

export const DocumentExpiryConditionsSchema = z.object({
  /** Which finding severities Sally acts on. Default both. */
  severities: z.array(DocumentExpirySeveritySchema).optional(),

  /** Which credential types Sally acts on. Default CDL + medical card. */
  credentialTypes: z.array(DocumentExpiryCredentialTypeSchema).optional(),

  /**
   * Only act once a credential is within this many days of expiry. Lets a
   * tenant widen/narrow the reminder window beyond Shield's own thresholds.
   * Expired credentials (dueDate in the past) always act regardless.
   */
  leadDays: z.number().int().positive().optional(),

  /** Never remind for these driver IDs (e.g. a driver already handling it). */
  excludeDriverIds: z.array(z.string()).optional(),
});
export type DocumentExpiryConditions = z.infer<typeof DocumentExpiryConditionsSchema>;

/** Settings-page UI spec — rendered by the responsibility settings page. */
export const DocumentExpiryConditionsUI: ConditionsUISpec = {
  fields: [
    {
      key: 'severities',
      label: 'Act on these severities',
      control: 'enum-multiselect',
      options: [
        { value: 'CRITICAL', label: 'Critical (expired / hauling)' },
        { value: 'WARNING', label: 'Warning (expiring soon)' },
      ],
      helpText: 'Critical credentials route to your admin first; warnings nudge the driver.',
    },
    {
      key: 'credentialTypes',
      label: 'Watch these credentials',
      control: 'enum-multiselect',
      options: [
        { value: 'cdl', label: 'CDL' },
        { value: 'medical_card', label: 'Medical card' },
      ],
      helpText: 'Sally reminds drivers to renew these before they lapse.',
    },
    {
      key: 'leadDays',
      label: 'Remind within this many days of expiry',
      control: 'number',
      min: 1,
      max: 90,
      helpText: 'Leave empty to use Shield’s own windows. Expired credentials always act.',
    },
    {
      key: 'excludeDriverIds',
      label: 'Never remind these drivers',
      control: 'driver-multiselect',
      helpText: 'Mute a driver who is already handling their renewal.',
    },
  ],
};

// ─── Voice schemas (per LLM step) ───────────────────────────────────────
//
// NOTE: Anthropic's structured-output endpoint rejects `minimum`/`maximum`
// on number fields, so confidence stays plain z.number(); the prompt
// enforces the 0..1 range. Matches the AR Follow-up convention.

/** Perceive — classify the urgency of the credential expiry. */
export const DocumentExpiryPerceiveSchema = z.object({
  urgency: z.enum(['expired', 'expiring_critical', 'expiring_soon', 'expiring_later']),
  daysUntilExpiry: z.number().int(),
  /** Whether this is an operational decision (admin) vs a routine nudge (driver). */
  routeTo: z.enum(['driver', 'admin']),
  summary: z.string(),
  confidence: z.number(),
});
export type DocumentExpiryPerceive = z.infer<typeof DocumentExpiryPerceiveSchema>;

/** Decide — pick the action + channel + recipient. */
export const DocumentExpiryDecideSchema = z.object({
  action: z.enum(['send_reminder', 'escalate_to_admin', 'no_action']),
  channel: z.enum(['sms', 'email', 'both']),
  recipient: z.enum(['driver', 'admin']),
  reasoning: z.string(),
  confidence: z.number(),
});
export type DocumentExpiryDecide = z.infer<typeof DocumentExpiryDecideSchema>;

/** Draft — the message artifact (email and/or SMS). */
export const DocumentExpiryDraftSchema = z.object({
  /** Resolved recipient contact — email address and/or E.164 phone. */
  to: z.string(),
  /** Present when the channel includes email. */
  subject: z.string().nullable(),
  /** Email body (long form). Present when the channel includes email. */
  body: z.string().nullable(),
  /** SMS body (≤320 chars). Present when the channel includes sms. */
  smsBody: z.string().nullable(),
  mentionsCredential: z.boolean(),
  mentionsDate: z.boolean(),
  confidence: z.number(),
});
export type DocumentExpiryDraft = z.infer<typeof DocumentExpiryDraftSchema>;

// ─── Outcomes (document-expiry specific) ────────────────────────────────

export const DOCUMENT_EXPIRY_OUTCOMES = [
  'reminder_sent',
  'escalated_to_admin',
  'escalated_to_human',
  'no_action_needed',
  'rejected_by_operator',
  'preflight_skipped',
  'preflight_aborted',
  'approval_expired',
] as const;
export type DocumentExpiryOutcome = (typeof DOCUMENT_EXPIRY_OUTCOMES)[number];

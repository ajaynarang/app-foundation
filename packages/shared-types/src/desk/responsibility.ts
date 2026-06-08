import { z } from 'zod';
import { AgentKeySchema, LifecycleSchema, ResponsibilityKeySchema, TrustLevelSchema } from './enums';

/**
 * DeskResponsibility — REST shapes for the per-tenant row.
 *
 * The UI settings page (/dispatcher/desk/:key/settings) uses these.
 * Conditions are rendered from the per-responsibility UI spec (see
 * ./responsibilities/<key>.ts).
 */

export const DeskResponsibilityListItemSchema = z.object({
  key: ResponsibilityKeySchema,
  agentKey: AgentKeySchema,
  title: z.string(),
  description: z.string().nullable(),
  lifecycle: LifecycleSchema,
  enabled: z.boolean(),
  trustLevel: TrustLevelSchema,

  // Autonomy switch — when true (and the tenant master switch is on) this
  // responsibility may run on its OWN: any non-manual trigger (scheduled
  // today; domain-event / webhook in the future). Default false; a fresh
  // responsibility never runs on its own until an operator opts in. Manual
  // "Run now" ignores this flag.
  autonomyEnabled: z.boolean(),

  // Rollup counts for the overview card
  openEpisodeCount: z.number().int().nonnegative(),
  pendingApprovalCount: z.number().int().nonnegative(),
  lastRunAt: z.string().datetime().nullable(),
});
export type DeskResponsibilityListItem = z.infer<typeof DeskResponsibilityListItemSchema>;

export const DeskResponsibilityDetailSchema = DeskResponsibilityListItemSchema.extend({
  conditions: z.record(z.unknown()), // typed per responsibility — validated by spec-lookup
});
export type DeskResponsibilityDetail = z.infer<typeof DeskResponsibilityDetailSchema>;

// ─── Settings update request ────────────────────────────────────────────
// All fields optional — UI sends only what changed.
// Supervisor lives on DeskAgent — see UpdateAgentRequestSchema.
// Free-form rules previously stored in `notesForSally` are now operator-
// authored playbook memories — see AddPlaybookRuleRequestSchema in ./memory.

export const UpdateDeskResponsibilityRequestSchema = z
  .object({
    enabled: z.boolean().optional(),
    trustLevel: TrustLevelSchema.optional(),
    conditions: z.record(z.unknown()).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field required' });
export type UpdateDeskResponsibilityRequest = z.infer<typeof UpdateDeskResponsibilityRequestSchema>;

// ─── Autonomy toggle request ────────────────────────────────────────────
// Dedicated, single-field request for the per-responsibility "Run
// automatically" switch. Kept separate from UpdateDeskResponsibilityRequest
// so the autonomy switch is an explicit, auditable action — not folded into
// the general settings PATCH that also carries trust + conditions. Governs
// ALL autonomous triggers (scheduled today; domain-event / webhook later) —
// manual "Run now" is never gated by it.

export const UpdateResponsibilityAutonomyRequestSchema = z.object({
  autonomyEnabled: z.boolean(),
});
export type UpdateResponsibilityAutonomyRequest = z.infer<typeof UpdateResponsibilityAutonomyRequestSchema>;

// ─── Conditions UI spec — rendered by the settings page ─────────────────

export const ConditionFieldSpecSchema = z.discriminatedUnion('control', [
  z.object({
    key: z.string(),
    label: z.string(),
    control: z.literal('currency'),
    placeholder: z.string().optional(),
    helpText: z.string().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  }),
  z.object({
    key: z.string(),
    label: z.string(),
    control: z.literal('checkbox'),
    helpText: z.string().optional(),
    default: z.boolean().optional(),
  }),
  z.object({
    key: z.string(),
    label: z.string(),
    control: z.literal('customer-multiselect'),
    helpText: z.string().optional(),
  }),
  z.object({
    key: z.string(),
    label: z.string(),
    control: z.literal('driver-multiselect'),
    helpText: z.string().optional(),
  }),
  // Fixed-option multiselect — `options` enumerate the allowed values
  // (value + human label). Used by document_expiry for severities +
  // credential types. The settings page renders a chip/checkbox group.
  z.object({
    key: z.string(),
    label: z.string(),
    control: z.literal('enum-multiselect'),
    helpText: z.string().optional(),
    options: z.array(z.object({ value: z.string(), label: z.string() })),
  }),
  z.object({
    key: z.string(),
    label: z.string(),
    control: z.literal('number'),
    helpText: z.string().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  }),
]);
export type ConditionFieldSpec = z.infer<typeof ConditionFieldSpecSchema>;

export const ConditionsUISpecSchema = z.object({
  fields: z.array(ConditionFieldSpecSchema),
});
export type ConditionsUISpec = z.infer<typeof ConditionsUISpecSchema>;

import { z } from 'zod';
import { AgentKeySchema, LifecycleSchema, ResponsibilityKeySchema, TrustLevelSchema } from './enums';

/**
 * DeskResponsibility — REST shapes for the per-tenant row.
 * Conditions are rendered from the per-responsibility UI spec.
 */

export const DeskResponsibilityListItemSchema = z.object({
  key: ResponsibilityKeySchema,
  agentKey: AgentKeySchema,
  title: z.string(),
  description: z.string().nullable(),
  lifecycle: LifecycleSchema,
  enabled: z.boolean(),
  trustLevel: TrustLevelSchema,

  autonomyEnabled: z.boolean(),

  openEpisodeCount: z.number().int().nonnegative(),
  pendingApprovalCount: z.number().int().nonnegative(),
  lastRunAt: z.string().datetime().nullable(),
});
export type DeskResponsibilityListItem = z.infer<typeof DeskResponsibilityListItemSchema>;

export const DeskResponsibilityDetailSchema = DeskResponsibilityListItemSchema.extend({
  conditions: z.record(z.unknown()),
});
export type DeskResponsibilityDetail = z.infer<typeof DeskResponsibilityDetailSchema>;

// ─── Settings update request ─────────────────────────────────────────────────

export const UpdateDeskResponsibilityRequestSchema = z
  .object({
    enabled: z.boolean().optional(),
    trustLevel: TrustLevelSchema.optional(),
    conditions: z.record(z.unknown()).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field required' });
export type UpdateDeskResponsibilityRequest = z.infer<typeof UpdateDeskResponsibilityRequestSchema>;

// ─── Autonomy toggle request ─────────────────────────────────────────────────

export const UpdateResponsibilityAutonomyRequestSchema = z.object({
  autonomyEnabled: z.boolean(),
});
export type UpdateResponsibilityAutonomyRequest = z.infer<typeof UpdateResponsibilityAutonomyRequestSchema>;

// ─── Conditions UI spec — rendered by the settings page ─────────────────────
// Generic, domain-free control set. Add your own controls (e.g. entity
// multiselects) as your responsibilities need them.

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
  // Fixed-option multiselect — `options` enumerate the allowed values.
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

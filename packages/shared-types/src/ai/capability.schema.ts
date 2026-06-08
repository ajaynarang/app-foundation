import { z } from 'zod';

/**
 * User mode determines which capability set Sally surfaces in the command
 * palette and capability card. Mirrors the frontend's UserMode union — kept
 * here so backend and frontend agree on the API contract.
 */
export const SallyUserModeSchema = z.enum([
  'prospect',
  'dispatcher',
  'driver',
  'owner',
  'admin',
  'super_admin',
  'customer',
  'support',
]);
export type SallyUserMode = z.infer<typeof SallyUserModeSchema>;

/** A single thing the user can ask Sally to do. */
export const SallyCapabilityItemSchema = z.object({
  /** Stable id, used as React key and analytics token. */
  id: z.string(),
  /** Short title rendered in the palette row (≤ ~40 chars). */
  name: z.string(),
  /** One-line description (~60 chars). */
  description: z.string(),
  /** The example prompt drafted into the textarea on selection. */
  example: z.string(),
});
export type SallyCapabilityItem = z.infer<typeof SallyCapabilityItemSchema>;

/** Capability rows are grouped under a category heading in the palette. */
export const SallyCapabilityCategorySchema = z.object({
  title: z.string(),
  items: z.array(SallyCapabilityItemSchema),
});
export type SallyCapabilityCategory = z.infer<typeof SallyCapabilityCategorySchema>;

/** A "Quick action" — promoted to the top of the palette per role. */
export const SallyQuickActionSchema = z.object({
  id: z.string(),
  label: z.string(),
  hint: z.string(),
  /** Prompt drafted into the textarea on selection. We never auto-fire. */
  prompt: z.string(),
});
export type SallyQuickAction = z.infer<typeof SallyQuickActionSchema>;

/** Full payload returned by GET /sally/capabilities. */
export const SallyCapabilitiesSchema = z.object({
  mode: SallyUserModeSchema,
  quickActions: z.array(SallyQuickActionSchema),
  categories: z.array(SallyCapabilityCategorySchema),
});
export type SallyCapabilities = z.infer<typeof SallyCapabilitiesSchema>;

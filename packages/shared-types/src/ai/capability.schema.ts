import { z } from 'zod';

/**
 * User mode determines which capability set the assistant surfaces in the
 * command palette and capability card. Mirrors the frontend's UserMode union —
 * kept here so backend and frontend agree on the API contract.
 */
export const AssistantUserModeSchema = z.enum(['prospect', 'member', 'owner', 'admin', 'super_admin', 'support']);
export type AssistantUserMode = z.infer<typeof AssistantUserModeSchema>;

/** A single thing the user can ask the assistant to do. */
export const AssistantCapabilityItemSchema = z.object({
  /** Stable id, used as React key and analytics token. */
  id: z.string(),
  /** Short title rendered in the palette row (≤ ~40 chars). */
  name: z.string(),
  /** One-line description (~60 chars). */
  description: z.string(),
  /** The example prompt drafted into the textarea on selection. */
  example: z.string(),
});
export type AssistantCapabilityItem = z.infer<typeof AssistantCapabilityItemSchema>;

/** Capability rows are grouped under a category heading in the palette. */
export const AssistantCapabilityCategorySchema = z.object({
  title: z.string(),
  items: z.array(AssistantCapabilityItemSchema),
});
export type AssistantCapabilityCategory = z.infer<typeof AssistantCapabilityCategorySchema>;

/** A "Quick action" — promoted to the top of the palette per role. */
export const AssistantQuickActionSchema = z.object({
  id: z.string(),
  label: z.string(),
  hint: z.string(),
  /** Prompt drafted into the textarea on selection. We never auto-fire. */
  prompt: z.string(),
});
export type AssistantQuickAction = z.infer<typeof AssistantQuickActionSchema>;

/** Full payload returned by GET /assistant/capabilities. */
export const AssistantCapabilitiesSchema = z.object({
  mode: AssistantUserModeSchema,
  quickActions: z.array(AssistantQuickActionSchema),
  categories: z.array(AssistantCapabilityCategorySchema),
});
export type AssistantCapabilities = z.infer<typeof AssistantCapabilitiesSchema>;

import { z } from 'zod';

/**
 * DeskEntitySuppression — "snooze" records on (tenant, responsibility, entity)
 * triples. TriggerService consults these before upserting a new episode so
 * entities the operator has parked never re-surface until the snooze expires or
 * is explicitly cleared.
 */

// ─── Snooze duration (request input) ────────────────────────────────────────
export const SnoozeDurationSchema = z.enum(['1d', '3d', '1w', '1mo', 'forever']);
export type SnoozeDuration = z.infer<typeof SnoozeDurationSchema>;

// ─── Snooze request body ─────────────────────────────────────────────────────
export const SnoozeEpisodeRequestSchema = z.object({
  duration: SnoozeDurationSchema,
  reason: z.string().max(500).optional(),
});
export type SnoozeEpisodeRequest = z.infer<typeof SnoozeEpisodeRequestSchema>;

// ─── DeskEntitySuppression record (API boundary, camelCase) ─────────────────
export const DeskEntitySuppressionSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.number().int(),
  responsibilityKey: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  /** ISO-8601 string; `null` = snoozed forever. */
  suppressUntil: z.string().nullable(),
  reason: z.string().nullable(),
  setByUserId: z.number().int(),
  setAt: z.string(),
  sourceEpisodeId: z.string().uuid().nullable(),
  unsuppressedAt: z.string().nullable(),
  unsuppressedByUserId: z.number().int().nullable(),
});
export type DeskEntitySuppression = z.infer<typeof DeskEntitySuppressionSchema>;

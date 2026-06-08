import { z } from 'zod';

/**
 * Desk schedule — tenant-wide master switch for autonomous Desk runs.
 *
 * When `enabled` is false (the default for every tenant), NO responsibility
 * runs autonomously regardless of its own per-responsibility `autonomyEnabled`
 * flag — the scheduler (and any future non-manual trigger) skips the whole
 * tenant. A one-flip "pause all automatic runs" safety control. Manual "Run
 * now" is unaffected.
 *
 * Used by:
 *   - GET  /desk/schedule  → DeskScheduleState
 *   - PATCH /desk/schedule  ← UpdateDeskScheduleRequest
 */

export const DeskScheduleStateSchema = z.object({
  enabled: z.boolean(),
  /**
   * Tenant IANA timezone that scheduled responsibilities run in (read-only on
   * the Crew tab — edited on the Organization settings page). Falls back to
   * `DEFAULT_TENANT_TIMEZONE` ("UTC") when the tenant has none set.
   */
  timezone: z.string(),
});
export type DeskScheduleState = z.infer<typeof DeskScheduleStateSchema>;

export const UpdateDeskScheduleRequestSchema = z.object({
  enabled: z.boolean(),
});
export type UpdateDeskScheduleRequest = z.infer<typeof UpdateDeskScheduleRequestSchema>;

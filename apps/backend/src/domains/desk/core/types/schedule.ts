import { z } from 'zod';

/**
 * Desk schedule — tenant-wide master switch for autonomous Desk runs.
 *
 * When `enabled` is false (the default for every tenant), NO responsibility
 * runs autonomously regardless of its own `autonomyEnabled` flag. Manual
 * "Run now" is unaffected.
 */

export const DeskScheduleStateSchema = z.object({
  enabled: z.boolean(),
  /** Tenant IANA timezone scheduled responsibilities run in. Falls back to "UTC". */
  timezone: z.string(),
});
export type DeskScheduleState = z.infer<typeof DeskScheduleStateSchema>;

export const UpdateDeskScheduleRequestSchema = z.object({
  enabled: z.boolean(),
});
export type UpdateDeskScheduleRequest = z.infer<typeof UpdateDeskScheduleRequestSchema>;

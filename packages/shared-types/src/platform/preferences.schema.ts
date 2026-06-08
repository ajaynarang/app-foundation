import { z } from 'zod';

// ── User Preferences ──

export const UserPreferencesSchema = z.object({
  id: z.number(),
  userId: z.number(),
  // Display
  timeFormat: z.string(),
  timezone: z.string(),
  dateFormat: z.string(),
  // Notification Delivery (per-category channel map)
  notificationChannels: z.record(
    z.string(),
    z.object({ inApp: z.boolean(), email: z.boolean(), push: z.boolean(), sms: z.boolean() }),
  ),
  // Sound (per-category mute map)
  soundSettings: z.record(z.string(), z.boolean()),
  // Notification Preferences (redesign)
  notificationPreferences: z
    .object({
      system: z.object({ inApp: z.boolean(), email: z.boolean(), sms: z.boolean() }),
      team: z.object({ inApp: z.boolean(), email: z.boolean(), sms: z.boolean() }),
      billing: z.object({ inApp: z.boolean(), email: z.boolean(), sms: z.boolean() }),
    })
    .optional()
    .nullable(),
  // Quiet Hours
  quietHoursEnabled: z.boolean(),
  quietHoursStart: z.string().nullable(),
  quietHoursEnd: z.string().nullable(),
  // Voice Preferences
  voiceMode: z.string(),
  voiceId: z.string(),
  voiceSpeed: z.string(),
  // Platform Tour
  platformTourStatus: z.enum(['dismissed', 'completed']).nullable().optional(),
  platformTourStatusAt: z.string().nullable().optional(),
  // Timestamps
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

// ── Notification Configuration ──

export const NotificationTypeConfigSchema = z.object({
  enabled: z.boolean(),
  mandatory: z.boolean().optional(),
  thresholdMinutes: z.number().optional(),
  thresholdPercent: z.number().optional(),
});
export type NotificationTypeConfig = z.infer<typeof NotificationTypeConfigSchema>;

export const EscalationPolicyConfigSchema = z.object({
  acknowledgeSlaMinutes: z.number(),
  escalateTo: z.string(),
  channels: z.array(z.string()),
});
export type EscalationPolicyConfig = z.infer<typeof EscalationPolicyConfigSchema>;

export const GroupingConfigSchema = z.object({
  dedupWindowMinutes: z.number(),
  groupSameType: z.boolean(),
  smartGroup: z.boolean(),
  linkCascading: z.boolean(),
});
export type GroupingConfig = z.infer<typeof GroupingConfigSchema>;

export const ChannelConfigSchema = z.object({
  inApp: z.boolean(),
  email: z.boolean(),
  push: z.boolean(),
  sms: z.boolean(),
});
export type ChannelConfig = z.infer<typeof ChannelConfigSchema>;

export const NotificationConfigurationSchema = z.object({
  notificationTypes: z.record(z.string(), NotificationTypeConfigSchema),
  escalationPolicy: z.record(z.string(), EscalationPolicyConfigSchema),
  groupingConfig: GroupingConfigSchema,
  defaultChannels: z.record(z.string(), ChannelConfigSchema),
});
export type NotificationConfiguration = z.infer<typeof NotificationConfigurationSchema>;

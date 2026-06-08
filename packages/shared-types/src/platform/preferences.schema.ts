import { z } from 'zod';

// ── User Preferences ──

export const UserPreferencesSchema = z.object({
  id: z.number(),
  userId: z.number(),
  // Display
  distanceUnit: z.string(),
  timeFormat: z.string(),
  timezone: z.string(),
  dateFormat: z.string(),
  // Alert Delivery
  alertChannels: z.record(
    z.string(),
    z.object({ inApp: z.boolean(), email: z.boolean(), push: z.boolean(), sms: z.boolean() }),
  ),
  // Sound (alert-path: used by resolveChannels in alert pipeline)
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

// ── Operations Settings ──

export const OperationsSettingsSchema = z.object({
  id: z.number(),
  tenantId: z.number(),
  costPerMile: z.number(),
  laborCostPerHour: z.number(),
  preferFullRest: z.boolean(),
  allowDockRest: z.boolean(),
  maxFuelDetour: z.number(),
  fuelCards: z.array(z.string()),
  shieldAiEnabled: z.boolean(),
  shieldCustomRulesEnabled: z.boolean(),
  shieldAuditPeriodDays: z.number(),
  // Alert Settings
  alertResolveCooldownHours: z.number(),
  // Lane Generation
  laneGenerationLookaheadDays: z.number(),
  // Document Compliance
  bolEnforcement: z.string(),
  podEnforcement: z.string(),
  rateConEnforcement: z.string(),
  lumperReceiptEnforcement: z.string(),
  scaleTicketEnforcement: z.string(),
  podGracePeriodHours: z.number(),
  requireBillableCharge: z.boolean(),
  allowBillingOverride: z.boolean(),
  // Smart Route settings
  estimatedDieselPricePerGallon: z.number().optional(),
  splitSleeperThresholdHours: z.number().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type OperationsSettings = z.infer<typeof OperationsSettingsSchema>;

// ── Driver Preferences ──

export const DriverPreferencesSchema = z.object({
  id: z.number(),
  userId: z.number(),
  driverId: z.number().nullable(),
  preferredNavApp: z.string(),
  theme: z.string(),
  pushEnabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DriverPreferences = z.infer<typeof DriverPreferencesSchema>;

// ── Alert Configuration ──

export const AlertTypeConfigSchema = z.object({
  enabled: z.boolean(),
  mandatory: z.boolean().optional(),
  thresholdMinutes: z.number().optional(),
  thresholdPercent: z.number().optional(),
});
export type AlertTypeConfig = z.infer<typeof AlertTypeConfigSchema>;

export const EscalationPolicyConfigSchema = z.object({
  acknowledgeSlaMinutes: z.number(),
  escalateTo: z.string(),
  channels: z.array(z.string()),
});
export type EscalationPolicyConfig = z.infer<typeof EscalationPolicyConfigSchema>;

export const GroupingConfigSchema = z.object({
  dedupWindowMinutes: z.number(),
  groupSameTypePerDriver: z.boolean(),
  smartGroupAcrossDrivers: z.boolean(),
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

export const AlertConfigurationSchema = z.object({
  alertTypes: z.record(z.string(), AlertTypeConfigSchema),
  escalationPolicy: z.record(z.string(), EscalationPolicyConfigSchema),
  groupingConfig: GroupingConfigSchema,
  defaultChannels: z.record(z.string(), ChannelConfigSchema),
});
export type AlertConfiguration = z.infer<typeof AlertConfigurationSchema>;

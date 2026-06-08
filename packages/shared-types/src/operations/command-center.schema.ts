import { z } from 'zod';
import { EtaStatusSchema } from './monitoring.schema';
export type { EtaStatus } from './monitoring.schema';

export const LoadCardTierSchema = z.enum(['basic', 'tracked', 'planned']);
export type LoadCardTier = z.infer<typeof LoadCardTierSchema>;

export const HosStatusSchema = z.enum(['driving', 'on_duty', 'sleeper', 'off_duty']);
export type HosStatus = z.infer<typeof HosStatusSchema>;

export const ActiveLoadSchema = z.object({
  loadId: z.string(),
  loadNumber: z.string(),
  customerName: z.string(),
  status: z.string(),
  requiredEquipmentType: z.string().nullable().optional(),
  origin: z.object({ city: z.string().nullable(), state: z.string().nullable() }).nullable(),
  destination: z.object({ city: z.string().nullable(), state: z.string().nullable() }).nullable(),
  driver: z.object({ driverId: z.string(), name: z.string() }).nullable(),
  vehicle: z.object({ vehicleId: z.string(), identifier: z.string() }).nullable(),
  stopProgress: z.object({ completed: z.number(), total: z.number() }),
  pickupDate: z.string().nullable(),
  deliveryDate: z.string().nullable(),
  weightLbs: z.number(),
  rateCents: z.number().nullable(),
  tier: LoadCardTierSchema,
  hos: z
    .object({
      driveHoursRemaining: z.number(),
      dutyHoursRemaining: z.number(),
      cycleHoursRemaining: z.number(),
      breakHoursRemaining: z.number(),
      status: HosStatusSchema,
    })
    .nullable(),
  hosDataSyncedAt: z.string().nullable(),
  route: z
    .object({
      planId: z.string(),
      eta: z.string().nullable(),
      etaStatus: EtaStatusSchema,
      nextStop: z.object({ name: z.string(), location: z.string(), eta: z.string() }).nullable(),
      milesCompleted: z.number(),
      milesRemaining: z.number(),
      totalDistanceMiles: z.number(),
    })
    .nullable(),
  referenceNumber: z.string().nullable().optional(),
  activeAlertCount: z.number(),
  monitoringStatus: z.enum(['ok', 'warning', 'critical']).nullable(),
  updatedAt: z.string(),
});
export type ActiveLoad = z.infer<typeof ActiveLoadSchema>;

export const DriverHOSChipSchema = z.object({
  driverId: z.string(),
  name: z.string(),
  initials: z.string(),
  driveHoursRemaining: z.number(),
  dutyHoursRemaining: z.number(),
  status: HosStatusSchema,
  vehicleId: z.string().nullable(),
  activeLoadId: z.string().nullable(),
});
export type DriverHOSChip = z.infer<typeof DriverHOSChipSchema>;

export const LoadCentricKpisSchema = z.object({
  activeLoads: z.number(),
  inTransit: z.number(),
  onTimePercentage: z.number(),
  activeAlerts: z.number(),
  unassigned: z.number(),
});
export type LoadCentricKpis = z.infer<typeof LoadCentricKpisSchema>;

export const CommandCenterOverviewSchema = z.object({
  kpis: LoadCentricKpisSchema,
  activeLoads: z.array(ActiveLoadSchema),
  quickActionCounts: z.object({
    unassignedLoads: z.number(),
    availableDrivers: z.number(),
  }),
  driverHosStrip: z.array(DriverHOSChipSchema),
});
export type CommandCenterOverview = z.infer<typeof CommandCenterOverviewSchema>;

export const ShiftNoteLinkedEntitySchema = z.object({
  type: z.enum(['driver', 'load', 'route', 'vehicle']),
  id: z.string(),
  label: z.string(),
});
export type ShiftNoteLinkedEntity = z.infer<typeof ShiftNoteLinkedEntitySchema>;

export const ShiftNoteSchema = z.object({
  noteId: z.string(),
  content: z.string(),
  priority: z.enum(['urgent', 'action_required', 'info']),
  createdBy: z.object({
    userId: z.string(),
    name: z.string(),
  }),
  createdAt: z.string(),
  expiresAt: z.string(),
  isPinned: z.boolean(),
  linkedEntities: z.array(ShiftNoteLinkedEntitySchema),
  acknowledgedBy: z
    .object({
      userId: z.string(),
      name: z.string(),
    })
    .nullable(),
  acknowledgedAt: z.string().nullable(),
});
export type ShiftNote = z.infer<typeof ShiftNoteSchema>;

export const ShiftNotesResponseSchema = z.object({
  notes: z.array(ShiftNoteSchema),
  handoffStatus: z.object({
    acknowledged: z.boolean(),
    acknowledgedBy: z
      .object({
        userId: z.string(),
        name: z.string(),
      })
      .optional(),
    acknowledgedAt: z.string().optional(),
  }),
});
export type ShiftNotesResponse = z.infer<typeof ShiftNotesResponseSchema>;

export const SystemHealthCheckSchema = z.object({
  name: z.string(),
  type: z.string(),
  enabled: z.boolean(),
  lastFiredAt: z.string().nullable(),
});
export type SystemHealthCheck = z.infer<typeof SystemHealthCheckSchema>;

export const SystemHealthCheckCategorySchema = z.object({
  category: z.string(),
  checks: z.array(SystemHealthCheckSchema),
});
export type SystemHealthCheckCategory = z.infer<typeof SystemHealthCheckCategorySchema>;

export const SystemHealthIntegrationSchema = z.object({
  name: z.string(),
  type: z.string(),
  source: z.enum(['live', 'mock']),
  status: z.enum(['connected', 'disconnected', 'not_configured']),
  lastSuccessAt: z.string().nullable(),
});
export type SystemHealthIntegration = z.infer<typeof SystemHealthIntegrationSchema>;

export const PipelineSyncStatusSchema = z.object({
  syncType: z.string(),
  displayName: z.string(),
  expectedIntervalSeconds: z.number(),
  lastSuccessAt: z.string().nullable(),
  lastFailureAt: z.string().nullable(),
  lastError: z.string().nullable(),
  status: z.enum(['active', 'delayed', 'stale', 'never']),
  consecutiveFailures: z.number(),
});
export type PipelineSyncStatus = z.infer<typeof PipelineSyncStatusSchema>;

export const SystemHealthSchema = z.object({
  monitoring: z.object({
    status: z.enum(['active', 'inactive', 'degraded', 'limited', 'unavailable']),
    lastCycleAt: z.string().nullable(),
    loadsMonitored: z.number(),
    driversMonitored: z.number(),
    triggersLastCycle: z.number(),
    cycleIntervalSeconds: z.number(),
  }),
  checks: z.array(SystemHealthCheckCategorySchema),
  integrations: z.array(SystemHealthIntegrationSchema),
  pipeline: z.array(PipelineSyncStatusSchema).optional(),
});
export type SystemHealth = z.infer<typeof SystemHealthSchema>;

// DTO schema (mirrors backend DTO)
export const CreateShiftNoteSchema = z.object({
  content: z.string().min(1).max(1000),
  isPinned: z.boolean().optional(),
  priority: z.enum(['urgent', 'action_required', 'info']).optional(),
});
export type CreateShiftNoteDto = z.infer<typeof CreateShiftNoteSchema>;

// ── Message Summary (Command Center Messaging Hub) ──

export const MessageSummaryItemSchema = z.object({
  loadId: z.string(),
  loadNumber: z.string(),
  status: z.string(),
  origin: z.string(),
  destination: z.string(),
  driverName: z.string(),
  vehicleUnit: z.string().nullable(),
  eta: z.string().nullable(),
  lastMessage: z
    .object({
      content: z.string(),
      role: z.enum(['driver', 'dispatcher']),
      createdAt: z.string(),
    })
    .nullable(),
  unreadCount: z.number(),
});
export type MessageSummaryItem = z.infer<typeof MessageSummaryItemSchema>;

export const MessageSummaryResponseSchema = z.object({
  items: z.array(MessageSummaryItemSchema),
  needsResponseCount: z.number(),
});
export type MessageSummaryResponse = z.infer<typeof MessageSummaryResponseSchema>;

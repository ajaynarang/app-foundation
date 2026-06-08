import { z } from 'zod';

export const EtaStatusSchema = z.enum(['ON_TIME', 'AT_RISK', 'LATE']);
export type EtaStatus = z.infer<typeof EtaStatusSchema>;

export const MonitoringSeveritySchema = z.enum(['critical', 'high', 'medium', 'low']);
export type MonitoringSeverity = z.infer<typeof MonitoringSeveritySchema>;

export const ImpactSummarySchema = z.object({
  etaChangeMinutes: z.number(),
  alertsFired: z.number(),
  severity: z.string(),
});
export type ImpactSummary = z.infer<typeof ImpactSummarySchema>;

export const RoutePlanUpdateSchema = z.object({
  updateId: z.string(),
  planId: z.number(),
  updateType: z.string(),
  triggeredAt: z.string(),
  triggeredBy: z.string(),
  triggerData: z.record(z.string(), z.unknown()),
  replanTriggered: z.boolean(),
  replanReason: z.string().nullable(),
  impactSummary: ImpactSummarySchema.nullable(),
});
export type RoutePlanUpdate = z.infer<typeof RoutePlanUpdateSchema>;

export const MonitoringStatusSchema = z.object({
  planId: z.string(),
  currentSegment: z
    .object({
      segmentId: z.string(),
      sequenceOrder: z.number(),
      segmentType: z.string(),
      status: z.string(),
    })
    .nullable(),
  driverPosition: z
    .object({
      lat: z.number(),
      lon: z.number(),
      speed: z.number(),
      heading: z.number(),
      lastUpdated: z.string(),
    })
    .nullable(),
  hosState: z
    .object({
      currentDutyStatus: z.string(),
      driveTimeRemainingMinutes: z.number(),
      shiftTimeRemainingMinutes: z.number(),
      cycleTimeRemainingMinutes: z.number(),
      timeUntilBreakMinutes: z.number(),
    })
    .nullable(),
  etaDeviation: z.object({
    minutes: z.number(),
    status: EtaStatusSchema,
  }),
  completedSegments: z.number(),
  totalSegments: z.number(),
  activeAlerts: z.number(),
  lastChecked: z.string(),
  recentUpdates: z.array(RoutePlanUpdateSchema),
});
export type MonitoringStatus = z.infer<typeof MonitoringStatusSchema>;

export const MonitoringTriggerEventSchema = z.object({
  planId: z.string(),
  triggerType: z.string(),
  severity: MonitoringSeveritySchema,
  requiresReplan: z.boolean(),
  etaImpactMinutes: z.number(),
  params: z.record(z.string(), z.unknown()),
  timestamp: z.string(),
});
export type MonitoringTriggerEvent = z.infer<typeof MonitoringTriggerEventSchema>;

export const MonitoringCycleEventSchema = z.object({
  loadsMonitored: z.number(),
  driversMonitored: z.number(),
  totalTriggers: z.number(),
  status: z.string(),
  timestamp: z.string(),
});
export type MonitoringCycleEvent = z.infer<typeof MonitoringCycleEventSchema>;

// ---- Load-Centric Monitoring Schemas ----

export const CheckCategorySchema = z.enum([
  'hos_compliance',
  'load_progress',
  'driver_behavior',
  'vehicle_state',
  'lifecycle',
]);
export type CheckCategory = z.infer<typeof CheckCategorySchema>;

export const ActiveCheckResultSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  category: CheckCategorySchema,
  status: z.enum(['ok', 'warning', 'critical']),
  issueCount: z.number(),
  summary: z.string(),
});
export type ActiveCheckResult = z.infer<typeof ActiveCheckResultSchema>;

export const InactiveCheckResultSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  category: CheckCategorySchema,
  reason: z.string(),
});
export type InactiveCheckResult = z.infer<typeof InactiveCheckResultSchema>;

export const SkippedCheckResultSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  category: CheckCategorySchema,
  reason: z.string(),
});
export type SkippedCheckResult = z.infer<typeof SkippedCheckResultSchema>;

export const DataSourceStatusSchema = z.enum(['HEALTHY', 'DELAYED', 'STALE', 'NEVER', 'NOT_CONFIGURED']);
export type DataSourceStatus = z.infer<typeof DataSourceStatusSchema>;

export const ResolvedDataSourceSchema = z.object({
  definition: z.object({
    id: z.string(),
    displayName: z.string(),
    provides: z.array(z.string()),
    sourceType: z.enum(['integration', 'platform_service']),
  }),
  available: z.boolean(),
  status: DataSourceStatusSchema,
  lastSyncAge: z.number().nullable(),
});
export type ResolvedDataSource = z.infer<typeof ResolvedDataSourceSchema>;

export const MonitoringCycleStatusSchema = z.enum(['ACTIVE', 'LIMITED', 'DEGRADED', 'INACTIVE', 'UNAVAILABLE']);
export type MonitoringCycleStatus = z.infer<typeof MonitoringCycleStatusSchema>;

export const MonitoringCycleResultSchema = z.object({
  tenantId: z.number(),
  status: MonitoringCycleStatusSchema,
  loadsMonitored: z.number(),
  driversMonitored: z.number(),
  cycleIntervalSeconds: z.number(),
  lastCycleAt: z.string(),
  triggersThisCycle: z.number(),
  dataSources: z.array(ResolvedDataSourceSchema),
  checks: z.object({
    active: z.array(ActiveCheckResultSchema),
    inactive: z.array(InactiveCheckResultSchema),
    skipped: z.array(SkippedCheckResultSchema),
  }),
});
export type MonitoringCycleResult = z.infer<typeof MonitoringCycleResultSchema>;

// DTO schemas (mirrors backend DTOs)
export const StartRouteSchema = z.object({
  notes: z.string().max(500).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});
export type StartRouteDto = z.infer<typeof StartRouteSchema>;

export const PickupCompleteSchema = z.object({
  segmentId: z.string().min(1),
  notes: z.string().max(500).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});
export type PickupCompleteDto = z.infer<typeof PickupCompleteSchema>;

export const DeliveryCompleteSchema = z.object({
  segmentId: z.string().min(1),
  notes: z.string().max(500).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});
export type DeliveryCompleteDto = z.infer<typeof DeliveryCompleteSchema>;

export const DispatcherOverrideSchema = z.object({
  segmentId: z.string().min(1),
  newStatus: z.enum(['in_progress', 'completed', 'skipped']),
  reason: z.string().min(1).max(500),
  confirmPickup: z.boolean().optional(),
  confirmDelivery: z.boolean().optional(),
});
export type DispatcherOverrideDto = z.infer<typeof DispatcherOverrideSchema>;

export const ReportDelaySchema = z.object({
  delayMinutes: z.number().min(1),
  reason: z.string().min(1).max(500),
});
export type ReportDelayDto = z.infer<typeof ReportDelaySchema>;

export const ReportDockTimeSchema = z.object({
  actualDockHours: z.number().min(0),
  notes: z.string().optional(),
});
export type ReportDockTimeDto = z.infer<typeof ReportDockTimeSchema>;

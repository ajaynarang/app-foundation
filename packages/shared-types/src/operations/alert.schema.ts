import { z } from 'zod';
import {
  AlertPriority,
  AlertPrioritySchema,
  AlertScope,
  AlertScopeSchema,
  AlertStatus,
  AlertStatusSchema,
} from '../generated/prisma-enums';

// Re-export the generated Prisma-mirrored enums so consumers can keep
// importing `AlertPriority` / `AlertScope` / `AlertStatus` from
// `@sally/shared-types`. The lowercase hand-written `AlertPrioritySchema`
// was retired earlier (casing-drift bug). `AlertStatusSchema` retired in the
// shadow-sweep PR. Both the runtime enum and the type are re-exported so
// callers can use `AlertPriority.CRITICAL` (value) and
// `priority: AlertPriority` (type) — the codegen mirror exports them
// under the same identifier (TS namespace merging).
export { AlertPriority, AlertPrioritySchema, AlertScope, AlertScopeSchema, AlertStatus, AlertStatusSchema };

export const AlertCategorySchema = z.enum(['compliance', 'schedule', 'safety', 'route']);
export type AlertCategory = z.infer<typeof AlertCategorySchema>;

export const AlertNoteSchema = z.object({
  noteId: z.string(),
  authorName: z.string(),
  content: z.string(),
  createdAt: z.string(),
});
export type AlertNote = z.infer<typeof AlertNoteSchema>;

export const AlertSchema: z.ZodType<Alert> = z.lazy(() =>
  z.object({
    alertId: z.string(),
    driverId: z.string(),
    loadId: z.string().optional(),
    scope: AlertScopeSchema.optional(),
    routePlanId: z.string().optional(),
    vehicleId: z.string().optional(),
    alertType: z.string(),
    category: AlertCategorySchema,
    priority: AlertPrioritySchema,
    title: z.string(),
    message: z.string(),
    recommendedAction: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    status: AlertStatusSchema,
    acknowledgedAt: z.string().optional(),
    acknowledgedBy: z.string().optional(),
    snoozedUntil: z.string().optional(),
    resolvedAt: z.string().optional(),
    resolvedBy: z.string().optional(),
    resolutionNotes: z.string().optional(),
    autoResolved: z.boolean().optional(),
    // Int FK to Alert.id (Phase 2 Task 2 — was a string slug FK to Alert.alertId).
    parentAlertId: z.number().int().optional(),
    escalationLevel: z.number().optional(),
    occurrenceCount: z.number().optional(),
    lastOccurredAt: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
    notes: z.array(AlertNoteSchema).optional(),
    childAlerts: z.array(z.lazy(() => AlertSchema)).optional(),
  }),
) as z.ZodType<Alert>;

export interface Alert {
  alertId: string;
  driverId: string;
  loadId?: string;
  scope?: AlertScope;
  routePlanId?: string;
  vehicleId?: string;
  alertType: string;
  category: AlertCategory;
  priority: AlertPriority;
  title: string;
  message: string;
  recommendedAction?: string;
  metadata?: Record<string, unknown>;
  status: AlertStatus;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  snoozedUntil?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNotes?: string;
  autoResolved?: boolean;
  parentAlertId?: number;
  escalationLevel?: number;
  occurrenceCount?: number;
  lastOccurredAt?: string;
  createdAt: string;
  updatedAt: string;
  notes?: AlertNote[];
  childAlerts?: Alert[];
}

export const AlertStatsSchema = z.object({
  active: z.number(),
  critical: z.number(),
  avgResponseTimeMinutes: z.number(),
  resolvedToday: z.number(),
});
export type AlertStats = z.infer<typeof AlertStatsSchema>;

export const ListAlertsParamsSchema = z.object({
  status: z.string().optional(),
  priority: z.string().optional(),
  driverId: z.string().optional(),
  loadId: z.string().optional(),
  category: z.string().optional(),
  scope: z.string().optional(),
});
export type ListAlertsParams = z.infer<typeof ListAlertsParamsSchema>;

// DTO schemas (mirrors backend DTOs)
export const AddNoteSchema = z.object({
  content: z.string().min(1),
});
export type AddNoteDto = z.infer<typeof AddNoteSchema>;

export const ResolveAlertSchema = z.object({
  resolutionNotes: z.string().optional(),
});
export type ResolveAlertDto = z.infer<typeof ResolveAlertSchema>;

export const SnoozeAlertSchema = z.object({
  durationMinutes: z.number().int().min(5).max(480),
  note: z.string().optional(),
});
export type SnoozeAlertDto = z.infer<typeof SnoozeAlertSchema>;

export const BulkAcknowledgeSchema = z.object({
  alertIds: z.array(z.string()).min(1),
});
export type BulkAcknowledgeDto = z.infer<typeof BulkAcknowledgeSchema>;

export const BulkResolveAlertsSchema = z.object({
  alertIds: z.array(z.string()).min(1),
  resolutionNotes: z.string().optional(),
});
export type BulkResolveAlertsDto = z.infer<typeof BulkResolveAlertsSchema>;

// ── Grouped Alerts ──

export interface GroupedAlert {
  entityId: string;
  scope: 'driver' | 'load';
  alertType: string;
  category: AlertCategory;
  priority: AlertPriority;
  driverId: string;
  driverName?: string;
  loadId?: string;
  loadNumber?: string;
  referenceNumber?: string;
  latestAlert: Alert;
  alerts: Alert[];
  occurrenceCount: number;
  alertCount: number;
  firstOccurredAt: string;
}

// ── Smart Stats ──

export const SmartAlertStatsSchema = z.object({
  driversWithIssues: z.number(),
  totalActiveDrivers: z.number(),
  loadsAtRisk: z.number(),
  totalActiveLoads: z.number(),
  recurringAlerts: z.number(),
  avgResolveTimeMinutes: z.number(),
});
export type SmartAlertStats = z.infer<typeof SmartAlertStatsSchema>;

// ── AI Briefing ──

export interface AlertBriefingSituation {
  severity: 'critical' | 'high' | 'medium';
  title: string;
  summary: string;
  recommendation: string;
  relatedAlertIds: string[];
  driverIds: string[];
  loadIds: string[];
}

export interface AlertBriefing {
  situations: AlertBriefingSituation[];
  overallStatus: string;
  generatedAt: string;
}

// ── Alert Analytics ──

export const VolumeDataSchema = z.object({
  byCategory: z.array(z.object({ category: z.string(), count: z.number() })),
  byPriority: z.array(z.object({ priority: z.string(), count: z.number() })),
});
export type VolumeData = z.infer<typeof VolumeDataSchema>;

export const ResponseTimeEntrySchema = z.object({
  date: z.string(),
  avgResponseMinutes: z.number(),
  alertCount: z.number(),
});
export type ResponseTimeEntry = z.infer<typeof ResponseTimeEntrySchema>;

export const ResolutionDataSchema = z.object({
  total: z.number(),
  resolved: z.number(),
  autoResolved: z.number(),
  escalated: z.number(),
  resolutionRate: z.number(),
  escalationRate: z.number(),
});
export type ResolutionData = z.infer<typeof ResolutionDataSchema>;

export const TopAlertTypeSchema = z.object({
  alertType: z.string(),
  count: z.number(),
});
export type TopAlertType = z.infer<typeof TopAlertTypeSchema>;

export const HistoryResultSchema = z.object({
  items: z.array(z.any()),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  totalPages: z.number(),
});
export type HistoryResult = z.infer<typeof HistoryResultSchema>;

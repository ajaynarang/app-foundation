/**
 * API Contracts for Operations domain endpoints:
 * alerts, command-center, shield, notifications.
 *
 * Phase 3 extensions (2026-04-19): analytics envelopes, AI briefing, shield
 * audit trigger/history. Command-center map/system-health/message-summary
 * live in `schemas/command-center.ts`. Horizon, IFTA, Support, and
 * shift-notes have their own files.
 *
 * Shared-types schemas are imported/re-exported where already authoritative;
 * the hand-written blocks cover endpoints with no shared-types coverage.
 */
import { z } from 'zod';
import { dbId, stringId, isoDateString, nullableIsoDate } from './helpers.js';
import {
  AlertSchema as SharedAlertSchema,
  AlertStatsSchema as SharedAlertStatsSchema,
  SmartAlertStatsSchema as SharedSmartAlertStatsSchema,
  VolumeDataSchema as SharedVolumeDataSchema,
  ResponseTimeEntrySchema as SharedResponseTimeEntrySchema,
  ResolutionDataSchema as SharedResolutionDataSchema,
  TopAlertTypeSchema as SharedTopAlertTypeSchema,
  HistoryResultSchema as SharedHistoryResultSchema,
  ShieldAuditSchema as SharedShieldAuditSchema,
  ShieldLatestResponseSchema as SharedShieldLatestResponseSchema,
  ShieldFindingSchema as SharedShieldFindingSchema,
  ShieldCustomRuleSchema as SharedShieldCustomRuleSchema,
  TriggerAuditResponseSchema as SharedTriggerAuditResponseSchema,
  AuditHistoryResponseSchema as SharedAuditHistoryResponseSchema,
} from '@app/shared-types';

// ── ALERTS (legacy, keep for pre-Phase-3 callers) ─────────────────────────────

export const AlertListItemSchema = z.object({
  id: dbId,
  alertId: stringId,
  type: z.string(),
  category: z.string(),
  priority: z.string(),
  status: z.string(),
  title: z.string(),
  message: z.string().nullable().optional(),
  driverId: z.any().nullable().optional(),
  loadId: z.any().nullable().optional(),
  vehicleId: z.any().nullable().optional(),
  acknowledgedAt: z.any().nullable(),
  resolvedAt: z.any().nullable(),
  snoozedUntil: z.any().nullable().optional(),
  createdAt: z.any(),
  updatedAt: z.any(),
});

export const AlertDetailSchema = AlertListItemSchema.extend({
  notes: z.array(z.any()).optional(),
  childAlerts: z.array(z.any()).optional(),
  metadata: z.any().nullable().optional(),
});

export const AlertStatsSchema = z.object({
  total: z.number().int(),
  active: z.number().int(),
  acknowledged: z.number().int(),
  resolved: z.number().int(),
  critical: z.number().int().optional(),
  high: z.number().int().optional(),
});

// ── COMMAND CENTER (legacy) ──────────────────────────────────────────────────

export const CommandCenterOverviewSchema = z.object({
  loads: z.any(),
  drivers: z.any(),
  vehicles: z.any().optional(),
  hos: z.any().optional(),
  kpis: z.any().optional(),
});

export const ShiftNoteSchema = z.object({
  id: dbId,
  content: z.string(),
  isPinned: z.boolean().optional(),
  createdBy: z.any().optional(),
  createdAt: z.any(),
});

// ── SHIELD (legacy) ───────────────────────────────────────────────────────────

export const ShieldScoreSchema = z.object({
  overallScore: z.number(),
  categories: z.any(),
});

export const ShieldAuditSchema = z.object({
  id: dbId,
  status: z.string(),
  overallScore: z.number().nullable().optional(),
  findings: z.array(z.any()).optional(),
  createdAt: z.any(),
});

export const ShieldFindingSchema = z.object({
  id: dbId,
  category: z.string(),
  severity: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  resolved: z.boolean(),
  resolvedAt: z.any().nullable().optional(),
});

export const ShieldRuleSchema = z.object({
  id: dbId,
  name: z.string(),
  category: z.string(),
  severity: z.string(),
  isEnabled: z.boolean(),
  condition: z.any(),
});

// ── NOTIFICATIONS ────────────────────────────────────────────────────────────

export const NotificationSchema = z.object({
  id: dbId,
  notificationId: stringId.optional(),
  type: z.string(),
  title: z.string(),
  message: z.string().nullable().optional(),
  status: z.string(),
  category: z.string().nullable().optional(),
  readAt: z.any().nullable(),
  dismissedAt: z.any().nullable(),
  createdAt: z.any(),
});

export const NotificationCountSchema = z.object({
  unread: z.number().int(),
});

// ── PHASE 3 — ALERT ANALYTICS + BRIEFING + GROUPED + HISTORY ──────────────────

/** `GET /alerts` and `GET /alerts/:id`. */
export const AlertSharedSchema = SharedAlertSchema;
export type AlertShared = z.infer<typeof AlertSharedSchema>;

/** `GET /alerts/stats`. */
export const AlertStatsSharedSchema = SharedAlertStatsSchema;

/** `GET /alerts/stats/smart`. */
export const SmartAlertStatsSchema = SharedSmartAlertStatsSchema;

/** `GET /alerts/analytics/volume`. */
export const AlertAnalyticsVolumeSchema = SharedVolumeDataSchema;

/** `GET /alerts/analytics/response-time` — array of entries. */
export const AlertResponseTimeTrendSchema = z.array(SharedResponseTimeEntrySchema);

/** `GET /alerts/analytics/resolution`. */
export const AlertResolutionRatesSchema = SharedResolutionDataSchema;

/** `GET /alerts/analytics/top-types` — array. */
export const AlertTopTypesSchema = z.array(SharedTopAlertTypeSchema);

/** `GET /alerts/history` item (tightened from shared-types' `z.any()`). */
export const AlertHistoryItemSchema = SharedAlertSchema;

/** Full paginated history envelope. */
export const AlertHistoryResponseSchema = SharedHistoryResultSchema;

/** `GET /alerts/grouped` item shape. */
export const AlertGroupedSchema = z
  .object({
    entityId: z.string(),
    scope: z.enum(['driver', 'load']),
    alertType: z.string(),
    category: z.string(),
    priority: z.string(),
    driverId: z.string().nullable(),
    driverName: z.string().optional(),
    loadId: z.string().nullable().optional(),
    loadNumber: z.string().optional(),
    referenceNumber: z.string().nullable().optional(),
    latestAlert: SharedAlertSchema,
    alerts: z.array(SharedAlertSchema),
    occurrenceCount: z.number().int(),
    alertCount: z.number().int(),
    firstOccurredAt: isoDateString,
  })
  .strict();

/** `POST /alerts/briefing` + `GET /alerts/briefing/cached`. Mirrors the shared-types TS interface. */
const AlertBriefingSituationSchema = z
  .object({
    severity: z.enum(['critical', 'high', 'medium']),
    title: z.string(),
    summary: z.string(),
    recommendation: z.string(),
    relatedAlertIds: z.array(z.string()),
    driverIds: z.array(z.string()),
    loadIds: z.array(z.string()),
  })
  .strict();

export const AlertBriefingSchema = z
  .object({
    situations: z.array(AlertBriefingSituationSchema),
    overallStatus: z.string(),
    generatedAt: isoDateString,
  })
  .strict();

// ── PHASE 3 — SHIELD ──────────────────────────────────────────────────────────

/** `GET /shield`. */
export const ShieldLatestResponseSchema = SharedShieldLatestResponseSchema;

/** `POST /shield/audit`. */
export const ShieldTriggerAuditResponseSchema = SharedTriggerAuditResponseSchema;

/** `GET /shield/audits` envelope. */
export const ShieldAuditHistoryResponseSchema = SharedAuditHistoryResponseSchema;

/** Single audit row. */
export const ShieldAuditHistoryItemSchema = SharedShieldAuditSchema;

/** `GET /shield/audits/:id`. */
export const ShieldAuditDetailSchema = SharedShieldAuditSchema;

/** `GET /shield/findings` row. */
export const ShieldFindingSharedSchema = SharedShieldFindingSchema;

/** Custom rule row. */
export const ShieldCustomRuleSharedSchema = SharedShieldCustomRuleSchema;

// Re-export nullable helper binding so consumers can compose.
export { nullableIsoDate };

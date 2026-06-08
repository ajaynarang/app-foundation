import { z } from 'zod';
import { RiskBandSchema, WireItemSchema } from '../operations/tower.schema';

/**
 * SSE event type constants shared between backend and frontend.
 * Backend: used in SseService.emitToTenant() and DomainEventSseBridge.
 * Frontend: used in SseProvider and SSE_INVALIDATION_MAP.
 *
 * Adding a new event:
 * 1. Add constant here
 * 2. Add a Zod schema below (strict if a handler reads payload fields,
 *    cacheOnlyPayloadSchema otherwise)
 * 3. Backend: add to DOMAIN_TO_SSE map in domain-event-sse-bridge.service.ts (if bridged)
 * 4. Frontend: add to SSE_INVALIDATION_MAP in shared/realtime/invalidation-map.ts
 */
export const SSE_EVENTS = {
  // Loads
  LOAD_CREATED: 'load:created',
  LOAD_UPDATED: 'load:updated',
  LOAD_DELETED: 'load:deleted',
  LOAD_ASSIGNED: 'load:assigned',
  LOAD_STATUS_CHANGED: 'load:status-changed',
  LOAD_BILLING_STATUS_CHANGED: 'load:billing-status-changed',
  LOAD_STOP_STATUS_CHANGED: 'load:stop-status-changed',
  LOAD_LEG_ASSIGNED: 'load:leg-assigned',
  LOAD_LEG_STATUS_CHANGED: 'load:leg-status-changed',
  LOAD_EXCHANGE_REMOVED: 'load:exchange-removed',
  LOAD_MILEAGE_CALCULATED: 'load:mileage-calculated',

  // Alerts
  ALERT_NEW: 'alert:new',
  ALERT_UPDATED: 'alert:updated',
  ALERT_RESOLVED: 'alert:resolved',
  ALERT_ESCALATED: 'alert:escalated',
  ALERT_UNSNOOZED: 'alert:unsnoozed',

  // Notifications
  NOTIFICATION_NEW: 'notification:new',

  // Monitoring
  MONITORING_CYCLE_COMPLETE: 'monitoring:cycle_complete',
  MONITORING_TRIGGER_FIRED: 'monitoring:trigger_fired',

  // Routes
  ROUTE_EVENT: 'route:event',
  ROUTE_REPLAN_RECOMMENDED: 'route:replan_recommended',
  ROUTE_ETA_SHIFTED: 'route:eta_shifted',

  // Documents
  RATECON_COMPLETED: 'ratecon:completed',
  RATECON_FAILED: 'ratecon:failed',

  // Messages
  MESSAGE_NEW: 'message:new',

  // Sync
  SYNC_STARTED: 'sync:started',
  SYNC_COMPLETED: 'sync:completed',
  SYNC_FAILED: 'sync:failed',

  // Accounting
  ACCOUNTING_STARTED: 'accounting:started',
  ACCOUNTING_COMPLETED: 'accounting:completed',
  ACCOUNTING_FAILED: 'accounting:failed',

  // Shield
  SHIELD_AUDIT_COMPLETE: 'shield:audit-complete',
  SHIELD_AUDIT_FAILED: 'shield:audit-failed',

  // Telematics
  TELEMATICS_UPDATE: 'telematics:update',

  // EDI
  EDI_TENDER_RECEIVED: 'edi:tender-received',
  EDI_TENDER_ACCEPTED: 'edi:tender-accepted',
  EDI_TENDER_DECLINED: 'edi:tender-declined',
  EDI_TENDER_COUNTERED: 'edi:tender-countered',
  EDI_MESSAGE_SENT: 'edi:message-sent',
  EDI_MESSAGE_FAILED: 'edi:message-failed',

  // Load Board
  LOAD_BOARD_ALERT: 'load-board:alert',

  // Email Intake
  EMAIL_INGEST_RECEIVED: 'email-ingest:received',
  EMAIL_INGEST_PARSED: 'email-ingest:parsed',
  EMAIL_INGEST_FAILED: 'email-ingest:failed',

  // Trips
  TRIP_CREATED: 'trip:created',
  TRIP_ASSIGNED: 'trip:assigned',
  TRIP_STARTED: 'trip:started',
  TRIP_COMPLETED: 'trip:completed',
  TRIP_CANCELLED: 'trip:cancelled',
  TRIP_LOAD_ADDED: 'trip:load-added',
  TRIP_LOAD_REMOVED: 'trip:load-removed',
  TRIP_ROUTE_STALE: 'trip:route-stale',

  // Trailers
  TRAILER_CREATED: 'trailer:created',
  TRAILER_UPDATED: 'trailer:updated',
  TRAILER_ASSIGNED: 'trailer:assigned',
  TRAILER_UNASSIGNED: 'trailer:unassigned',
  TRAILER_STATUS_CHANGED: 'trailer:status-changed',

  // Vehicles
  VEHICLE_MAINTENANCE_SCHEDULED: 'vehicle:maintenance-scheduled',

  // Sally's Desk
  DESK_DECISION_CREATED: 'desk:decision-created' as const,
  DESK_DECISION_RESOLVED: 'desk:decision-resolved' as const,
  DESK_AUTO_APPROVED: 'desk:auto-approved' as const,
  DESK_ACTION_EXECUTED: 'desk:action-executed' as const,
  DESK_ACTION_FAILED: 'desk:action-failed' as const,
  DESK_REVIEW_ITEM_CREATED: 'desk:review-item-created' as const,
  DESK_REVIEW_ITEM_RESOLVED: 'desk:review-item-resolved' as const,
  DESK_EPISODE_CHANGED: 'desk:episode-changed' as const,

  // Agent management (Phase D)
  API_KEY_UPDATED: 'api-key-updated' as const,
  OAUTH_CLIENT_UPDATED: 'oauth-client-updated' as const,
  AGENT_INVOCATION_COMPLETED: 'agent-invocation-completed' as const,

  // Financials — factoring (Phase 4)
  FACTORING_TRANSACTION_RECORDED: 'factoring:transaction-recorded',
  INVOICE_UPDATED: 'invoice:updated',

  // Tower v3
  TOWER_LOAD_CHANGED: 'tower:load-changed',
  TOWER_WIRE_ITEM_ADDED: 'tower:wire-item-added',
  TOWER_RISK_TRANSITION: 'tower:risk-transition',
  TOWER_ALERTS_CHANGED: 'tower:alerts-changed',
  TOWER_MESSAGES_CHANGED: 'tower:messages-changed',

  // System
  HEARTBEAT: 'heartbeat',
} as const;

export type SseEventType = (typeof SSE_EVENTS)[keyof typeof SSE_EVENTS];

// ─── SSE payload schemas (Zod) ───────────────────────────────────────────
//
// Single source of truth for the shape of every SSE payload. Used by:
// - Frontend: SseProvider validates incoming payloads at the bus boundary
//   (drift between backend emit and frontend parse becomes a console error,
//   not a silent runtime bug).
// - Backend: emit sites can validate before broadcasting (optional but cheap).
//
// Tier 1 — strict schemas: events whose handlers actually read payload fields.
// Tier 2 — `cacheOnlyPayloadSchema`: pure cache-bust events. The frontend
// invalidates query keys and never inspects the data, so a single permissive
// schema covers the long tail without 60+ hand-written shapes.

/** Permissive schema for events whose only consumer is the cache-invalidation map. */
export const cacheOnlyPayloadSchema = z.record(z.unknown());
export type CacheOnlyPayload = z.infer<typeof cacheOnlyPayloadSchema>;

// ─── Tier 1: typed schemas ───────────────────────────────────────────────
export const alertNewPayloadSchema = z.object({
  alertId: z.string(),
  alertType: z.string(),
  category: z.string().optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  title: z.string(),
  message: z.string(),
  playSound: z.boolean().optional(),
  flashTab: z.boolean().optional(),
  showBrowserNotification: z.boolean().optional(),
});
export type AlertNewPayload = z.infer<typeof alertNewPayloadSchema>;

export const notificationNewPayloadSchema = z.object({
  notificationId: z.string(),
  type: z.string(),
  category: z.string(),
  title: z.string(),
  message: z.string(),
  actionUrl: z.string().optional(),
  actionLabel: z.string().optional(),
  playSound: z.boolean().optional(),
  flashTab: z.boolean().optional(),
  showBrowserNotification: z.boolean().optional(),
});
export type NotificationNewPayload = z.infer<typeof notificationNewPayloadSchema>;

export const rateconCompletedPayloadSchema = z.object({
  // Numeric Job PK — the `jobs` table uses an Int PK (PR #734/735).
  jobId: z.number(),
  loadId: z.string(),
  loadNumber: z.string(),
  fileName: z.string(),
});
export type RateconCompletedPayload = z.infer<typeof rateconCompletedPayloadSchema>;

export const rateconFailedPayloadSchema = z.object({
  // Numeric Job PK — the `jobs` table uses an Int PK (PR #734/735).
  jobId: z.number(),
  fileName: z.string(),
  errorMessage: z.string(),
});
export type RateconFailedPayload = z.infer<typeof rateconFailedPayloadSchema>;

export const messageNewPayloadSchema = z.object({
  loadId: z.string(),
  messageId: z.string(),
  senderId: z.string(),
  preview: z.string(),
});
export type MessageNewPayload = z.infer<typeof messageNewPayloadSchema>;

export const shieldAuditCompletePayloadSchema = z.object({
  auditId: z.string(),
  overallScore: z.number(),
  statusLabel: z.string(),
  findingsCount: z.number(),
  asyncFollowUp: z.boolean().optional(),
  conversationId: z.string().optional(),
});
export type ShieldAuditCompletePayload = z.infer<typeof shieldAuditCompletePayloadSchema>;

export const agentInvocationCompletedPayloadSchema = z.object({
  rowId: z.string().nullable(),
  success: z.boolean().nullable(),
  durationMs: z.number().nullable(),
});
export type AgentInvocationCompletedPayload = z.infer<typeof agentInvocationCompletedPayloadSchema>;

/**
 * Tower v3 — `TOWER_WIRE_ITEM_ADDED` carries a fully-formatted WireItem the
 * frontend prepends straight into the wire cache (no refetch). The payload is
 * structurally identical to a backfilled wire item.
 */
export const towerWireItemAddedPayloadSchema = WireItemSchema;
export type TowerWireItemAddedPayload = z.infer<typeof towerWireItemAddedPayloadSchema>;

/**
 * Tower v3 — `TOWER_RISK_TRANSITION` carries a single load's risk-band change.
 * The frontend patches that one entry in the risk-scores cache in place.
 *
 * No `tenantId`: the SSE stream is already tenant-scoped (the backend routes
 * via `emitToTenant`), so the client knows the tenant implicitly. The emitted
 * payload body intentionally omits it — see TowerSseSubscriber.
 */
export const towerRiskTransitionPayloadSchema = z.object({
  loadId: z.string(),
  driverId: z.string(),
  fromBand: RiskBandSchema.nullable(),
  toBand: RiskBandSchema,
  score: z.number().int().min(0).max(100),
});
export type TowerRiskTransitionPayload = z.infer<typeof towerRiskTransitionPayloadSchema>;

export const heartbeatPayloadSchema = z.object({
  timestamp: z.string(),
  connected: z.boolean().optional(),
});
export type HeartbeatPayload = z.infer<typeof heartbeatPayloadSchema>;

/**
 * Per-event schema registry. Events not listed here fall back to
 * `cacheOnlyPayloadSchema` at the bus.
 *
 * Add an entry only when a handler actually reads payload fields. Otherwise
 * the cache-only fallback is enough.
 */
export const SSE_PAYLOAD_SCHEMAS = {
  [SSE_EVENTS.ALERT_NEW]: alertNewPayloadSchema,
  [SSE_EVENTS.NOTIFICATION_NEW]: notificationNewPayloadSchema,
  [SSE_EVENTS.RATECON_COMPLETED]: rateconCompletedPayloadSchema,
  [SSE_EVENTS.RATECON_FAILED]: rateconFailedPayloadSchema,
  [SSE_EVENTS.MESSAGE_NEW]: messageNewPayloadSchema,
  [SSE_EVENTS.SHIELD_AUDIT_COMPLETE]: shieldAuditCompletePayloadSchema,
  [SSE_EVENTS.AGENT_INVOCATION_COMPLETED]: agentInvocationCompletedPayloadSchema,
  [SSE_EVENTS.TOWER_WIRE_ITEM_ADDED]: towerWireItemAddedPayloadSchema,
  [SSE_EVENTS.TOWER_RISK_TRANSITION]: towerRiskTransitionPayloadSchema,
  [SSE_EVENTS.HEARTBEAT]: heartbeatPayloadSchema,
} as const satisfies Partial<Record<SseEventType, z.ZodTypeAny>>;

/**
 * Type-level lookup: payload type for an SSE event. Falls back to
 * `CacheOnlyPayload` for events without a strict schema.
 */
export type SsePayloadFor<T extends SseEventType> = T extends keyof typeof SSE_PAYLOAD_SCHEMAS
  ? z.infer<(typeof SSE_PAYLOAD_SCHEMAS)[T]>
  : CacheOnlyPayload;

/**
 * Look up the schema for a runtime event type. Returns `cacheOnlyPayloadSchema`
 * when the event has no strict schema. Always returns a parseable schema —
 * callers can safely `safeParse` the result without nullish checks.
 */
export function getSsePayloadSchema(eventType: SseEventType): z.ZodTypeAny {
  return (SSE_PAYLOAD_SCHEMAS as Record<string, z.ZodTypeAny>)[eventType] ?? cacheOnlyPayloadSchema;
}

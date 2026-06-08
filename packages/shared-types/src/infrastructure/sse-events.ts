import { z } from 'zod';

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
  // Notifications
  NOTIFICATION_NEW: 'notification:new',

  // Users / team
  USER_INVITED: 'user:invited',

  // Tenant
  TENANT_UPDATED: 'tenant:updated',

  // Integrations
  INTEGRATION_SYNCED: 'integration:synced',

  // AI
  AI_MESSAGE: 'ai:message',

  // Agent management (Phase D)
  API_KEY_UPDATED: 'api-key-updated' as const,
  OAUTH_CLIENT_UPDATED: 'oauth-client-updated' as const,
  AGENT_INVOCATION_COMPLETED: 'agent-invocation-completed' as const,

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
// schema covers the long tail without hand-written shapes.

/** Permissive schema for events whose only consumer is the cache-invalidation map. */
export const cacheOnlyPayloadSchema = z.record(z.unknown());
export type CacheOnlyPayload = z.infer<typeof cacheOnlyPayloadSchema>;

// ─── Tier 1: typed schemas ───────────────────────────────────────────────
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

export const aiMessagePayloadSchema = z.object({
  conversationId: z.string(),
  messageId: z.string(),
  role: z.string(),
  preview: z.string(),
});
export type AiMessagePayload = z.infer<typeof aiMessagePayloadSchema>;

export const integrationSyncedPayloadSchema = z.object({
  integrationId: z.string(),
  vendor: z.string(),
  status: z.string(),
});
export type IntegrationSyncedPayload = z.infer<typeof integrationSyncedPayloadSchema>;

export const agentInvocationCompletedPayloadSchema = z.object({
  rowId: z.string().nullable(),
  success: z.boolean().nullable(),
  durationMs: z.number().nullable(),
});
export type AgentInvocationCompletedPayload = z.infer<typeof agentInvocationCompletedPayloadSchema>;

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
  [SSE_EVENTS.NOTIFICATION_NEW]: notificationNewPayloadSchema,
  [SSE_EVENTS.AI_MESSAGE]: aiMessagePayloadSchema,
  [SSE_EVENTS.INTEGRATION_SYNCED]: integrationSyncedPayloadSchema,
  [SSE_EVENTS.AGENT_INVOCATION_COMPLETED]: agentInvocationCompletedPayloadSchema,
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

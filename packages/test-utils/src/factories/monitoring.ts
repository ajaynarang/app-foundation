// ── Monitoring driver event factories (Phase 3 Group 3e) ──────────────────────
//
// Reconciled against:
//   - apps/backend/.../monitoring/dto/driver-event.dto.ts (Zod schemas)
//     → StartRouteSchema, PickupCompleteSchema, DeliveryCompleteSchema,
//       DispatcherOverrideSchema
//
// IMPORTANT: these schemas DO NOT accept `driverId` in the body — the driver
// is resolved from `planId` server-side. The spec document's factory
// signatures accept a `driverId` for caller ergonomics, but the parameter is
// retained only for symmetry and is NOT emitted. Same for `planId` on the
// start-route factory — the controller reads it from the URL param.
//
// TODO(phase-3-verify): the original spec indicated (lat, lng) overrides;
// live DTO uses `latitude` / `longitude`. Factory keeps `lat`/`lng` as the
// call-site parameter shape and maps internally.

export interface StartRouteEventPayload {
  notes?: string;
  latitude?: number;
  longitude?: number;
}

export function buildStartRouteEvent(
  _planId: string,
  _driverId: string | number,
  overrides: {
    lat?: number;
    lng?: number;
    occurredAt?: string;
    notes?: string;
  } = {},
): StartRouteEventPayload {
  const payload: StartRouteEventPayload = {};
  if (overrides.lat !== undefined) payload.latitude = overrides.lat;
  if (overrides.lng !== undefined) payload.longitude = overrides.lng;
  if (overrides.notes !== undefined) payload.notes = overrides.notes;
  // `occurredAt` is intentionally dropped — the DTO doesn't accept it; the
  // service stamps occurredAt = new Date() at write time.
  return payload;
}

export interface PickupCompleteEventPayload {
  segmentId: string;
  notes?: string;
  latitude?: number;
  longitude?: number;
}

export function buildPickupCompleteEvent(
  stopId: string,
  _driverId: string | number,
  overrides: {
    lat?: number;
    lng?: number;
    notes?: string;
    segmentId?: string;
  } = {},
): PickupCompleteEventPayload {
  // Per the live Zod schema, the body field is `segmentId` (NOT stopId).
  // Callers pass the segment's string id as `stopId` to preserve the spec
  // signature; the helper maps it to `segmentId` on the wire.
  const payload: PickupCompleteEventPayload = {
    segmentId: overrides.segmentId ?? stopId,
  };
  if (overrides.lat !== undefined) payload.latitude = overrides.lat;
  if (overrides.lng !== undefined) payload.longitude = overrides.lng;
  if (overrides.notes !== undefined) payload.notes = overrides.notes;
  return payload;
}

export interface DeliveryCompleteEventPayload {
  segmentId: string;
  notes?: string;
  latitude?: number;
  longitude?: number;
}

export function buildDeliveryCompleteEvent(
  stopId: string,
  _driverId: string | number,
  overrides: {
    lat?: number;
    lng?: number;
    notes?: string;
    segmentId?: string;
  } = {},
): DeliveryCompleteEventPayload {
  const payload: DeliveryCompleteEventPayload = {
    segmentId: overrides.segmentId ?? stopId,
  };
  if (overrides.lat !== undefined) payload.latitude = overrides.lat;
  if (overrides.lng !== undefined) payload.longitude = overrides.lng;
  if (overrides.notes !== undefined) payload.notes = overrides.notes;
  return payload;
}

/**
 * POST /api/v1/routes/:planId/events/dispatcher-override body —
 * `DispatcherOverrideSchema` (Zod).
 *
 * Required fields on the wire: `segmentId`, `newStatus`, `reason`. The spec
 * document's `{ reason, action, targetId }` signature is mapped — `action`
 * corresponds to `newStatus`, `targetId` corresponds to `segmentId`.
 */
export type DispatcherOverrideStatus = 'in_progress' | 'completed' | 'skipped';

export interface DispatcherOverrideEventPayload {
  segmentId: string;
  newStatus: DispatcherOverrideStatus;
  reason: string;
  confirmPickup?: boolean;
  confirmDelivery?: boolean;
}

export function buildDispatcherOverrideEvent(overrides: {
  reason: string;
  action: DispatcherOverrideStatus;
  targetId?: string;
  segmentId?: string;
  confirmPickup?: boolean;
  confirmDelivery?: boolean;
}): DispatcherOverrideEventPayload {
  const segmentId = overrides.segmentId ?? overrides.targetId;
  if (!segmentId) {
    throw new Error('buildDispatcherOverrideEvent: segmentId (or targetId) is required');
  }
  const payload: DispatcherOverrideEventPayload = {
    segmentId,
    newStatus: overrides.action,
    reason: overrides.reason,
  };
  if (overrides.confirmPickup !== undefined) {
    payload.confirmPickup = overrides.confirmPickup;
  }
  if (overrides.confirmDelivery !== undefined) {
    payload.confirmDelivery = overrides.confirmDelivery;
  }
  return payload;
}

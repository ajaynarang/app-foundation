/**
 * API Contracts for the load-tracking endpoints.
 *
 * Two endpoints are covered:
 *   - `POST /loads/:load_id/tracking-token` (authenticated, DISPATCHER/ADMIN/OWNER)
 *     → `LoadTrackingService.generateTrackingToken` returns
 *       `{ trackingToken, trackingUrl }`.
 *   - `GET  /tracking/:token`               (PUBLIC — no auth)
 *     → `LoadTrackingService.getPublicTracking` returns a camelCase envelope:
 *         `{ loadNumber, referenceNumber, status, customerName, carrierName,
 *            equipmentType, weightLbs, estimatedDelivery, timeline, stops }`.
 *
 * Hand-written because shared-types does not publish a schema for either
 * shape. Timeline entries and stops are hand-written off
 * `LoadTrackingService.buildTrackingTimeline`.
 */
import { z } from 'zod';

// ── POST /loads/:id/tracking-token ────────────────────────────────────

export const TrackingTokenResponseSchema = z
  .object({
    trackingToken: z.string().min(1),
    trackingUrl: z.string().min(1),
  })
  .strict();

// ── GET /tracking/:token ──────────────────────────────────────────────
//
// Timeline events are a loose sum: `timestamp` only appears on the
// "Order Confirmed" event (derived from `load.createdAt`), and `detail`
// appears on pickup/delivery events. Model both as `.optional()`.

const TimelineEventSchema = z.object({
  event: z.string(),
  status: z.string(),
  timestamp: z.string().optional(),
  detail: z.string().optional(),
});

const PublicTrackingStopSchema = z.object({
  sequenceOrder: z.number().int(),
  actionType: z.string(),
  city: z.string().nullable(),
  state: z.string().nullable(),
});

export const PublicTrackingSchema = z
  .object({
    loadNumber: z.string(),
    referenceNumber: z.string().nullable(),
    status: z.string(),
    customerName: z.string().nullable(),
    carrierName: z.string(),
    equipmentType: z.string().nullable(),
    weightLbs: z.number().nullable(),
    estimatedDelivery: z.string().nullable(),
    timeline: z.array(TimelineEventSchema),
    stops: z.array(PublicTrackingStopSchema),
  })
  .strict();

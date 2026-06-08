/**
 * trip-lifecycle.ts — State-machine helpers for the Trip resource.
 *
 * All functions accept a RoleApiClient so tests stay role-aware. Errors
 * throw with full context (method, URL, HTTP status, body snippet) so
 * CI logs are self-explanatory without needing to reproduce locally.
 * Matches the shape used in `load-lifecycle.ts`.
 *
 * Backend controller: apps/backend/src/domains/fleet/trips/trip.controller.ts
 */

import type { RoleApiClient } from '../playwright/api-client.js';
import { buildTrip } from '../factories/fleet.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const TRIP_ENDPOINT = '/trips';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CreatedTrip {
  id: number;
  tripId: string;
  status: string;
  loadCount: number;
  [key: string]: unknown;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function errorContext(method: string, url: string, status: number, body: string): string {
  const snippet = body.length > 200 ? `${body.slice(0, 200)}…` : body;
  return `${method} ${url} → HTTP ${status}${snippet ? `: ${snippet}` : ''}`;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

/**
 * POST /trips — Create a trip from the given load string-ids.
 *
 * `loadIds` are the STRING load ids (e.g. "LOAD-0042"). The trip
 * service validates each load exists, is DRAFT or PENDING, is not
 * already in another trip, and is not a relay leg.
 *
 * Returns the full trip detail payload emitted by `findOne`.
 */
export async function createTrip(
  api: RoleApiClient,
  loadIds: string[],
  overrides: {
    driverId?: string;
    vehicleId?: string;
    generateRoute?: boolean;
  } = {},
): Promise<CreatedTrip> {
  const payload = buildTrip(loadIds, overrides);
  const res = await api.post(TRIP_ENDPOINT, payload);
  if (!res.ok()) {
    const body = await res.text().catch(() => '');
    throw new Error(`createTrip failed: ${errorContext('POST', TRIP_ENDPOINT, res.status(), body)}`);
  }
  return (await res.json()) as CreatedTrip;
}

/**
 * POST /trips/:tripId/cancel — Cancel a trip and release all loads.
 *
 * Idempotent-ish: backend rejects cancel on an already-CANCELLED /
 * COMPLETED trip with HTTP 400, and a missing trip with 404. Both
 * are swallowed so the helper is safe to call from afterEach.
 */
export async function cancelTrip(api: RoleApiClient, tripId: string): Promise<void> {
  const url = `${TRIP_ENDPOINT}/${tripId}/cancel`;
  const res = await api.post(url);
  if (!res.ok() && res.status() !== 400 && res.status() !== 404) {
    const body = await res.text().catch(() => '');
    throw new Error(`cancelTrip failed: ${errorContext('POST', url, res.status(), body)}`);
  }
}

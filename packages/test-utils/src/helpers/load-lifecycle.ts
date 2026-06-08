/**
 * load-lifecycle.ts — State-machine helpers for the Load resource.
 *
 * All functions accept a RoleApiClient so tests stay role-aware. Errors are
 * thrown with full context (method, URL, HTTP status, body snippet) so CI logs
 * are self-explanatory without needing to reproduce failures locally.
 *
 * Backend controller: apps/backend/src/domains/fleet/loads/controllers/loads.controller.ts
 */

import type { RoleApiClient } from '../playwright/api-client.js';
import { buildLoad, buildRelayLoad } from '../factories/fleet.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const LOAD_ENDPOINT = '/loads';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CreatedLoad {
  id: number;
  loadId: string;
  loadNumber: string;
  status: string;
  [key: string]: unknown;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function errorContext(method: string, url: string, status: number, body: string): string {
  const snippet = body.length > 200 ? `${body.slice(0, 200)}…` : body;
  return `${method} ${url} → HTTP ${status}${snippet ? `: ${snippet}` : ''}`;
}

/**
 * Retry a request on HTTP 429 (backend ThrottlerException under parallel
 * workers — finding #26, for mutation routes).
 *
 * Waits 2s, 4s, 6s, 8s between attempts (5 tries total, max ~20s). Returns
 * the first non-429 response. Callers still handle non-429 errors via their
 * usual `!res.ok()` path. Long backoff because the backend throttle window
 * under heavy parallel load appears to exceed 6s.
 */
async function sendWith429Retry(
  send: () => Promise<{
    ok: () => boolean;
    status: () => number;
    text: () => Promise<string>;
    json: () => Promise<unknown>;
  }>,
): Promise<{ ok: () => boolean; status: () => number; text: () => Promise<string>; json: () => Promise<unknown> }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await send();
    if (res.status() !== 429) return res;
    if (attempt < 4) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  // After 5 attempts still 429 — return the last one so caller surfaces it.
  return send();
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

/**
 * POST /loads — Create a load linked to the given customer.
 *
 * `customerId` is the numeric Customer.id (not the string `customerId` field).
 * Manual load creation is customer-linked per the backend DTO.
 *
 * Returns the created load payload.
 */
export async function createLoad(
  api: RoleApiClient,
  customerId: number,
  overrides: Record<string, unknown> = {},
): Promise<CreatedLoad> {
  const payload = buildLoad(customerId, overrides);
  const res = await sendWith429Retry(() => api.post(LOAD_ENDPOINT, payload));
  if (!res.ok()) {
    const body = await res.text().catch(() => '');
    throw new Error(`createLoad failed: ${errorContext('POST', LOAD_ENDPOINT, res.status(), body)}`);
  }
  return (await res.json()) as CreatedLoad;
}

/**
 * DELETE /loads/:loadId — Remove a load after a test.
 * 404 is treated as success — the load is already gone.
 */
export async function cleanupLoad(api: RoleApiClient, loadId: string | number): Promise<void> {
  const url = `${LOAD_ENDPOINT}/${loadId}`;
  const res = await api.delete(url);
  if (!res.ok() && res.status() !== 404) {
    const body = await res.text().catch(() => '');
    throw new Error(`cleanupLoad failed: ${errorContext('DELETE', url, res.status(), body)}`);
  }
}

// ── State transitions ─────────────────────────────────────────────────────────

/**
 * POST /loads/:loadId/assign — Assign a driver (and optionally a vehicle) to a load.
 *
 * Backend: `LoadsController.assignLoad` (POST ':load_id/assign').
 * Backend body shape: `{ driverId: string; vehicleId: string; trailerId?: string }`.
 *
 * `driverId` and `vehicleId` are the STRING public identifiers (e.g. "DRV-abc",
 * "VEH-xyz") — the service resolves them to numeric DB ids internally via
 * `prisma.driver.findFirst({ where: { driverId } })` / likewise for vehicle.
 */
export async function assignLoad(
  api: RoleApiClient,
  loadId: string,
  driverId: string,
  vehicleId?: string,
): Promise<void> {
  const url = `${LOAD_ENDPOINT}/${loadId}/assign`;
  const payload: Record<string, unknown> = { driverId };
  if (vehicleId !== undefined) payload.vehicleId = vehicleId;

  const res = await sendWith429Retry(() => api.post(url, payload));
  if (!res.ok()) {
    const body = await res.text().catch(() => '');
    throw new Error(`assignLoad failed: ${errorContext('POST', url, res.status(), body)}`);
  }
}

/**
 * PATCH /loads/:loadId/status — Advance the load to a target status.
 *
 * Backend: PATCH ':load_id/status' in `LoadsController.updateLoadStatus`.
 * Common transitions: PENDING → ASSIGNED → IN_TRANSIT → DELIVERED.
 * Payload shape: `{ status: string; reason?: string }`.
 *
 * Reversal transitions (e.g. IN_TRANSIT → ASSIGNED, DELIVERED → IN_TRANSIT)
 * are blocked by this endpoint — use `revertLoad` instead.
 */
export async function updateLoadStatus(api: RoleApiClient, loadId: string, status: string): Promise<void> {
  const url = `${LOAD_ENDPOINT}/${loadId}/status`;
  const res = await sendWith429Retry(() => api.patch(url, { status }));
  if (!res.ok()) {
    const body = await res.text().catch(() => '');
    throw new Error(`updateLoadStatus(${status}) failed: ${errorContext('PATCH', url, res.status(), body)}`);
  }
}

/**
 * POST /loads/:loadId/revert — Revert a load to a prior status via the
 * unified reversal service. Allowed transitions are defined in
 * `apps/backend/src/domains/fleet/loads/utils/load-reversal-config.ts`:
 *   - IN_TRANSIT → ASSIGNED
 *   - DELIVERED  → IN_TRANSIT
 *   - CANCELLED  → PENDING
 *   - TONU       → PENDING
 *
 * Body shape: `{ targetStatus, category, reason }` per `RevertLoadDto`.
 * `reason` must be 5..2000 chars; `category` is one of the ReversalCategory
 * enum values.
 */
export async function revertLoad(
  api: RoleApiClient,
  loadId: string,
  body: { targetStatus: string; category: string; reason: string },
): Promise<void> {
  const url = `${LOAD_ENDPOINT}/${loadId}/revert`;
  const res = await api.post(url, body);
  if (!res.ok()) {
    const bodyText = await res.text().catch(() => '');
    throw new Error(`revertLoad(${body.targetStatus}) failed: ${errorContext('POST', url, res.status(), bodyText)}`);
  }
}

// ── Relay-specific helpers ────────────────────────────────────────────────────

/** Leg row as emitted by `GET /loads/:id/legs` — raw Prisma shape with nested
 *  driver/vehicle/originStop/destStop includes. Keep loose on the consumer side
 *  and let the schema validate strictly at the test call site. */
export interface CreatedLeg {
  id: number;
  legId: string;
  sequence: number;
  status: string;
  originStopId: number;
  destStopId: number;
  [key: string]: unknown;
}

/**
 * Create a relay load from scratch and split it into legs at the given
 * exchange points.
 *
 * Flow:
 *   1) POST /loads with a ≥ 3-stop payload (non-relay — backend create DTO
 *      doesn't accept `isRelay`).
 *   2) PATCH /loads/:id { isRelay: true } — only reachable via UpdateDraftLoadDto.
 *   3) POST /loads/:id/legs { exchangeStopIds } — derives legs from the
 *      exchange-point boundaries.
 *
 * Returns the created load + the leg array (each a raw Prisma row).
 *
 * `exchangeLoadStopIndexes` — indexes into `load.stops` (0-based) identifying
 * which stops to promote to exchange points. By default we use `[1]` (the
 * single middle stop of a 3-stop payload) which yields two legs.
 *
 * Cleanup: caller is responsible for deleting the load in afterEach via
 * `cleanupLoad`. Legs cascade-delete on load removal.
 *
 * Only feature-enabled tenants accept the PATCH isRelay → legs flow; tag the
 * calling test `@requires:plan-relay_loads`.
 */
export interface SeededRelayStops {
  pickup: { address: string; city: string; state: string; zipCode: string };
  mid: { address: string; city: string; state: string; zipCode: string };
  delivery: { address: string; city: string; state: string; zipCode: string };
}

export async function createRelayLoadWithLegs(
  api: RoleApiClient,
  customerId: number,
  options: {
    exchangeLoadStopIndexes?: number[];
    seededStopFields?: SeededRelayStops;
  } = {},
): Promise<{ load: CreatedLoad; legs: CreatedLeg[] }> {
  const payload = buildRelayLoad(customerId, {
    seededStopFields: options.seededStopFields,
  });

  // Step 1 — create the load (PENDING, isRelay=false).
  const createRes = await api.post(LOAD_ENDPOINT, payload);
  if (!createRes.ok()) {
    const body = await createRes.text().catch(() => '');
    throw new Error(
      `createRelayLoadWithLegs: POST /loads → ${errorContext('POST', LOAD_ENDPOINT, createRes.status(), body)}`,
    );
  }
  const load = (await createRes.json()) as CreatedLoad & {
    stops: Array<{ id: number; sequenceOrder: number }>;
  };

  // Step 2 — promote to relay via PATCH.
  const patchUrl = `${LOAD_ENDPOINT}/${load.loadId}`;
  const patchRes = await api.patch(patchUrl, { isRelay: true });
  if (!patchRes.ok()) {
    const body = await patchRes.text().catch(() => '');
    throw new Error(
      `createRelayLoadWithLegs: PATCH isRelay → ${errorContext('PATCH', patchUrl, patchRes.status(), body)}`,
    );
  }

  // Step 3 — pick exchange LoadStop ids. Default to the sole middle stop in
  // a 3-stop relay payload. LoadStop.id (not Stop.id FK) is what the leg
  // service expects — see `createLegsFromExchangePoints` validating against
  // `load.stops[].id`.
  const sortedStops = [...load.stops].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
  const indexes = options.exchangeLoadStopIndexes ?? [1];
  const exchangeStopIds = indexes.map((idx) => {
    if (idx < 0 || idx >= sortedStops.length) {
      throw new Error(
        `createRelayLoadWithLegs: exchange index ${idx} out of range (load has ${sortedStops.length} stops)`,
      );
    }
    return sortedStops[idx].id;
  });

  const legsUrl = `${LOAD_ENDPOINT}/${load.loadId}/legs`;
  const legsRes = await api.post(legsUrl, { exchangeStopIds });
  if (!legsRes.ok()) {
    const body = await legsRes.text().catch(() => '');
    throw new Error(`createRelayLoadWithLegs: POST /legs → ${errorContext('POST', legsUrl, legsRes.status(), body)}`);
  }
  const legs = (await legsRes.json()) as CreatedLeg[];

  return { load, legs };
}

// ── TODO: completeLoad ────────────────────────────────────────────────────────
//
// There is no dedicated POST /loads/:id/complete endpoint. Completion is achieved
// by patching all stop statuses + final status patch. Implement completeLoad as
// a multi-step helper once Phase 1 fleet tests confirm the exact stop-completion
// flow expected by the backend.
//
// See: apps/backend/src/domains/fleet/loads/controllers/loads.controller.ts
//      PATCH ':load_id/stops/:stop_id/status' (line 781)
//      PATCH ':load_id/status' (line 212)

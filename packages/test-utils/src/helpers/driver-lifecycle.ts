/**
 * driver-lifecycle.ts — State-machine helpers for the Driver resource.
 *
 * Backend controller: apps/backend/src/domains/fleet/drivers/controllers/drivers.controller.ts
 * Confirmed endpoints:
 *   POST /drivers              — create
 *   DELETE /drivers/:id        — ⚠️ NOT in controller (no @Delete decorator found). TODO below.
 *   POST /drivers/:id/activate — activate pending driver
 *
 * Errors include full context (method + URL + status + body snippet).
 */

import type { RoleApiClient } from '../playwright/api-client.js';
import { buildDriver } from '../factories/fleet.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const DRIVER_ENDPOINT = '/drivers';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CreatedDriver {
  id: number;
  driverId: string;
  name: string;
  status: string;
  [key: string]: unknown;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function errorContext(method: string, url: string, status: number, body: string): string {
  const snippet = body.length > 200 ? `${body.slice(0, 200)}…` : body;
  return `${method} ${url} → HTTP ${status}${snippet ? `: ${snippet}` : ''}`;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

/**
 * POST /drivers — Create a driver with optional field overrides.
 * Returns the created driver payload (HTTP 201).
 */
export async function createDriver(
  api: RoleApiClient,
  overrides: Record<string, unknown> = {},
): Promise<CreatedDriver> {
  const payload = buildDriver(overrides);
  const res = await api.post(DRIVER_ENDPOINT, payload);
  if (!res.ok()) {
    const body = await res.text().catch(() => '');
    throw new Error(`createDriver failed: ${errorContext('POST', DRIVER_ENDPOINT, res.status(), body)}`);
  }
  return (await res.json()) as CreatedDriver;
}

// ── TODO: cleanupDriver ───────────────────────────────────────────────────────
//
// No DELETE /drivers/:id endpoint exists in the drivers controller.
// The controller exposes PUT (update), POST (create), and status-toggle POSTs
// (activate / deactivate / reactivate / activate-and-invite) but not DELETE.
//
// Strategy for Phase 1: use deactivateDriver to wind down test drivers, then
// rely on `pnpm tenant:reset --mode hard` (apps/backend/scripts/tenant-reset/) between
// CI runs to do the hard delete via Prisma.
//
// If a DELETE endpoint is added in future, implement cleanupDriver here:
//   export async function cleanupDriver(api, driverId) { ... }

// ── State transitions ─────────────────────────────────────────────────────────

/**
 * POST /drivers/:driverId/activate — Move a PENDING driver to ACTIVE.
 *
 * Backend: POST ':driver_id/activate' (line 458 in drivers.controller.ts).
 * This is distinct from activate-and-invite (which also sends an invitation email).
 */
export async function activateDriver(api: RoleApiClient, driverId: string | number): Promise<void> {
  const url = `${DRIVER_ENDPOINT}/${driverId}/activate`;
  const res = await api.post(url, {});
  if (!res.ok()) {
    const body = await res.text().catch(() => '');
    throw new Error(`activateDriver failed: ${errorContext('POST', url, res.status(), body)}`);
  }
}

/**
 * POST /drivers/:driverId/deactivate — Move a driver to INACTIVE.
 *
 * Backend: POST ':driver_id/deactivate' (line 474 in drivers.controller.ts).
 * Use as a soft cleanup when DELETE is unavailable.
 */
export async function deactivateDriver(api: RoleApiClient, driverId: string | number): Promise<void> {
  const url = `${DRIVER_ENDPOINT}/${driverId}/deactivate`;
  const res = await api.post(url, {});
  if (!res.ok()) {
    const body = await res.text().catch(() => '');
    throw new Error(`deactivateDriver failed: ${errorContext('POST', url, res.status(), body)}`);
  }
}

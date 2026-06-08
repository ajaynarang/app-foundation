/**
 * Shared setup helpers for the loads sub-resource spec suite (Phase 1
 * Group 7). File prefixed with an underscore so Playwright's default test
 * collector ignores it — nothing in here is a test.
 *
 * Two helpers:
 *
 *   - `firstCustomerId` — the canonical "grab a seeded customer id"
 *     preamble every load-creation test needs. Duplicated inline in other
 *     fleet specs; centralised here because six specs in this group all
 *     need it.
 *
 *   - `createAssignedLoad` — bootstraps a PENDING load + a fresh driver
 *     (plus optional vehicle) and assigns them. Returns the load's
 *     string + numeric ids and the driver's public string id so the
 *     caller can drive subsequent `/loads/:load_id/*` sub-resources,
 *     including the driver-only paths on the messages, driver-actions,
 *     and money-codes controllers (which guard on
 *     `load.driverId === user.driverDbId`).
 */
import { expect } from '@playwright/test';
import type { RoleApiClient } from '@sally/test-utils/playwright';
import type { AuthState } from '@sally/test-utils/auth';
import { buildDriver, buildVehicle } from '@sally/test-utils/factories';
import { assignLoad, createLoad } from '@sally/test-utils/helpers';

/**
 * Find the first customer id on the tenant. Every load must be
 * customer-linked — manual load creation requires `customerId` on
 * `CreateLoadDto`.
 */
export async function firstCustomerId(api: RoleApiClient): Promise<number> {
  const res = await api.get('/customers');
  expect(res.status()).toBe(200);
  const body: unknown = await res.json();
  const items = Array.isArray(body)
    ? (body as Array<{ id: number }>)
    : ((body as { data?: Array<{ id: number }> }).data ?? []);
  if (items.length === 0) {
    throw new Error('GET /customers returned 0 customers — loads sub-resource tests require a seeded customer');
  }
  return items[0].id;
}

export interface AssignedLoadSetup {
  /** Load.id (numeric primary key). */
  id: number;
  /** Load.loadId — the string public id (`LOAD-####`). */
  loadId: string;
  /** Load.loadNumber — the tenant-scoped counter value. */
  loadNumber: string;
  /** Driver.driverId — the STRING public id (`DRV-xxx`) the load is assigned to. */
  driverPublicId: string;
  /** Vehicle.vehicleId — the STRING public id (`VEH-xxx`) when a vehicle was provisioned. */
  vehiclePublicId: string | null;
  /**
   * True when the driver was freshly created by this helper — the caller
   * must deactivate it in afterEach. False when the load was assigned to
   * an existing driver (e.g. the seeded `asDriver`).
   */
  createdDriver: boolean;
}

/**
 * Resolve the STRING public driverId of the seeded DRIVER user on the
 * tenant, exposed via `/dev/users` → `authState.users.DRIVER.driverId`.
 *
 * This is the only path a spec can take to drive the `asDriver` fixture
 * through driver-only sub-resource endpoints (messages delivered,
 * driver-actions submit, money-code request/use) — those endpoints guard
 * on `load.driverId === user.driverDbId` (the numeric FK), and the only
 * way for tests to line that up is to assign the load to the same Driver
 * row the fixture's JWT is scoped to. Pulling the string public id from
 * auth state keeps the fixture coupling loose.
 */
export function seededDriverPublicId(authState: AuthState): string {
  const driverUser = authState.users['DRIVER'];
  if (!driverUser) {
    throw new Error(
      `No DRIVER user available in tenant "${authState.tenantName}" — ` +
        'driver-only sub-resource tests require a seeded DRIVER fixture.',
    );
  }
  if (!driverUser.driverId) {
    throw new Error(
      `DRIVER user "${driverUser.userId}" has no linked Driver row ` +
        '(user.driverId is null). Check stage-0-tenant.ts seeds the user → driver link.',
    );
  }
  return driverUser.driverId;
}

/**
 * Bootstrap the multi-step fixture every driver-only sub-resource test
 * needs: PENDING load + ADMIN-provisioned driver (+ optional vehicle) +
 * dispatcher-level assign. Returns the string public ids so callers can
 * mint requests as the freshly-minted driver.
 *
 * Two role contexts are required:
 *   - `asDispatcher` — owns `/loads`.
 *   - `asAdmin`      — owns `/drivers`, `/vehicles`.
 *
 * When `driverPublicId` is supplied in options, the load is assigned to
 * that existing driver (no new driver created → `createdDriver: false`,
 * so caller skips deactivation cleanup). When omitted, a fresh driver is
 * created via `buildDriver()`.
 *
 * Caller is responsible for cleanup — add the returned `loadId` to the
 * spec's `createdLoadIds` array always; add `driverPublicId` to
 * `createdDriverIds` only when `createdDriver: true`.
 */
export async function createAssignedLoad(
  asDispatcher: RoleApiClient,
  asAdmin: RoleApiClient,
  options: {
    withVehicle?: boolean;
    driverPublicId?: string;
  } = {},
): Promise<AssignedLoadSetup> {
  const withVehicle = options.withVehicle ?? false;

  const customerId = await firstCustomerId(asDispatcher);
  const seed = await createLoad(asDispatcher, customerId);

  let driverPublicId: string;
  let createdDriver: boolean;
  if (options.driverPublicId !== undefined) {
    driverPublicId = options.driverPublicId;
    createdDriver = false;
  } else {
    // Finding #2: backend driverId (DRV-<timestamp-base36>) collides under
    // parallel workers. Bounded retry (up to 3 attempts) — fresh factory per
    // try generates a new licenseNumber + timestamp; the backend's 409 path
    // is deterministic, not a flake we're silencing.
    driverPublicId = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      const driverRes = await asAdmin.post('/drivers', buildDriver());
      if (driverRes.status() === 201) {
        const driver = (await driverRes.json()) as { driverId: string };
        driverPublicId = driver.driverId;
        break;
      }
      if (driverRes.status() !== 409) {
        const body = await driverRes.text().catch(() => '');
        throw new Error(`createAssignedLoad: POST /drivers → HTTP ${driverRes.status()}${body ? `: ${body}` : ''}`);
      }
    }
    if (!driverPublicId) {
      throw new Error('createAssignedLoad: POST /drivers returned 409 three times (driverId collision — finding #2)');
    }
    createdDriver = true;
  }

  let vehiclePublicId: string | null = null;
  if (withVehicle) {
    // Same collision class as drivers (unitNumber/VIN unique constraints).
    // unique() + crypto.randomBytes resolved most of it, but keep a retry in
    // case of same-ms collisions.
    for (let attempt = 0; attempt < 3; attempt++) {
      const vehicleRes = await asAdmin.post('/vehicles', buildVehicle());
      if (vehicleRes.status() === 201) {
        const vehicle = (await vehicleRes.json()) as { vehicleId: string };
        vehiclePublicId = vehicle.vehicleId;
        break;
      }
      if (vehicleRes.status() !== 409) {
        const body = await vehicleRes.text().catch(() => '');
        throw new Error(`createAssignedLoad: POST /vehicles → HTTP ${vehicleRes.status()}${body ? `: ${body}` : ''}`);
      }
    }
    if (vehiclePublicId === null) {
      throw new Error('createAssignedLoad: POST /vehicles returned 409 three times');
    }
  }

  await assignLoad(asDispatcher, seed.loadId, driverPublicId, vehiclePublicId ?? undefined);

  return {
    id: seed.id,
    loadId: seed.loadId,
    loadNumber: seed.loadNumber,
    driverPublicId,
    vehiclePublicId,
    createdDriver,
  };
}

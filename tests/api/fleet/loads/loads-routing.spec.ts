/**
 * Fleet — Loads Routing API (Phase 1 Group 8c)
 *
 * Covers the smart-routes endpoints on `LoadsController`:
 *
 *   - GET  /loads/:load_id/driver-recommendations
 *   - POST /loads/:load_id/generate-route
 *   - POST /loads/:load_id/assign-with-route
 *
 * Every endpoint carries `@RequireFeature('route_planning')` on the
 * backend — every test is tagged `@requires:plan-route_planning` so the
 * capability detector excludes them at collection time on tenants without
 * the feature. demo-northstar-2026 has it enabled.
 *
 * Role rules: all three are DISPATCHER/ADMIN/OWNER — tests run as
 * `asDispatcher`.
 *
 * Setup challenges:
 *   1. `generate-route` / `assign-with-route` require stops with lat/lon.
 *      Our default `buildLoad` factory creates stops via `findOrCreate`;
 *      if no prior Stop row matches the address, a new Stop is created
 *      with null coordinates (the backend best-effort geocode runs
 *      through HERE which needs an API key — unset in local dev).
 *      → Fix: pick two seeded Stops from `GET /stops` that already carry
 *        lat/lon (seed script `stage-1-fleet.ts` writes them). Use their
 *        street addresses + zip when building the load payload so the
 *        dedup step returns the existing, geocoded stop row.
 *
 *   2. `generate-route` also resolves the caller-supplied `driverId` and
 *      `vehicleId` against the tenant. We provision a fresh driver+vehicle
 *      via `asAdmin` and clean them up in `afterEach`.
 *
 *   3. `assign-with-route` requires a prior `generate-route` plan — and
 *      that plan must be tied to the load via `RoutePlanLoad`. `planRoute`
 *      internally calls `persistenceService.savePlan` which creates the
 *      join rows. We capture the `planId` from the generate response and
 *      feed it into assign-with-route.
 *
 * External-service behaviour:
 *   - OSRM routing provider falls back to haversine on network error —
 *     `planRoute` always succeeds as long as every stop has lat/lon.
 *   - Samsara/weather/fuel providers are all optional and failures are
 *     logged + swallowed.
 *   So the happy path is reachable in local dev without any live
 *   routing/OSRM infrastructure. We tag the generate + assign tests
 *   `@slow` — the simulator runs several thousand iterations per plan
 *   and can take 2-8s per call.
 *
 * Schema strategy — hand-written in `load-subresources.ts`:
 *   - `DriverRecommendationsResponseSchema` + `DriverRecommendationSchema`
 *     (matches `DriverRecommendationDto`).
 *   - `GenerateRouteResponseSchema` — top-level fields asserted strictly;
 *     nested simulator outputs (segments, complianceReport, dailyBreakdown)
 *     kept as `z.unknown()` to avoid brittle coupling to internals.
 *   - `AssignWithRouteResponseSchema` — RoutePlan row with segments/loads
 *     as `z.array(z.unknown())`.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildDriver, buildLoad, buildRoutePlanRequest, buildVehicle } from '@sally/test-utils/factories';
import { cleanupLoad } from '@sally/test-utils/helpers';
import { expectContract, LoadSubresourceSchemas } from '@sally/test-utils/schemas';
import type { RoleApiClient } from '@sally/test-utils/playwright';

import { firstCustomerId } from './_helpers.js';

const { DriverRecommendationsResponseSchema, GenerateRouteResponseSchema, AssignWithRouteResponseSchema } =
  LoadSubresourceSchemas;

// ── Helpers (spec-scoped) ───────────────────────────────────────────

interface SeededStop {
  id: number;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  lat: number | null;
  lon: number | null;
}

/**
 * Query `GET /stops` and return the first N stops that carry lat/lon.
 * Seeded-stops-only is sufficient for route planning because
 * `findOrCreate` during load creation dedups by `(normalizedAddress,
 * zipCode)` — we re-use these stops in the load's payload so the load
 * inherits their coordinates.
 */
async function findGeocodedStops(api: RoleApiClient, count: number): Promise<SeededStop[]> {
  const res = await api.get('/stops?limit=100&sortBy=createdAt&sortOrder=desc');
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    items: Array<SeededStop & { address: string | null; zipCode: string | null }>;
  };
  const geocoded = (body.items ?? []).filter(
    (s) => typeof s.lat === 'number' && typeof s.lon === 'number' && s.address !== null && s.zipCode !== null,
  );
  if (geocoded.length < count) {
    throw new Error(
      `findGeocodedStops: tenant has only ${geocoded.length} geocoded stops — need ${count}. Run demo seed to populate coordinates.`,
    );
  }
  return geocoded.slice(0, count);
}

/** Build a load payload whose stops reference the given seeded Stop rows
 *  so the backend's `findOrCreate` dedup resolves to the pre-geocoded
 *  rows. The `stopId` field is a string here (unmatched → triggers
 *  find-or-create by address + zip). */
function buildLoadWithSeededStops(
  customerId: number,
  pickupStop: SeededStop,
  deliveryStop: SeededStop,
): ReturnType<typeof buildLoad> {
  return buildLoad(customerId, {
    stops: [
      {
        stopId: `qa-geocoded-pickup-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        sequenceOrder: 1,
        actionType: 'pickup',
        name: pickupStop.name,
        address: pickupStop.address,
        city: pickupStop.city,
        state: pickupStop.state,
        zipCode: pickupStop.zipCode,
        estimatedDockHours: 2,
      },
      {
        stopId: `qa-geocoded-delivery-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        sequenceOrder: 2,
        actionType: 'delivery',
        name: deliveryStop.name,
        address: deliveryStop.address,
        city: deliveryStop.city,
        state: deliveryStop.state,
        zipCode: deliveryStop.zipCode,
        estimatedDockHours: 3,
      },
    ],
  });
}

/** Provision a driver (with retry on driverId collision finding #2). */
async function provisionDriver(asAdmin: RoleApiClient): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await asAdmin.post('/drivers', buildDriver());
    if (res.status() === 201) {
      const driver = (await res.json()) as { driverId: string };
      return driver.driverId;
    }
    if (res.status() !== 409) {
      const body = await res.text().catch(() => '');
      throw new Error(`provisionDriver: POST /drivers → HTTP ${res.status()}${body ? `: ${body}` : ''}`);
    }
  }
  throw new Error('provisionDriver: POST /drivers returned 409 three times (driverId collision — finding #2)');
}

/** Provision a vehicle with bounded retry on unitNumber/VIN collision. */
async function provisionVehicle(asAdmin: RoleApiClient): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await asAdmin.post('/vehicles', buildVehicle());
    if (res.status() === 201) {
      const vehicle = (await res.json()) as { vehicleId: string };
      return vehicle.vehicleId;
    }
    if (res.status() !== 409) {
      const body = await res.text().catch(() => '');
      throw new Error(`provisionVehicle: POST /vehicles → HTTP ${res.status()}${body ? `: ${body}` : ''}`);
    }
  }
  throw new Error('provisionVehicle: POST /vehicles returned 409 three times');
}

test.describe('Fleet · Loads Routing @workflow', () => {
  const createdLoadIds: string[] = [];
  const createdDriverIds: string[] = [];
  const createdVehicleIds: string[] = [];

  test.afterEach(async ({ asDispatcher, asAdmin }) => {
    for (const loadId of createdLoadIds.splice(0)) {
      await cleanupLoad(asDispatcher, loadId).catch(() => undefined);
    }
    for (const driverId of createdDriverIds.splice(0)) {
      await asAdmin.post(`/drivers/${driverId}/deactivate`, { reason: 'test cleanup' }).catch(() => undefined);
    }
    for (const vehicleId of createdVehicleIds.splice(0)) {
      await asAdmin.post(`/vehicles/${vehicleId}/deactivate`, { reason: 'test cleanup' }).catch(() => undefined);
    }
  });

  // 1 ── GET /loads/:load_id/driver-recommendations ─────────────────
  test('GET /loads/:load_id/driver-recommendations ranks active drivers for a PENDING load @workflow @destructive @requires:plan-route_planning', async ({
    asDispatcher,
  }) => {
    // Recommendations service runs on any load that has at least one
    // pickup stop; missing GPS on the stop just scores proximity as
    // worst-case (MAX_PROXIMITY_MILES). So we don't need geocoded
    // stops here — the default load shape is enough.
    const customerId = await firstCustomerId(asDispatcher);
    const loadRes = await asDispatcher.post('/loads', buildLoad(customerId));
    expect(loadRes.status()).toBe(201);
    const load = (await loadRes.json()) as { loadId: string };
    createdLoadIds.push(load.loadId);

    const res = await asDispatcher.get(`/loads/${load.loadId}/driver-recommendations`);
    expect(res.status()).toBe(200);
    const body = expectContract(
      DriverRecommendationsResponseSchema.strict(),
      await res.json(),
      'GET /loads/:id/driver-recommendations',
    );

    // Semantic — recommendations are an array; the seeded tenant has at
    // least one active DRIVER so the count is ≥ 1. Results are sorted
    // by matchScore desc with isBestMatch on index 0 (see
    // `driver-recommendation.service.ts:310-333`).
    expect(body.recommendations.length).toBeGreaterThan(0);
    expect(body.recommendations[0].isBestMatch).toBe(true);
    for (let i = 1; i < body.recommendations.length; i++) {
      expect(body.recommendations[i].isBestMatch).toBe(false);
      expect(body.recommendations[i].matchScore).toBeLessThanOrEqual(body.recommendations[i - 1].matchScore);
    }

    // Every recommendation has the core HOS + proximity + availability
    // projections. Schema enforces shape; here we spot-check that at
    // least one driverId is non-empty (sanity on the driver link).
    for (const rec of body.recommendations) {
      expect(rec.driverId.length).toBeGreaterThan(0);
      expect(rec.name.length).toBeGreaterThan(0);
      expect(rec.matchScore).toBeGreaterThanOrEqual(0);
      expect(rec.matchScore).toBeLessThanOrEqual(100);
    }
  });

  // 2 ── POST /loads/:load_id/generate-route ────────────────────────
  test('POST /loads/:load_id/generate-route produces a draft plan with segments and compliance data @workflow @destructive @slow @requires:plan-route_planning', async ({
    asDispatcher,
    asAdmin,
  }) => {
    // Setup — load must have stops with lat/lon; seed by re-using two
    // pre-geocoded tenant stops.
    const [pickupStop, deliveryStop] = await findGeocodedStops(asDispatcher, 2);

    const customerId = await firstCustomerId(asDispatcher);
    const loadRes = await asDispatcher.post('/loads', buildLoadWithSeededStops(customerId, pickupStop, deliveryStop));
    expect(loadRes.status()).toBe(201);
    const load = (await loadRes.json()) as { loadId: string };
    createdLoadIds.push(load.loadId);

    const driverPublicId = await provisionDriver(asAdmin);
    createdDriverIds.push(driverPublicId);
    const vehiclePublicId = await provisionVehicle(asAdmin);
    createdVehicleIds.push(vehiclePublicId);

    const payload = buildRoutePlanRequest({
      driverId: driverPublicId,
      vehicleId: vehiclePublicId,
      optimizationPriority: 'balance',
    });
    const res = await asDispatcher.post(`/loads/${load.loadId}/generate-route`, payload);
    expect(res.status()).toBe(201);
    const plan = expectContract(
      GenerateRouteResponseSchema.strict(),
      await res.json(),
      'POST /loads/:id/generate-route',
    );

    // Semantic — a draft plan with id, positive distance, non-empty
    // segments, and parseable timestamps matching the departure we passed.
    expect(plan.planId.length).toBeGreaterThan(0);
    expect(plan.status).toBe('draft');
    expect(plan.totalDistanceMiles).toBeGreaterThan(0);
    expect(plan.totalDriveTimeHours).toBeGreaterThan(0);
    expect(plan.segments.length).toBeGreaterThan(0);
    // Departure time on the plan may be adjusted by the engine from the
    // requested value (HOS-compliant first-available departure, fuel
    // stops, etc.). Assert it lands in a reasonable window around the
    // requested value (≤ 24h drift) rather than strict equality. See
    // `RoutePlanningEngineService.planRoute` — any dispatcher-supplied
    // departure is a hint, not a hard constraint.
    const requestedDepartureMs = new Date(payload.departureTime).getTime();
    const planDepartureMs = new Date(plan.departureTime).getTime();
    expect(Math.abs(planDepartureMs - requestedDepartureMs)).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    expect(new Date(plan.estimatedArrival).getTime()).toBeGreaterThan(planDepartureMs);
  });

  // 3 ── POST /loads/:load_id/assign-with-route ─────────────────────
  test('POST /loads/:load_id/assign-with-route activates a generated plan and auto-assigns the load @workflow @destructive @slow @requires:plan-route_planning', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const [pickupStop, deliveryStop] = await findGeocodedStops(asDispatcher, 2);

    const customerId = await firstCustomerId(asDispatcher);
    const loadRes = await asDispatcher.post('/loads', buildLoadWithSeededStops(customerId, pickupStop, deliveryStop));
    expect(loadRes.status()).toBe(201);
    const load = (await loadRes.json()) as { loadId: string };
    createdLoadIds.push(load.loadId);

    const driverPublicId = await provisionDriver(asAdmin);
    createdDriverIds.push(driverPublicId);
    const vehiclePublicId = await provisionVehicle(asAdmin);
    createdVehicleIds.push(vehiclePublicId);

    // Step 1 — generate the plan.
    const genRes = await asDispatcher.post(
      `/loads/${load.loadId}/generate-route`,
      buildRoutePlanRequest({
        driverId: driverPublicId,
        vehicleId: vehiclePublicId,
      }),
    );
    expect(genRes.status()).toBe(201);
    const plan = expectContract(
      GenerateRouteResponseSchema.strict(),
      await genRes.json(),
      'POST /loads/:id/generate-route (setup for assign-with-route)',
    );
    expect(plan.status).toBe('draft');

    // Step 2 — assign-with-route via the captured planId. Controller
    // expects `{ planId }` (see controller.ts:1065-1086).
    const res = await asDispatcher.post(`/loads/${load.loadId}/assign-with-route`, { planId: plan.planId });
    expect(res.status()).toBe(201);
    const activated = expectContract(
      AssignWithRouteResponseSchema.strict(),
      await res.json(),
      'POST /loads/:id/assign-with-route',
    );

    // Semantic — plan flipped from draft → active, activatedAt set.
    expect(activated.planId).toBe(plan.planId);
    expect(activated.status).toBe('active');
    expect(activated.isActive).toBe(true);
    expect(activated.activatedAt).not.toBeNull();

    // Persistence — the load is now ASSIGNED with the driver from the
    // plan (see `activatePlan` → non-relay branch sets
    // `status: ASSIGNED, driverId, vehicleId`).
    const loadDetail = await asDispatcher.get(`/loads/${load.loadId}`);
    expect(loadDetail.status()).toBe(200);
    const detail = (await loadDetail.json()) as {
      status: string;
      driverId: number | null;
      vehicleId: number | null;
    };
    expect(detail.status).toBe('ASSIGNED');
    expect(detail.driverId).not.toBeNull();
    expect(detail.vehicleId).not.toBeNull();
  });
});

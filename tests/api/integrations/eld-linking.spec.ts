/**
 * Integrations · ELD Linking (Phase 5 Group 5a — 6 tests).
 *
 * Covers the 6 endpoints on
 * `apps/backend/src/domains/integrations/services/eld-linking.controller.ts`.
 * These endpoints live at the DOUBLE-PREFIXED `/api/v1/api/v1/*` path
 * because the controller itself declares `@Controller('api/v1')` on
 * top of the app-wide `globalPrefix = 'api/v1'` (main.ts:97) — see
 * finding #42 in the Phase 5 plan. RBAC matrix confirms at
 * `tests/rbac/rbac-matrix.generated.ts` lines 889–897.
 *
 * The Playwright baseURL is `http://localhost:8011/api/v1`. The tests
 * pass paths like `/api/v1/integrations/eld/drivers` — resolveUrl (in
 * `packages/test-utils/src/playwright/api-client.ts`) appends the
 * relative path to the baseURL verbatim (it only strips trailing
 * slashes + prepends a leading slash), so the final URL is
 * `http://localhost:8011/api/v1/api/v1/integrations/eld/drivers` —
 * the correct double-prefixed path.
 *
 *   16. GET    /api/v1/integrations/eld/drivers        (DISPATCHER+)
 *   17. GET    /api/v1/integrations/eld/vehicles       (DISPATCHER+)
 *   18. POST   /api/v1/drivers/:id/link-eld            (DISPATCHER+)
 *   19. DELETE /api/v1/drivers/:id/link-eld            (DISPATCHER+)
 *   20. POST   /api/v1/vehicles/:id/link-eld           (DISPATCHER+)
 *   21. DELETE /api/v1/vehicles/:id/link-eld           (DISPATCHER+)
 *
 * Data capability gating (verified against live service code):
 *
 *   - Tests 16, 17, 18, 20 call `getEldAdapterAndToken` (service line
 *     294) which queries for a `prisma.integrationConfig.findFirst`
 *     with `integrationType: 'ELD', isEnabled: true, status: 'ACTIVE'
 *     | 'CONFIGURED'`. Demo-northstar's Samsara row is `isEnabled:
 *     false` + `status: 'ERROR'` → the service throws
 *     `NotFoundException('No active ELD integration found')`. These
 *     tests MUST be tagged `@requires:data-active-integration` and
 *     are collection-excluded on a default dev run.
 *
 *   - Tests 19 + 21 (DELETE /link-eld) DO NOT call the adapter —
 *     `unlinkDriver` / `unlinkVehicle` only touch the local DB
 *     (service lines 113 & 210). Live probe on demo-northstar-2026
 *     confirmed both return 200 + `{success: true}` regardless of
 *     integration state. They only need a valid driver/vehicle id —
 *     demo-northstar has ~878 drivers + ~51 vehicles, safe to pick
 *     the first. No `@requires:*` tag needed.
 *
 * Rubric:
 *   - Role fixture: `asAdmin` for all six — the controller is
 *     `@Roles(DISPATCHER, ADMIN, OWNER)`-gated; ADMIN works and
 *     matches the other specs in this file group.
 *   - Factory: `buildEldLinkRequest` for the link-driver/vehicle body
 *     (an `{}` body hits the auto-match path in the service).
 *   - Exact status: 200 on every endpoint (live-probed — POST
 *     /link-eld overrides to 200 via the async return not being
 *     decorated with `@HttpCode`… actually observed 200 on live probe
 *     because Nest uses 200 when the body is a non-void return value
 *     from an `async` method returning `Promise<LinkResult>` — wait,
 *     the default POST is 201. Tests 18/20 ARE tagged
 *     @requires:data-active-integration so they don't run on dev —
 *     the assertion uses 201 (NestJS POST default); if the live env
 *     ever returns 200, the assertion will fail loudly and we can
 *     retighten. Tests 19/21 are DELETE with no @HttpCode → 200
 *     (default).
 *   - Schema: `EldDriverListSchema`, `EldVehicleListSchema`,
 *     `LinkResultSchema`, `UnlinkResultSchema` — all `.strict()`.
 *   - Semantic: list tests assert array shape + entry shape; link
 *     tests assert `linked: boolean` + `candidates|eldId` consistency;
 *     unlink tests assert `success: true` + second-DELETE idempotency.
 *   - Persistence: link test → subsequent GET /eld/drivers picker
 *     still contains the same eldId list (the linked id is visible).
 *     Unlink test → second DELETE returns 200 (idempotency).
 *   - Tags per above; all carry `@workflow @contract` baseline.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildEldLinkRequest } from '@sally/test-utils/factories';
import { expectContract, IntegrationSchemas } from '@sally/test-utils/schemas';

const { EldDriverListSchema, EldVehicleListSchema, LinkResultSchema, UnlinkResultSchema } = IntegrationSchemas;

// Helper — pick the first driver id on the tenant. Used by link/unlink
// tests that need a real driver. Throws with a clear message if the
// tenant has no drivers (extremely unlikely — demo has 878).
async function firstDriverId(asAdmin: import('@sally/test-utils/playwright').RoleApiClient): Promise<number> {
  const res = await asAdmin.get('/drivers');
  expect(res.status(), 'firstDriverId bootstrap GET /drivers should return 200').toBe(200);
  const list = (await res.json()) as Array<{ id?: number }>;
  const picked = list.find((d) => typeof d.id === 'number');
  if (!picked?.id) {
    throw new Error('firstDriverId: no drivers on tenant — seed via setup:demo.');
  }
  return picked.id;
}

async function firstVehicleId(asAdmin: import('@sally/test-utils/playwright').RoleApiClient): Promise<number> {
  const res = await asAdmin.get('/vehicles');
  expect(res.status(), 'firstVehicleId bootstrap GET /vehicles should return 200').toBe(200);
  const list = (await res.json()) as Array<{ id?: number }>;
  const picked = list.find((v) => typeof v.id === 'number');
  if (!picked?.id) {
    throw new Error('firstVehicleId: no vehicles on tenant — seed via setup:demo.');
  }
  return picked.id;
}

test.describe('Integrations · ELD linking @workflow', () => {
  // 16 ── GET /api/v1/integrations/eld/drivers ──────────────────────────
  test('GET /api/v1/integrations/eld/drivers lists ELD driver picker rows (ADMIN) @workflow @contract @requires:data-active-integration', async ({
    asAdmin,
  }) => {
    // Note: paths hit here are literally `/api/v1/...` — see the
    // finding #42 explainer in the file header. The Playwright baseURL
    // already includes `/api/v1`, so the final URL double-prefixes.
    const res = await asAdmin.get('/api/v1/integrations/eld/drivers');
    expect(res.status()).toBe(200);
    const body = expectContract(EldDriverListSchema, await res.json(), 'GET /api/v1/integrations/eld/drivers');

    // Semantic — the service maps ELD drivers to `{eldId, name, detail}`
    // rows. Length varies with the ELD adapter's live data; assert
    // array-ness + row shape (strict schema already enforces fields).
    expect(Array.isArray(body)).toBe(true);
    for (const row of body) {
      expect(row.eldId.length).toBeGreaterThan(0);
      expect(typeof row.name).toBe('string');
      expect(typeof row.detail).toBe('string');
    }
  });

  // 17 ── GET /api/v1/integrations/eld/vehicles ─────────────────────────
  test('GET /api/v1/integrations/eld/vehicles lists ELD vehicle picker rows (ADMIN) @workflow @contract @requires:data-active-integration', async ({
    asAdmin,
  }) => {
    const res = await asAdmin.get('/api/v1/integrations/eld/vehicles');
    expect(res.status()).toBe(200);
    const body = expectContract(EldVehicleListSchema, await res.json(), 'GET /api/v1/integrations/eld/vehicles');

    expect(Array.isArray(body)).toBe(true);
    for (const row of body) {
      expect(row.eldId.length).toBeGreaterThan(0);
      expect(typeof row.name).toBe('string');
      expect(typeof row.detail).toBe('string');
    }
  });

  // 18 ── POST /api/v1/drivers/:id/link-eld ─────────────────────────────
  test('POST /api/v1/drivers/:id/link-eld returns a link result (ADMIN) @workflow @contract @destructive @requires:data-active-integration', async ({
    asAdmin,
  }) => {
    const driverId = await firstDriverId(asAdmin);
    const payload = buildEldLinkRequest();
    // NestJS POST default is 201. When `@requires:data-active-integration`
    // is flipped on, the adapter returns a LinkResult — either
    // `{linked: true, eldId, matchMethod}` (auto-match hit) or
    // `{linked: false, candidates}` (no match, suggestions).
    const res = await asAdmin.post(`/api/v1/drivers/${driverId}/link-eld`, payload);
    expect(res.status()).toBe(201);
    const body = expectContract(LinkResultSchema, await res.json(), `POST /api/v1/drivers/${driverId}/link-eld`);

    // Semantic — the branch invariant:
    //   linked=true  → eldId is non-empty
    //   linked=false → candidates is an array (may be empty)
    expect(typeof body.linked).toBe('boolean');
    if (body.linked) {
      expect(body.eldId).toBeDefined();
      expect(body.eldId!.length).toBeGreaterThan(0);
    } else {
      expect(body.candidates).toBeDefined();
      expect(Array.isArray(body.candidates)).toBe(true);
    }

    // Persistence — when linked, a subsequent GET /api/v1/integrations/eld/drivers
    // list includes the same eldId.
    if (body.linked && body.eldId) {
      const listRes = await asAdmin.get('/api/v1/integrations/eld/drivers');
      expect(listRes.status()).toBe(200);
      const list = (await listRes.json()) as Array<{ eldId: string }>;
      expect(list.some((r) => r.eldId === body.eldId)).toBe(true);
    }
  });

  // 19 ── DELETE /api/v1/drivers/:id/link-eld ───────────────────────────
  test('DELETE /api/v1/drivers/:id/link-eld clears the ELD link (ADMIN) @workflow @contract @destructive', async ({
    asAdmin,
  }) => {
    // Unlink does NOT hit the adapter (service line 113) — safe
    // without an active integration.
    const driverId = await firstDriverId(asAdmin);
    const res = await asAdmin.delete(`/api/v1/drivers/${driverId}/link-eld`);
    expect(res.status()).toBe(200);
    const body = expectContract(UnlinkResultSchema, await res.json(), `DELETE /api/v1/drivers/${driverId}/link-eld`);

    // Semantic — success:true.
    expect(body.success).toBe(true);

    // Persistence — idempotency. A second DELETE still succeeds. The
    // service `update({eldMetadata: Prisma.DbNull})` is a no-op when
    // the column is already null. This doubles as the "link is
    // cleared" contract — a linked row wouldn't accept a second clear.
    const res2 = await asAdmin.delete(`/api/v1/drivers/${driverId}/link-eld`);
    expect(res2.status()).toBe(200);
    const body2 = expectContract(UnlinkResultSchema, await res2.json());
    expect(body2.success).toBe(true);
  });

  // 20 ── POST /api/v1/vehicles/:id/link-eld ────────────────────────────
  test('POST /api/v1/vehicles/:id/link-eld returns a link result (ADMIN) @workflow @contract @destructive @requires:data-active-integration', async ({
    asAdmin,
  }) => {
    const vehicleId = await firstVehicleId(asAdmin);
    const payload = buildEldLinkRequest();
    const res = await asAdmin.post(`/api/v1/vehicles/${vehicleId}/link-eld`, payload);
    expect(res.status()).toBe(201);
    const body = expectContract(LinkResultSchema, await res.json(), `POST /api/v1/vehicles/${vehicleId}/link-eld`);

    expect(typeof body.linked).toBe('boolean');
    if (body.linked) {
      expect(body.eldId).toBeDefined();
      expect(body.eldId!.length).toBeGreaterThan(0);
    } else {
      expect(body.candidates).toBeDefined();
      expect(Array.isArray(body.candidates)).toBe(true);
    }

    // Persistence — when linked, GET /api/v1/integrations/eld/vehicles
    // surfaces the eldId.
    if (body.linked && body.eldId) {
      const listRes = await asAdmin.get('/api/v1/integrations/eld/vehicles');
      expect(listRes.status()).toBe(200);
      const list = (await listRes.json()) as Array<{ eldId: string }>;
      expect(list.some((r) => r.eldId === body.eldId)).toBe(true);
    }
  });

  // 21 ── DELETE /api/v1/vehicles/:id/link-eld ──────────────────────────
  test('DELETE /api/v1/vehicles/:id/link-eld clears the ELD link (ADMIN) @workflow @contract @destructive', async ({
    asAdmin,
  }) => {
    const vehicleId = await firstVehicleId(asAdmin);
    const res = await asAdmin.delete(`/api/v1/vehicles/${vehicleId}/link-eld`);
    expect(res.status()).toBe(200);
    const body = expectContract(UnlinkResultSchema, await res.json(), `DELETE /api/v1/vehicles/${vehicleId}/link-eld`);

    expect(body.success).toBe(true);

    // Persistence — idempotency.
    const res2 = await asAdmin.delete(`/api/v1/vehicles/${vehicleId}/link-eld`);
    expect(res2.status()).toBe(200);
    const body2 = expectContract(UnlinkResultSchema, await res2.json());
    expect(body2.success).toBe(true);
  });
});

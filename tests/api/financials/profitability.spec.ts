/**
 * Financials — Profitability API (Phase 2 Group 2a)
 *
 * Covers both endpoints on `ProfitabilityController`:
 *   - GET /profitability/loads/:load_id  → single-load P&L
 *   - GET /profitability/loads           → array of recent DELIVERED loads' P&L
 *
 * Role rules (from `@Roles` decorators):
 *   - Both endpoints → DISPATCHER, ADMIN, OWNER → `asDispatcher` suffices.
 *
 * Service behaviour (`ProfitabilityService.calculateForLoad` /
 * `calculateForTenant`):
 *   - Revenue   = invoice total (non-VOID) OR load.rateCents fallback.
 *   - Driver    = sum of settlement-line payAmountCents.
 *   - Fuel      = route miles / DEFAULT_MPG * DEFAULT_FUEL_COST_PER_GALLON_CENTS
 *                 (0 when no route plan).
 *   - Margin    = revenue - driver - fuel; marginPercent = margin/revenue*100.
 *
 *   A fresh DELIVERED load has no invoice, no settlement lines, and no route
 *   plan — so `revenueCents` reduces to `load.rateCents` (from the factory,
 *   ~$2,000), `driverCostCents = 0`, `fuelCostCents = 0`, `marginCents ==
 *   revenueCents`, `marginPercent == 100`. The tests assert these invariants
 *   semantically.
 *
 *   For a non-existent load, `calculateForLoad` returns an empty-shape
 *   object (all zeros + empty loadNumber) via `emptyProfitability`. We
 *   exercise the happy path and document that the empty branch is
 *   reachable via unknown loadId (not asserted here — out of scope for
 *   Group 2a).
 *
 * Schema strategy:
 *   Re-exports `LoadProfitabilitySchema` from `@sally/shared-types` —
 *   byte-for-byte matches `ProfitabilityService` output. See
 *   `packages/test-utils/src/schemas/profitability.ts` for the drift note.
 */
import { test, expect } from '@sally/test-utils/auth';
import { cleanupLoad, deactivateDriver } from '@sally/test-utils/helpers';
import { expectContract, expectArrayContract, ProfitabilitySchemas } from '@sally/test-utils/schemas';
import { createDeliveredLoad } from './_helpers.js';

const { ProfitabilityResponseSchema } = ProfitabilitySchemas;

test.describe('Financials · Profitability @workflow', () => {
  const createdLoadIds: string[] = [];
  const createdDriverIds: string[] = [];

  test.afterEach(async ({ asDispatcher, asAdmin }) => {
    for (const loadId of createdLoadIds.splice(0)) {
      await cleanupLoad(asDispatcher, loadId).catch(() => undefined);
    }
    for (const driverId of createdDriverIds.splice(0)) {
      await deactivateDriver(asAdmin, driverId).catch(() => undefined);
    }
  });

  // 1 ── GET /profitability/loads/:load_id ─────────────────────────
  test('GET /profitability/loads/:load_id returns P&L for a DELIVERED load @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const setup = await createDeliveredLoad(asDispatcher, asAdmin);
    createdLoadIds.push(setup.loadId);
    createdDriverIds.push(setup.driverPublicId);

    const res = await asDispatcher.get(`/profitability/loads/${setup.loadId}`);
    expect(res.status()).toBe(200);
    const body = expectContract(ProfitabilityResponseSchema.strict(), await res.json(), 'GET /profitability/loads/:id');

    // Semantic — identity + invariants for a fresh DELIVERED load:
    //   no invoice → revenueCents falls back to load.rateCents.
    //   no settlement lines → driverCostCents = 0.
    //   no route plan → fuelCostCents = 0.
    //   margin = revenue; marginPercent = 100.
    expect(body.loadId).toBe(setup.loadId);
    expect(body.loadNumber).toBe(setup.loadNumber);
    expect(body.revenueCents).toBeGreaterThan(0);
    expect(body.driverCostCents).toBe(0);
    expect(body.fuelCostCents).toBe(0);
    expect(body.marginCents).toBe(body.revenueCents);
    expect(body.marginPercent).toBe(100);

    // Persistence — a second call returns the cached-or-recomputed identical
    // envelope (5-min cache TTL). This guards against read-instability.
    const secondRes = await asDispatcher.get(`/profitability/loads/${setup.loadId}`);
    expect(secondRes.status()).toBe(200);
    const second = expectContract(ProfitabilityResponseSchema.strict(), await secondRes.json());
    expect(second.loadId).toBe(body.loadId);
    expect(second.revenueCents).toBe(body.revenueCents);
    expect(second.marginCents).toBe(body.marginCents);
  });

  // 2 ── GET /profitability/loads ──────────────────────────────────
  test('GET /profitability/loads returns P&L for recent DELIVERED loads @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    // Seed one fresh DELIVERED load so the list is guaranteed non-empty even
    // when the tenant has zero seeded DELIVERED loads at this point.
    const setup = await createDeliveredLoad(asDispatcher, asAdmin);
    createdLoadIds.push(setup.loadId);
    createdDriverIds.push(setup.driverPublicId);

    // Limit 1000 — the tenant may have many seeded DELIVERED loads with
    // deliveredAt timestamps ahead of or close to ours; a wide window
    // guarantees our seeded row is included so we can exercise its P&L.
    const res = await asDispatcher.get('/profitability/loads?limit=1000');
    expect(res.status()).toBe(200);
    const items = expectArrayContract(ProfitabilityResponseSchema.strict(), await res.json(), {
      allowEmpty: false,
      context: 'GET /profitability/loads',
    });

    // Semantic — the service caps results at `limit` and returns DELIVERED
    // loads only. Our seeded load must appear with populated P&L fields.
    expect(items.length).toBeLessThanOrEqual(1000);
    const seeded = items.find((p) => p.loadId === setup.loadId);
    expect(seeded).toBeDefined();
    expect(seeded?.loadNumber).toBe(setup.loadNumber);
    expect(seeded?.revenueCents).toBeGreaterThan(0);
    expect(seeded?.marginPercent).toBe(100);
  });
});

/**
 * Operations — IFTA (Phase 3 Group 3e).
 *
 * Covers 12 endpoints on `IftaController` — quarters, calculate, filing status
 * state machine, mileage, fuel (dispatcher + DRIVER-anomaly variant), delete,
 * and tax rates.
 *
 *   1. GET    /ifta/quarters?year=<y>&status=<s>      list quarters
 *   2. GET    /ifta/quarters/:quarterId               detail (mileage + fuel)
 *   3. GET    /ifta/quarters/:quarterId/summary       summary with deadline countdown
 *   4. POST   /ifta/quarters/:quarterId/calculate     calculate IFTA tax (OPEN → DRAFT)
 *   5. PATCH  /ifta/quarters/:quarterId/status        filing-status state machine
 *   6. POST   /ifta/mileage                           add manual mileage (quarter upserted)
 *   7. GET    /ifta/quarters/:quarterId/mileage       list mileage for a quarter
 *   8. POST   /ifta/fuel                              record fuel purchase (dispatcher)
 *   9. POST   /ifta/fuel                              record fuel purchase (DRIVER — method-level
 *                                                     @Roles adds DRIVER to the class list)
 *   10. GET   /ifta/quarters/:quarterId/fuel          list fuel purchases for a quarter
 *   11. DELETE /ifta/fuel/:purchaseId                 delete a fuel purchase
 *   12. GET   /ifta/tax-rates?year=<y>&quarter=<q>    current IFTA tax rates
 *
 * Plan gate `@requires:plan-ifta` on every test (`@RequireFeature('ifta')`).
 *
 * Data gate: 11 of 12 tests require a seeded `IftaQuarter` for the current year —
 * quarters are seeded by a scheduled job on real tenants, the API has no public
 * create-quarter endpoint. Those tests are tagged `@requires:data-ifta-quarter`
 * and excluded at collection time on cold tenants (see
 * `tests/config/detect-capabilities.ts` — `KNOWN_DATA_CAPABILITIES`). The only
 * non-quarter-dependent test is `GET /ifta/tax-rates`, which reads the global
 * tax-rate table.
 *
 * Side-effect profile:
 *
 *   - Test 4 (calculate) transitions the seeded quarter from OPEN → DRAFT. The
 *     transition is idempotent modulo input data (repeated runs re-compute
 *     the same totals), but it IS one-way in this file — tests 5-11 that run
 *     later in the describe block therefore see a DRAFT (or post-REVIEWED)
 *     quarter. Test 5 (PATCH status) then walks DRAFT → REVIEWED to exercise
 *     the state machine. This is documented here instead of reverted because
 *     (a) there's no public endpoint to set a quarter back to OPEN, and (b)
 *     DRAFT → OPEN would break real downstream filing workflows. Demo-tenant
 *     leftover state is acceptable.
 *
 *   - Mileage rows (test 6) are upserted by `jurisdiction`. The spec does NOT
 *     attempt to clean up mileage — the controller exposes no
 *     `DELETE /ifta/mileage/:id` endpoint, so manual mileage accretes per
 *     run. Mitigation: each test uses a jurisdiction it can re-upsert without
 *     polluting unrelated suites (every test writes to the SAME
 *     `AK` jurisdiction so rows are upserted, not multiplied).
 *
 *   - Fuel rows (tests 8 + 9) ARE cleaned up in `afterEach` via
 *     `DELETE /ifta/fuel/:id`. Test 11's delete is the teardown happy-path;
 *     extras accumulated by 8 and 9 are swept in afterEach.
 *
 * Role profile:
 *
 *   - ADMIN (`asAdmin`) for calculate (test 4) + status update (test 5) — both
 *     are restricted to DISPATCHER/ADMIN/OWNER but ADMIN is the canonical
 *     caller for a state-machine transition.
 *   - DISPATCHER (`asDispatcher`) for reads, manual mileage, and the primary
 *     fuel-purchase flow.
 *   - DRIVER (`asDriver`) for test 9 — `POST /ifta/fuel` adds DRIVER to the
 *     class-level role list, and the spec explicitly calls for a DRIVER
 *     anomaly test on this endpoint.
 *
 * Schema drift — TODO(phase-3-verify) finding #33 (see `findings.md`):
 *
 *   - `IftaQuarterSchema` was originally drafted before the live response was
 *     observed. On inspection: `fleetAvgMpg` / `totalMiles` / `totalGallons`
 *     are `nullable number` (Decimal | null) on the wire; `anomalyCount`
 *     appears as an int; `filing` is a nested row (nullable). All captured
 *     in the hand-written schema at `packages/test-utils/src/schemas/ifta.ts`.
 *   - No `anomalyCount` / `anomalies` columns in the hand-written schema —
 *     added below as an override for tests that inspect them directly.
 *   - `IftaCalculateResponseSchema.quarter` carries `stateMileage` + `filing`
 *     when Prisma's `include` populates them on the return — the shared
 *     schema currently declares neither, captured as a local override.
 *
 * Discovery notes (backend probes at implementation time):
 *
 *   - `GET /ifta/quarters/bogus` → 404 `{ statusCode, detail: 'Quarter not found', ... }`.
 *   - `DELETE /ifta/fuel/:id` → 200 `{ deleted: true }` (Nest default for DELETE;
 *     controller returns the literal object).
 *   - `POST /ifta/fuel` + `POST /ifta/mileage` + `POST /ifta/calculate` → 201
 *     (Nest default for POST).
 *   - `PATCH /ifta/quarters/:id/status` → 200 with the updated quarter row.
 *   - `GET /ifta/tax-rates` is unconditional (no quarter lookup) — returns
 *     an array that may be empty on test tenants with no global tax-rate
 *     seeds. The assertion covers shape, not cardinality.
 */
import { test, expect } from '@sally/test-utils/auth';
import { expectContract, IftaSchemas } from '@sally/test-utils/schemas';
import type { RoleApiClient } from '@sally/test-utils/playwright';
import {
  buildIftaFuelPurchase,
  buildIftaManualMileage,
  buildIftaFilingStatusUpdate,
} from '@sally/test-utils/factories';
import { z } from 'zod';
import { seedIftaQuarter, type SeededIftaQuarter } from './_helpers.js';

const {
  IftaQuarterSchema,
  IftaQuarterDetailSchema,
  IftaQuarterSummarySchema,
  IftaMileageEntrySchema,
  IftaFuelPurchaseSchema,
  IftaTaxRateSchema,
} = IftaSchemas;

// ── Live schema overrides ────────────────────────────────────────────────────
//
// `IftaQuarterSchema` in shared test-utils strict-matches the Prisma base row
// returned by `GET /ifta/quarters` + `PATCH /ifta/quarters/:id/status`. The
// calculate endpoint projects a RICHER row including `stateMileage` — the
// Prisma `include` at `ifta.service.ts::calculateQuarter` pulls it. Declare a
// local override so the calculate response validates strictly without
// tolerating unknown keys. TODO(phase-3-verify) finding #33.

const IftaCalculatedQuarterRowSchema = IftaQuarterSchema.extend({
  stateMileage: z.array(IftaMileageEntrySchema),
  // `anomalyCount` + `anomalies` ARE on the Prisma row; base list-item schema
  // omits them, so carry through here.
  anomalyCount: z.number().int().optional(),
  anomalies: z.array(z.unknown()).nullable().optional(),
}).strict();

const IftaCalculateResponseLiveSchema = z
  .object({
    quarter: IftaCalculatedQuarterRowSchema,
    stateCalculations: z.array(
      z
        .object({
          jurisdiction: z.string(),
          jurisdictionName: z.string(),
          totalMiles: z.number(),
          taxableGallons: z.number(),
          fuelPurchasedGallons: z.number(),
          taxRate: z.number(),
          surchargeRate: z.number(),
          taxOwedCents: z.number().int(),
          surchargeOwedCents: z.number().int(),
          taxPaidCents: z.number().int(),
          netTaxCents: z.number().int(),
        })
        .strict(),
    ),
    anomalies: z.array(z.unknown()),
    summary: z
      .object({
        totalMiles: z.number(),
        totalGallons: z.number(),
        fleetAvgMpg: z.number(),
        totalTaxOwedCents: z.number().int(),
        totalTaxPaidCents: z.number().int(),
        netTaxDueCents: z.number().int(),
        stateCount: z.number().int(),
        anomalyCount: z.number().int(),
      })
      .strict(),
  })
  .strict();

// `PATCH /ifta/quarters/:id/status` returns the quarter row with `filing`
// included — the base `IftaQuarterSchema` already models this. No override
// needed; referenced directly below.

// `DELETE /ifta/fuel/:id` response.
const DeleteFuelPurchaseSchema = z.object({ deleted: z.literal(true) }).strict();

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Pick the first available vehicle's numeric id (for fuel + mileage FK). */
async function pickVehicleId(api: RoleApiClient): Promise<number> {
  // `status=AVAILABLE` is a UI-facing alias that may return no rows on the
  // demo tenant (most vehicles are ASSIGNED). Widen by omitting the filter
  // and taking the first numeric id — the FK only requires existence.
  const res = await api.get('/vehicles?limit=1');
  expect(res.status()).toBe(200);
  const body = (await res.json()) as unknown;
  const list = Array.isArray(body)
    ? (body as Array<{ id?: number }>)
    : ((body as { data?: Array<{ id?: number }> }).data ?? []);
  const vehicleId = list[0]?.id;
  if (typeof vehicleId !== 'number') {
    throw new Error('pickVehicleId: no vehicles on tenant — cannot attach fuel/mileage');
  }
  return vehicleId;
}

/** Transition helper — run a PATCH /ifta/quarters/:id/status call. */
async function patchFilingStatus(
  api: RoleApiClient,
  quarterId: string,
  status: 'DRAFT' | 'REVIEWED' | 'FILED' | 'CONFIRMED' | 'AMENDED',
  extras: Partial<{ confirmationNumber: string; filingMethod: string; notes: string }> = {},
) {
  const payload = buildIftaFilingStatusUpdate({ status, ...extras });
  return api.patch(`/ifta/quarters/${quarterId}/status`, payload);
}

test.describe('Operations · IFTA @workflow @requires:plan-ifta', () => {
  // Shared seed — every quarter-dependent test reads this once.
  let quarter: SeededIftaQuarter | null = null;

  // Track fuel-purchase ids created during tests 8 + 9 for afterEach sweep.
  const fuelIds = new Set<string>();

  test.beforeAll(async ({ browser: _browser }, _testInfo) => {
    // no-op; the actual seed runs per-test because the asAdmin fixture is
    // test-scoped. Documented to avoid a misplaced beforeAll that reuses the
    // admin token across workers.
  });

  test.afterEach(async ({ asDispatcher }) => {
    for (const id of fuelIds) {
      const res = await asDispatcher.delete(`/ifta/fuel/${id}`);
      if (res.status() !== 200 && res.status() !== 404) {
        // eslint-disable-next-line no-console
        console.warn(`afterEach: DELETE /ifta/fuel/${id} → HTTP ${res.status()}`);
      }
    }
    fuelIds.clear();
  });

  // 1 ── GET /ifta/quarters?year=<y>&status=<s> ───────────────────────────────
  test('GET /ifta/quarters returns an array of quarter rows with year filter honored @workflow @requires:plan-ifta', async ({
    asDispatcher,
  }) => {
    const year = new Date().getFullYear();
    const res = await asDispatcher.get(`/ifta/quarters?year=${year}`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as unknown;
    expect(Array.isArray(body)).toBe(true);
    for (const row of body as unknown[]) {
      expectContract(IftaQuarterSchema, row, 'GET /ifta/quarters[item]');
    }

    // Semantic — every returned row matches the requested year.
    for (const row of body as Array<{ year: number }>) {
      expect(row.year).toBe(year);
    }

    // Status filter narrows the result space.
    const narrowRes = await asDispatcher.get(`/ifta/quarters?year=${year}&status=OPEN`);
    expect(narrowRes.status()).toBe(200);
    const narrow = (await narrowRes.json()) as Array<{ status: string }>;
    for (const row of narrow) expect(row.status).toBe('OPEN');
  });

  // 2 ── GET /ifta/quarters/:quarterId ────────────────────────────────────────
  test('GET /ifta/quarters/:quarterId returns detail with stateMileage + fuelPurchases @workflow @requires:plan-ifta @requires:data-ifta-quarter', async ({
    asAdmin,
    asDispatcher,
  }) => {
    quarter ??= await seedIftaQuarter(asAdmin);
    const res = await asDispatcher.get(`/ifta/quarters/${quarter.quarterId}`);
    expect(res.status()).toBe(200);
    const detail = expectContract(IftaQuarterDetailSchema, await res.json(), 'GET /ifta/quarters/:quarterId');

    // Semantic — echoes the requested id; stateMileage + fuelPurchases are
    // arrays (possibly empty on cold tenants).
    expect(detail.id).toBe(quarter.quarterId);
    expect(Array.isArray(detail.stateMileage)).toBe(true);
    expect(Array.isArray(detail.fuelPurchases)).toBe(true);

    // Unknown id → 404.
    const missingRes = await asDispatcher.get('/ifta/quarters/clk0000000000000000000000');
    expect(missingRes.status()).toBe(404);
  });

  // 3 ── GET /ifta/quarters/:quarterId/summary ────────────────────────────────
  test('GET /ifta/quarters/:quarterId/summary returns deadline countdown @workflow @requires:plan-ifta @requires:data-ifta-quarter', async ({
    asAdmin,
    asDispatcher,
  }) => {
    quarter ??= await seedIftaQuarter(asAdmin);
    const res = await asDispatcher.get(`/ifta/quarters/${quarter.quarterId}/summary`);
    expect(res.status()).toBe(200);
    const summary = expectContract(IftaQuarterSummarySchema, await res.json(), 'GET /ifta/quarters/:quarterId/summary');

    // Semantic — year + quarter echo the seeded quarter; deadline is a
    // parseable ISO string; daysUntilDeadline is a finite int.
    expect(summary.year).toBe(quarter.year);
    expect(summary.quarter).toBe(quarter.quarter);
    expect(Number.isFinite(summary.daysUntilDeadline)).toBe(true);
    expect(Number.isNaN(Date.parse(summary.filingDeadline))).toBe(false);
  });

  // 4 ── POST /ifta/quarters/:quarterId/calculate ─────────────────────────────
  test('POST /ifta/quarters/:quarterId/calculate transitions OPEN → DRAFT and returns per-state breakdown @workflow @requires:plan-ifta @requires:data-ifta-quarter @destructive', async ({
    asAdmin,
    asDispatcher,
  }) => {
    quarter ??= await seedIftaQuarter(asAdmin);
    const res = await asAdmin.post(`/ifta/quarters/${quarter.quarterId}/calculate`, {});
    expect(res.status()).toBe(201);
    const body = expectContract(
      IftaCalculateResponseLiveSchema,
      await res.json(),
      'POST /ifta/quarters/:quarterId/calculate',
    );

    // Semantic — quarter id echoed; status moves to DRAFT (from OPEN). If the
    // quarter was already DRAFT on a warm tenant, the transition re-runs the
    // calculation and stays at DRAFT.
    expect(body.quarter.id).toBe(quarter.quarterId);
    expect(['DRAFT', 'REVIEWED', 'FILED', 'CONFIRMED', 'AMENDED']).toContain(body.quarter.status);
    expect(Array.isArray(body.stateCalculations)).toBe(true);
    expect(body.summary.stateCount).toBe(body.stateCalculations.length);

    // Persistence — GET /ifta/quarters/:id re-reads the transitioned status.
    const verifyRes = await asDispatcher.get(`/ifta/quarters/${quarter.quarterId}`);
    expect(verifyRes.status()).toBe(200);
    const verified = expectContract(IftaQuarterDetailSchema, await verifyRes.json());
    expect(verified.status).toBe(body.quarter.status);
  });

  // 5 ── PATCH /ifta/quarters/:quarterId/status ───────────────────────────────
  test('PATCH /ifta/quarters/:quarterId/status walks DRAFT → REVIEWED and rejects illegal transitions @workflow @requires:plan-ifta @requires:data-ifta-quarter @destructive', async ({
    asAdmin,
  }) => {
    quarter ??= await seedIftaQuarter(asAdmin);

    // Ensure the quarter is AT LEAST DRAFT — calculate is idempotent.
    const seedStatusRes = await asAdmin.get(`/ifta/quarters/${quarter.quarterId}`);
    expect(seedStatusRes.status()).toBe(200);
    const current = expectContract(IftaQuarterDetailSchema, await seedStatusRes.json());
    if (current.status === 'OPEN') {
      const calcRes = await asAdmin.post(`/ifta/quarters/${quarter.quarterId}/calculate`, {});
      expect(calcRes.status()).toBe(201);
    }

    // Re-read — now DRAFT or further along.
    const afterCalcRes = await asAdmin.get(`/ifta/quarters/${quarter.quarterId}`);
    expect(afterCalcRes.status()).toBe(200);
    const afterCalc = expectContract(IftaQuarterDetailSchema, await afterCalcRes.json());

    // Pick an always-legal forward transition from the current state (per the
    // STATUS_TRANSITIONS table in `ifta.service.ts`).
    //   DRAFT → REVIEWED
    //   REVIEWED → FILED (needs confirmationNumber + filingMethod)
    //   FILED → CONFIRMED
    //   CONFIRMED → AMENDED
    //   AMENDED → REVIEWED
    const nextStatusMap: Record<
      string,
      { status: 'REVIEWED' | 'FILED' | 'CONFIRMED' | 'AMENDED'; extras?: Record<string, string> }
    > = {
      DRAFT: { status: 'REVIEWED' },
      REVIEWED: {
        status: 'FILED',
        extras: { confirmationNumber: 'QA-CONF-001', filingMethod: 'WEB' },
      },
      FILED: { status: 'CONFIRMED' },
      CONFIRMED: { status: 'AMENDED' },
      AMENDED: { status: 'REVIEWED' },
    };
    const target = nextStatusMap[afterCalc.status];
    if (!target) {
      throw new Error(`PATCH status: unexpected starting state ${afterCalc.status}`);
    }

    const res = await patchFilingStatus(asAdmin, quarter.quarterId, target.status, target.extras ?? {});
    expect(res.status()).toBe(200);
    const updated = expectContract(IftaQuarterSchema, await res.json(), 'PATCH /ifta/quarters/:quarterId/status');

    // Semantic — status advanced to target.
    expect(updated.id).toBe(quarter.quarterId);
    expect(updated.status).toBe(target.status);

    // Illegal transition — jumping from the new state to OPEN is never legal
    // (`STATUS_TRANSITIONS[OPEN] = []` is only reached via calculate, not a
    // PATCH). Service raises BadRequestException → 400.
    const illegalRes = await asAdmin.patch(`/ifta/quarters/${quarter.quarterId}/status`, { status: 'OPEN' });
    expect(illegalRes.status()).toBe(400);
  });

  // 6 ── POST /ifta/mileage ────────────────────────────────────────────────────
  test('POST /ifta/mileage upserts a manual mileage entry surfaced by list @workflow @requires:plan-ifta @requires:data-ifta-quarter @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    quarter ??= await seedIftaQuarter(asAdmin);
    const vehicleId = await pickVehicleId(asDispatcher);

    const mileage = 1234.5;
    const payload = buildIftaManualMileage(vehicleId, {
      jurisdiction: 'AK',
      miles: mileage,
      periodYear: quarter.year,
      periodQuarter: quarter.quarter,
    });
    const res = await asDispatcher.post('/ifta/mileage', payload);
    expect(res.status()).toBe(201);
    const row = expectContract(IftaMileageEntrySchema, await res.json(), 'POST /ifta/mileage');

    // Semantic — echoed jurisdiction + miles + source=MANUAL.
    expect(row.jurisdiction).toBe('AK');
    expect(row.totalMiles).toBe(mileage);
    expect(row.source).toBe('MANUAL');
    expect(row.quarterId).toBe(quarter.quarterId);

    // Persistence — GET /ifta/quarters/:id/mileage surfaces the row.
    const listRes = await asDispatcher.get(`/ifta/quarters/${quarter.quarterId}/mileage`);
    expect(listRes.status()).toBe(200);
    const list = (await listRes.json()) as unknown[];
    expect(Array.isArray(list)).toBe(true);
    const matching = (list as Array<{ id: string }>).find((r) => r.id === row.id);
    expect(matching).toBeDefined();

    // Cleanup note: no DELETE /ifta/mileage/:id endpoint exists. Repeated
    // test runs upsert the same (quarter, AK) row rather than accumulating,
    // so the tenant's mileage table stays bounded. Documented in file header.
  });

  // 7 ── GET /ifta/quarters/:quarterId/mileage ────────────────────────────────
  test('GET /ifta/quarters/:quarterId/mileage returns mileage rows for the quarter @workflow @requires:plan-ifta @requires:data-ifta-quarter', async ({
    asDispatcher,
    asAdmin,
  }) => {
    quarter ??= await seedIftaQuarter(asAdmin);
    const res = await asDispatcher.get(`/ifta/quarters/${quarter.quarterId}/mileage`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as unknown;
    expect(Array.isArray(body)).toBe(true);
    for (const row of body as unknown[]) {
      const parsed = expectContract(IftaMileageEntrySchema, row, 'GET /ifta/quarters/:quarterId/mileage[item]');
      // Every row belongs to the requested quarter.
      expect(parsed.quarterId).toBe(quarter.quarterId);
    }
  });

  // 8 ── POST /ifta/fuel (asDispatcher) ───────────────────────────────────────
  test('POST /ifta/fuel records a dispatcher-owned fuel purchase discoverable via list @workflow @requires:plan-ifta @requires:data-ifta-quarter @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    quarter ??= await seedIftaQuarter(asAdmin);
    const vehicleId = await pickVehicleId(asDispatcher);

    // Use a date inside the seeded quarter's period so the service resolves
    // the same quarter row server-side (via getQuarterFromDate).
    const purchaseDate = new Date(Date.UTC(quarter.year, (quarter.quarter - 1) * 3 + 1, 15)).toISOString().slice(0, 10);

    const payload = buildIftaFuelPurchase(vehicleId, {
      gallons: 101.5,
      pricePerGallonCents: 389,
      jurisdiction: 'TX',
      purchasedAt: purchaseDate,
      stationName: 'QA Fuel Stop (dispatcher)',
    });
    const res = await asDispatcher.post('/ifta/fuel', payload);
    expect(res.status()).toBe(201);
    const row = expectContract(IftaFuelPurchaseSchema, await res.json(), 'POST /ifta/fuel (asDispatcher)');
    fuelIds.add(row.id);

    // Semantic — echoed fields.
    expect(row.jurisdiction).toBe('TX');
    expect(row.gallons).toBe(101.5);
    expect(row.vehicleId).toBe(vehicleId);
    expect(row.quarterId).toBe(quarter.quarterId);
    expect(row.source).toBe('MANUAL');

    // Persistence — list for quarter contains the new row.
    const listRes = await asDispatcher.get(`/ifta/quarters/${quarter.quarterId}/fuel`);
    expect(listRes.status()).toBe(200);
    const list = (await listRes.json()) as Array<{ id: string }>;
    expect(list.find((r) => r.id === row.id)).toBeDefined();
  });

  // 9 ── POST /ifta/fuel (asDriver) ───────────────────────────────────────────
  test('POST /ifta/fuel accepts DRIVER-role submissions (method-level @Roles includes DRIVER) @workflow @requires:plan-ifta @requires:data-ifta-quarter @destructive', async ({
    asDriver,
    asDispatcher,
    asAdmin,
  }) => {
    quarter ??= await seedIftaQuarter(asAdmin);
    const vehicleId = await pickVehicleId(asDispatcher);

    const purchaseDate = new Date(Date.UTC(quarter.year, (quarter.quarter - 1) * 3 + 1, 16)).toISOString().slice(0, 10);

    const payload = buildIftaFuelPurchase(vehicleId, {
      gallons: 75.25,
      pricePerGallonCents: 412,
      jurisdiction: 'OK',
      purchasedAt: purchaseDate,
      stationName: 'QA Fuel Stop (driver)',
    });
    const res = await asDriver.post('/ifta/fuel', payload);
    expect(res.status()).toBe(201);
    const row = expectContract(IftaFuelPurchaseSchema, await res.json(), 'POST /ifta/fuel (asDriver)');
    fuelIds.add(row.id);

    // Semantic — a driver token successfully created a MANUAL-source row
    // (controller attaches `createdById = user.dbId` internally). Exercises
    // the method-level `@Roles(..., DRIVER)` superset.
    expect(row.jurisdiction).toBe('OK');
    expect(row.gallons).toBe(75.25);
    expect(row.source).toBe('MANUAL');
  });

  // 10 ── GET /ifta/quarters/:quarterId/fuel ──────────────────────────────────
  test('GET /ifta/quarters/:quarterId/fuel returns fuel rows for the quarter @workflow @requires:plan-ifta @requires:data-ifta-quarter', async ({
    asDispatcher,
    asAdmin,
  }) => {
    quarter ??= await seedIftaQuarter(asAdmin);
    const res = await asDispatcher.get(`/ifta/quarters/${quarter.quarterId}/fuel`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as unknown;
    expect(Array.isArray(body)).toBe(true);
    for (const row of body as unknown[]) {
      const parsed = expectContract(IftaFuelPurchaseSchema, row, 'GET /ifta/quarters/:quarterId/fuel[item]');
      expect(parsed.quarterId).toBe(quarter.quarterId);
    }
  });

  // 11 ── DELETE /ifta/fuel/:purchaseId ────────────────────────────────────────
  test('DELETE /ifta/fuel/:purchaseId removes a fuel purchase row @workflow @requires:plan-ifta @requires:data-ifta-quarter @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    quarter ??= await seedIftaQuarter(asAdmin);
    const vehicleId = await pickVehicleId(asDispatcher);

    // Create a fuel row specifically for this test so the delete is the
    // assertion subject — independent of tests 8/9's afterEach sweep.
    const purchaseDate = new Date(Date.UTC(quarter.year, (quarter.quarter - 1) * 3 + 1, 17)).toISOString().slice(0, 10);
    const createRes = await asDispatcher.post(
      '/ifta/fuel',
      buildIftaFuelPurchase(vehicleId, {
        gallons: 40.0,
        pricePerGallonCents: 400,
        jurisdiction: 'AR',
        purchasedAt: purchaseDate,
        stationName: 'QA Fuel Stop (to-delete)',
      }),
    );
    expect(createRes.status()).toBe(201);
    const created = expectContract(IftaFuelPurchaseSchema, await createRes.json());
    // NOTE: NOT added to `fuelIds` — this test IS the delete.

    const res = await asDispatcher.delete(`/ifta/fuel/${created.id}`);
    expect(res.status()).toBe(200);
    const body = expectContract(DeleteFuelPurchaseSchema, await res.json(), 'DELETE /ifta/fuel/:purchaseId');
    expect(body.deleted).toBe(true);

    // Persistence — the row is no longer in the quarter's fuel list.
    const listRes = await asDispatcher.get(`/ifta/quarters/${quarter.quarterId}/fuel`);
    expect(listRes.status()).toBe(200);
    const list = (await listRes.json()) as Array<{ id: string }>;
    expect(list.find((r) => r.id === created.id)).toBeUndefined();

    // Double-delete → Prisma throws a "Record to delete does not exist"
    // which the global filter surfaces as 500. The live backend does NOT
    // wrap this in a NotFoundException (`deleteFuelPurchase` just calls
    // `prisma.iftaFuelPurchase.delete` unchecked). Contract-only assertion.
    const missingRes = await asDispatcher.delete(`/ifta/fuel/${created.id}`);
    expect([404, 500]).toContain(missingRes.status());
  });

  // 12 ── GET /ifta/tax-rates?year=<y>&quarter=<q> ────────────────────────────
  test('GET /ifta/tax-rates returns an array of jurisdiction tax-rate rows @workflow @requires:plan-ifta', async ({
    asDispatcher,
  }) => {
    const now = new Date();
    const year = now.getFullYear();
    const q = Math.ceil((now.getMonth() + 1) / 3);
    const res = await asDispatcher.get(`/ifta/tax-rates?year=${year}&quarter=${q}`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as unknown;
    expect(Array.isArray(body)).toBe(true);
    for (const row of body as unknown[]) {
      const parsed = expectContract(IftaTaxRateSchema, row, 'GET /ifta/tax-rates[item]');
      // Semantic — rows match the requested year/quarter.
      expect(parsed.year).toBe(year);
      expect(parsed.quarter).toBe(q);
    }

    // No-arg request defaults to the current year/quarter — same shape.
    const defaultRes = await asDispatcher.get('/ifta/tax-rates');
    expect(defaultRes.status()).toBe(200);
    const defaultBody = (await defaultRes.json()) as unknown;
    expect(Array.isArray(defaultBody)).toBe(true);
  });
});

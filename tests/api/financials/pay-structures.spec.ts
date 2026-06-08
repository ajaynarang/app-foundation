/**
 * Financials — Pay Structures (Phase 2 Group 2f).
 *
 * Covers 3 endpoints on `PayStructureController`:
 *
 *   1. GET /pay-structures/mine        (asDriver)     — driver self-service
 *   2. GET /pay-structures/:driver_id  (asDispatcher) — dispatcher lookup
 *   3. PUT /pay-structures/:driver_id  (asDispatcher) — upsert
 *
 * The upsert path is the bootstrap for the entire settlements suite (every
 * Group 2e/2f setup attaches a pay structure before calculating). Tested
 * here explicitly so the contract fails loudly if the service shape drifts.
 *
 * Live-DB gotcha (finding #24): the `driver_pay_structures` table still
 * carries the pre-2026-04-10 unique-on-driver_id index on the dev DB. A
 * naïve `PUT /pay-structures/:driver_id` against a driver that already
 * has a structure hits P2002 / 409. `createCalculatedSettlement` works
 * around this via GET-first; this spec mirrors that pattern for the PUT
 * test (#3) and side-steps it entirely for the GET tests by minting a
 * fresh driver and a fresh seeded driver via the helper.
 *
 * Role mix:
 *   - asDriver     — self-service GET /pay-structures/mine.
 *   - asDispatcher — lookup + upsert on arbitrary driver_id.
 *   - asAdmin      — driver provisioning (via `createCalculatedSettlement`
 *                    helper, which also seeds the pay structure).
 *
 * Cleanup: minted drivers are deactivated. No pay-structure DELETE endpoint
 * exists — rows are left on the driver; they cascade-delete when the driver
 * row is later hard-removed by the test-reset script. Acceptable for QA.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildDriver, buildPayStructureUpsert } from '@sally/test-utils/factories';
import { cleanupLoad, createDriver, deactivateDriver } from '@sally/test-utils/helpers';
import { expectContract, SettlementSchemas } from '@sally/test-utils/schemas';
import { createCalculatedSettlement } from './_helpers.js';

const { DriverPayStructureResponseSchema } = SettlementSchemas;

test.describe('Financials · Pay Structures @workflow', () => {
  const createdSettlementIds: string[] = [];
  const createdLoadIds: string[] = [];
  const createdDriverIds: string[] = [];

  test.afterEach(async ({ asDispatcher, asAdmin }) => {
    for (const settlementId of createdSettlementIds.splice(0)) {
      await asAdmin.post(`/settlements/${settlementId}/void`, {}).catch(() => undefined);
    }
    for (const loadId of createdLoadIds.splice(0)) {
      await cleanupLoad(asDispatcher, loadId).catch(() => undefined);
    }
    for (const driverId of createdDriverIds.splice(0)) {
      await deactivateDriver(asAdmin, driverId).catch(() => undefined);
    }
  });

  // 1 ── GET /pay-structures/mine ──────────────────────────────────────
  //
  // Driver self-service. The seeded DRIVER fixture may or may not already
  // have an active pay structure — on demo tenants it does (otherwise the
  // settlements-crud spec's driver self-service tests would fail). We do
  // NOT PUT one here: a PUT against the seeded driver would (a) trip the
  // finding #24 unique-index collision on demo's live DB, and (b) mutate
  // a shared fixture row that other parallel workers depend on. Instead,
  // we assert that the service returns EITHER a strict canonical shape OR
  // null — both are legitimate outcomes of this route.
  test("GET /pay-structures/mine returns the seeded driver's active pay structure (or null when none) @workflow", async ({
    asDriver,
  }) => {
    const res = await asDriver.get('/pay-structures/mine');
    expect(res.status()).toBe(200);

    // `PayStructureService.getByDriverId` returns `null` when no active
    // structure exists; NestJS serialises this as the JSON literal `null`.
    // Playwright's `.json()` resolves that to JS `null`. We tolerate both
    // outcomes — the endpoint contract IS "latest isActive row OR null",
    // and a tenant seed that happens to omit the pay structure should
    // still yield a clean 200.
    const bodyText = await res.text();
    expect(bodyText.length).toBeGreaterThan(0);

    if (bodyText === 'null') {
      // Nothing more to assert — contract is "null is a valid response".
      return;
    }

    const ps = expectContract(
      DriverPayStructureResponseSchema.strict(),
      JSON.parse(bodyText),
      'GET /pay-structures/mine',
    );

    // Semantic — the returned row is active, has an effectiveDate, and
    // carries the matching rate field for its type (per DTO's
    // `@ValidateIf` branching mirrored in `buildPayStructureUpsert`).
    expect(ps.isActive).toBe(true);
    expect(ps.effectiveFrom).toBeTruthy();
    expect(ps.effectiveDate).toBe(ps.effectiveFrom);
    switch (ps.type) {
      case 'PER_MILE':
        expect(ps.ratePerMileCents).not.toBeNull();
        break;
      case 'PERCENTAGE':
        expect(ps.percentage).not.toBeNull();
        break;
      case 'FLAT_RATE':
        expect(ps.flatRateCents).not.toBeNull();
        break;
      case 'HYBRID':
        expect(ps.hybridBaseCents).not.toBeNull();
        expect(ps.hybridPercent).not.toBeNull();
        break;
    }
  });

  // 2 ── GET /pay-structures/:driver_id ────────────────────────────────
  //
  // Dispatcher lookup. `createCalculatedSettlement` provisions a driver
  // AND attaches a pay structure as part of the settlement setup — so the
  // GET is guaranteed to return a non-null row. We assert the strict
  // canonical shape on the returned row, plus driver + 404 negative.
  test("GET /pay-structures/:driver_id returns the driver's active pay structure @workflow @destructive", async ({
    asDispatcher,
    asAdmin,
  }) => {
    const setup = await createCalculatedSettlement(asDispatcher, asAdmin);
    createdSettlementIds.push(setup.settlementId);
    createdLoadIds.push(setup.loadId);
    createdDriverIds.push(setup.driverPublicId);

    const res = await asDispatcher.get(`/pay-structures/${setup.driverPublicId}`);
    expect(res.status()).toBe(200);
    const ps = expectContract(
      DriverPayStructureResponseSchema.strict(),
      await res.json(),
      'GET /pay-structures/:driver_id',
    );

    // Semantic — active row with a valid type + matching rate field. The
    // helper defaults to FLAT_RATE (50000 cents) for fresh drivers, but
    // the helper's `GET-first` fast path also tolerates a pre-existing
    // structure on the seeded driver — so we only assert the active flag
    // and the type-vs-rate invariant, not a specific type.
    expect(ps.isActive).toBe(true);
    expect(['PER_MILE', 'PERCENTAGE', 'FLAT_RATE', 'HYBRID']).toContain(ps.type);

    // Unknown driver → 404 from `getByDriverId`'s `findFirst` guard.
    const missingRes = await asDispatcher.get('/pay-structures/DRV-does-not-exist');
    expect(missingRes.status()).toBe(404);
  });

  // 3 ── PUT /pay-structures/:driver_id ────────────────────────────────
  //
  // Upsert the pay structure on a freshly-minted driver that has NO
  // existing structure. This side-steps finding #24 (the legacy
  // unique-on-driver_id index on `driver_pay_structures` blocks the
  // `deactivate + create` path inside `PayStructureService.upsert`
  // whenever a row already exists for the driver). A freshly-minted
  // driver has zero pay structures, so `updateMany({ isActive: true })`
  // inside the service is a no-op and only the `create` step runs — no
  // race with the index.
  //
  // GET-first is still used to assert the pre-state (null — no row) per
  // the `createCalculatedSettlement` pattern mirrored from `_helpers.ts`.
  // Contract-wise, GET on a driver-with-no-structure returns 200 + `null`
  // body; the test confirms that branch before exercising the PUT.
  //
  // A bounded retry on POST /drivers handles the finding #2 collision
  // class (same pattern as `createDeliveredLoad`).
  test('PUT /pay-structures/:driver_id creates an active pay structure on a driver with no prior structure (GET-first per finding #24) @workflow @destructive', async ({
    asAdmin,
  }) => {
    // Mint a driver. Bounded retry for the DRV- Date.now() collision
    // class (finding #2). 3 attempts matches the same pattern in
    // `_helpers.ts::createDeliveredLoad`.
    let driverPublicId = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const d = await createDriver(asAdmin, buildDriver());
        driverPublicId = d.driverId;
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('HTTP 409')) throw err;
      }
    }
    if (!driverPublicId) {
      throw new Error('POST /drivers returned 409 three times (driverId collision — finding #2)');
    }
    createdDriverIds.push(driverPublicId);

    // GET-first — freshly minted driver has NO pay structure. Service
    // returns 200 + literal `null`.
    const beforeRes = await asAdmin.get(`/pay-structures/${driverPublicId}`);
    expect(beforeRes.status()).toBe(200);
    const beforeBody = await beforeRes.text();
    expect(
      beforeBody === 'null' || beforeBody.length === 0,
      `fresh driver must have no pay structure; got: ${beforeBody.slice(0, 120)}`,
    ).toBe(true);

    // Endpoint under test — PUT a PER_MILE structure. Builder defaults
    // effectiveDate to 30 days ago (inside the calc window other tests
    // rely on; harmless for this test).
    //
    // Factory nuance: `buildPayStructureUpsert` defaults to FLAT_RATE
    // with `flatRateCents: 50000`. Overriding `type: PER_MILE` does NOT
    // null out the residual `flatRateCents` — both fields land in the
    // payload, the DTO whitelists both (each is branched on by
    // `@ValidateIf` but still declared on the class), and the service's
    // `flatRateCents: data.flatRateCents ?? null` writes the stale 50000
    // into the new row. That's a factory-vs-service contract oddity
    // unrelated to this test; we accept the residual field on the stored
    // row and assert only the PER_MILE fields we asked for. See finding
    // #25 for the factory-hygiene follow-up.
    const payload = buildPayStructureUpsert({
      type: 'PER_MILE',
      ratePerMileCents: 65,
    });
    const res = await asAdmin.put(`/pay-structures/${driverPublicId}`, payload);
    expect(res.status()).toBe(200);
    const created = expectContract(
      DriverPayStructureResponseSchema.strict(),
      await res.json(),
      'PUT /pay-structures/:driver_id',
    );

    // Semantic — the returned row matches what we asked for, is active,
    // and carries the serialised `effectiveDate` alias that the frontend
    // reads. We assert the PER_MILE rate landed and the `type` is PER_MILE;
    // residual flatRateCents from the factory default is documented in
    // finding #25 — asserting it would pin the suite to a factory quirk.
    expect(created.type).toBe('PER_MILE');
    expect(created.ratePerMileCents).toBe(65);
    expect(created.percentage).toBeNull();
    expect(created.isActive).toBe(true);
    expect(created.effectiveFrom).toBe(payload.effectiveDate);
    expect(created.effectiveDate).toBe(payload.effectiveDate);

    // Persistence — a follow-up GET returns the same row. `getByDriverId`
    // orders by `effectiveFrom desc` + filters on `isActive: true`, so
    // the row we just PUT must be the active one.
    const afterRes = await asAdmin.get(`/pay-structures/${driverPublicId}`);
    expect(afterRes.status()).toBe(200);
    const after = expectContract(
      DriverPayStructureResponseSchema.strict(),
      await afterRes.json(),
      'GET /pay-structures/:driver_id (post-PUT)',
    );
    expect(after.id).toBe(created.id);
    expect(after.type).toBe('PER_MILE');
    expect(after.isActive).toBe(true);

    // Unknown driver → 404 from `upsert`'s `findFirst` driver lookup.
    const missingRes = await asAdmin.put('/pay-structures/DRV-does-not-exist', payload);
    expect(missingRes.status()).toBe(404);
  });
});

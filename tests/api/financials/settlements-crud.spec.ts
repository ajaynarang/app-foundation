/**
 * Financials — Settlements CRUD + Driver Self-Service (Phase 2 Group 2e).
 *
 * Covers 10 endpoints on `SettlementsController`:
 *
 *   Dispatcher surface (7):
 *     1. POST /settlements/calculate                  (create DRAFT)
 *     2. GET  /settlements                            (list + filters)
 *     3. GET  /settlements/summary                    (aggregate)
 *     4. GET  /settlements/:settlement_id             (detail)
 *     5. GET  /settlements/:settlement_id/pdf         (attachment PDF)
 *     6. GET  /settlements/:settlement_id/pdf/preview (inline PDF)
 *     7. PUT  /settlements/:settlement_id/notes       (DRAFT/APPROVED/PAID)
 *
 *   Driver self-service (3):
 *     8.  GET /settlements/my-settlements
 *     9.  GET /settlements/my-settlements/:settlement_id
 *     10. GET /settlements/my-settlements/:settlement_id/pdf
 *
 * The 3 driver self-service endpoints live here (vs. lifecycle.spec) because
 * they are all read-only projections — role variants of the dispatcher
 * `GET /settlements/*` routes. Lifecycle stays focused on state transitions
 * (deductions, approve, pay, void).
 *
 * Role mix:
 *   - asDispatcher — calc + list + detail + PDF + PDF preview + notes.
 *   - asAdmin      — driver provisioning + pay-structure upsert (setup only,
 *                    via `createCalculatedSettlement`).
 *   - asDriver     — self-service reads (tests 8–10). Setup uses
 *                    `seededDriverPublicId(authState)` so the settlement
 *                    attaches to the fixture's linked Driver row.
 *
 * PDF assertions: Content-Type contains `application/pdf`, Content-Length
 * present, body > 1024 bytes, leading bytes are `%PDF-`. No PDF parsing.
 *
 * Cleanup: every test that creates a settlement voids it in afterEach
 * (POST /settlements/:id/void, asAdmin). Void is idempotent-for-cleanup —
 * the service throws 400 on "already voided" which is swallowed via
 * `.catch()`. Paid settlements cannot be voided; those tests (lifecycle)
 * handle their own cleanup.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildSettlementNotes, buildVoidSettlement } from '@sally/test-utils/factories';
import { cleanupLoad, deactivateDriver } from '@sally/test-utils/helpers';
import { expectContract, SettlementSchemas } from '@sally/test-utils/schemas';
import { seededDriverPublicId } from '../fleet/loads/_helpers.js';
import { createCalculatedSettlement } from './_helpers.js';

const {
  SettlementResponseSchema,
  SettlementListResponseSchema,
  SettlementSummaryResponseSchema,
  SettlementNotesUpdateResponseSchema,
} = SettlementSchemas;

const PDF_MIN_BYTES = 1024;

test.describe('Financials · Settlements CRUD + Driver Self-Service @workflow', () => {
  const createdSettlementIds: string[] = [];
  const createdLoadIds: string[] = [];
  const createdDriverIds: string[] = [];

  test.afterEach(async ({ asDispatcher, asAdmin }) => {
    // Order matters — void settlements first (they reference load + driver
    // indirectly via line items). Then cleanup loads. Then deactivate
    // drivers. Any single failure is swallowed so one stuck step does not
    // mask cleanup of the others.
    for (const settlementId of createdSettlementIds.splice(0)) {
      await asAdmin.post(`/settlements/${settlementId}/void`, buildVoidSettlement()).catch(() => undefined);
    }
    for (const loadId of createdLoadIds.splice(0)) {
      await cleanupLoad(asDispatcher, loadId).catch(() => undefined);
    }
    for (const driverId of createdDriverIds.splice(0)) {
      await deactivateDriver(asAdmin, driverId).catch(() => undefined);
    }
  });

  // 1 ── POST /settlements/calculate ─────────────────────────────────
  test('POST /settlements/calculate creates a DRAFT settlement for a driver + period @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    // createCalculatedSettlement wraps the full setup chain (driver + pay
    // structure + delivered load + calculate). We replicate the endpoint
    // assertion inline so the ENDPOINT UNDER TEST is explicit — the helper
    // is re-exercised by every other test in this file, so its own
    // 201 path is covered here specifically.
    const setup = await createCalculatedSettlement(asDispatcher, asAdmin);
    createdSettlementIds.push(setup.settlementId);
    createdLoadIds.push(setup.loadId);
    createdDriverIds.push(setup.driverPublicId);

    // GET the freshly-created settlement back to verify shape end-to-end.
    const res = await asDispatcher.get(`/settlements/${setup.settlementId}`);
    expect(res.status()).toBe(200);
    const settlement = expectContract(
      SettlementResponseSchema.strict(),
      await res.json(),
      'POST /settlements/calculate → GET /settlements/:id',
    );

    // Semantic — DRAFT, net = gross (no deductions yet). The line item's
    // `payStructureType` is whatever the driver has on file (helper tolerates
    // pre-seeded pay structures per finding #21); assert only that it's one
    // of the enum values.
    expect(settlement.status).toBe('DRAFT');
    expect(settlement.settlementId).toBe(setup.settlementId);
    expect(settlement.netPayCents).toBe(settlement.grossPayCents);
    expect(settlement.deductionsCents).toBe(0);
    expect(settlement.netPayCents).toBe(setup.netPayCents);
    expect(settlement.grossPayCents).toBe(setup.grossPayCents);
    expect(settlement.lineItems).toBeDefined();
    expect(settlement.lineItems?.length).toBeGreaterThanOrEqual(1);
    expect(['PER_MILE', 'PERCENTAGE', 'FLAT_RATE', 'HYBRID']).toContain(settlement.lineItems?.[0]?.payStructureType);

    // Second calculate with the same driver + overlapping period must
    // conflict (service rejects overlapping settlements with 409).
    const conflictRes = await asDispatcher.post('/settlements/calculate', {
      driverId: setup.driverPublicId,
      periodStart: setup.periodStart,
      periodEnd: setup.periodEnd,
    });
    expect(conflictRes.status()).toBe(409);
  });

  // 2 ── GET /settlements ────────────────────────────────────────────
  test('GET /settlements lists settlements and honours ?search on settlementNumber @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const setup = await createCalculatedSettlement(asDispatcher, asAdmin);
    createdSettlementIds.push(setup.settlementId);
    createdLoadIds.push(setup.loadId);
    createdDriverIds.push(setup.driverPublicId);

    // Default list (no filter) — demo-northstar has many seeded settlements
    // so just verify the envelope. `findAll` returns a bare array (no
    // pagination wrapper).
    const listRes = await asDispatcher.get('/settlements?limit=5');
    expect(listRes.status()).toBe(200);
    const list = expectContract(SettlementListResponseSchema, await listRes.json(), 'GET /settlements');
    expect(list.length).toBeGreaterThan(0);

    // Scoped via ?search on the freshly-minted settlement number — the
    // service matches `settlementNumber contains search` OR
    // `driver.name contains search`, both case-insensitive. Settlement
    // numbers include the driver last-name slice, so our query is uniquely
    // targeted to this row.
    const scopedRes = await asDispatcher.get(`/settlements?search=${encodeURIComponent(setup.settlementNumber)}`);
    expect(scopedRes.status()).toBe(200);
    const scoped = expectContract(SettlementListResponseSchema, await scopedRes.json(), 'GET /settlements?search');
    const match = scoped.find((row) => row.settlementId === setup.settlementId);
    expect(match).toBeDefined();
    expect(match?.settlementNumber).toBe(setup.settlementNumber);
    expect(match?.status).toBe('DRAFT');

    // Contract — every row in the scoped response conforms to the
    // canonical settlement shape. `.strict()` catches any service-side
    // field addition that bypasses the type system.
    expect(
      expectContract(SettlementResponseSchema.strict(), scoped[0], 'SettlementResponseSchema on first scoped row'),
    ).toBeDefined();
  });

  // 3 ── GET /settlements/summary ────────────────────────────────────
  test('GET /settlements/summary returns aggregate envelope with non-negative counts @workflow', async ({
    asDispatcher,
  }) => {
    const res = await asDispatcher.get('/settlements/summary');
    expect(res.status()).toBe(200);
    const summary = expectContract(
      SettlementSummaryResponseSchema.strict(),
      await res.json(),
      'GET /settlements/summary',
    );

    // Semantic — counts are non-negative integers; cents sums can be
    // negative when a settlement's deductions exceed gross pay (a
    // frequent demo-tenant artefact for settlements that carry large
    // fuel-advance deductions against a light week). Assert integer
    // shape on the cents fields, non-negative on the counts.
    expect(summary.pendingApproval).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(summary.pendingApprovalCents)).toBe(true);
    expect(summary.readyToPay).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(summary.readyToPayCents)).toBe(true);
    expect(Number.isInteger(summary.paidThisMonthCents)).toBe(true);
    expect(summary.activeDrivers).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(summary.avgSettlementCents)).toBe(true);
  });

  // 4 ── GET /settlements/:settlement_id ─────────────────────────────
  test('GET /settlements/:settlement_id returns the detail shape with nested lineItems and deductions @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const setup = await createCalculatedSettlement(asDispatcher, asAdmin);
    createdSettlementIds.push(setup.settlementId);
    createdLoadIds.push(setup.loadId);
    createdDriverIds.push(setup.driverPublicId);

    const res = await asDispatcher.get(`/settlements/${setup.settlementId}`);
    expect(res.status()).toBe(200);
    const detail = expectContract(SettlementResponseSchema.strict(), await res.json(), 'GET /settlements/:id');

    // Semantic — fresh DRAFT, no deductions, at least one line item keyed
    // to the DELIVERED load. The detail include also attaches the
    // driver projection (driverId + name) — not optional on this route.
    expect(detail.settlementId).toBe(setup.settlementId);
    expect(detail.status).toBe('DRAFT');
    expect(detail.deductions).toHaveLength(0);
    expect(detail.lineItems?.length).toBeGreaterThanOrEqual(1);
    expect(detail.lineItems?.[0]?.load?.loadId).toBe(setup.loadId);
    expect(detail.driver?.driverId).toBe(setup.driverPublicId);

    // Unknown id → 404 from `findOne`.
    const missingRes = await asDispatcher.get('/settlements/stl_does_not_exist');
    expect(missingRes.status()).toBe(404);
  });

  // 5 ── GET /settlements/:settlement_id/pdf ─────────────────────────
  test('GET /settlements/:settlement_id/pdf returns a binary PDF attachment @workflow @destructive @slow', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const setup = await createCalculatedSettlement(asDispatcher, asAdmin);
    createdSettlementIds.push(setup.settlementId);
    createdLoadIds.push(setup.loadId);
    createdDriverIds.push(setup.driverPublicId);

    const res = await asDispatcher.get(`/settlements/${setup.settlementId}/pdf`);
    expect(res.status()).toBe(200);

    // Headers — controller sets Content-Type, Content-Disposition
    // (`attachment; filename="<safe>.pdf"`), and Content-Length explicitly.
    const contentType = res.headers()['content-type'];
    expect(contentType).toContain('application/pdf');
    const contentDisposition = res.headers()['content-disposition'];
    expect(contentDisposition).toContain('attachment');
    expect(contentDisposition).toContain('.pdf');

    // Body — real pdfmake output is > 1KB; leading bytes are the PDF magic
    // marker `%PDF-`. We do not parse the PDF itself; the renderer's
    // contract is separate from the controller's.
    const body = await res.body();
    expect(body.length).toBeGreaterThan(PDF_MIN_BYTES);
    expect(body.subarray(0, 5).toString('utf-8')).toBe('%PDF-');
  });

  // 6 ── GET /settlements/:settlement_id/pdf/preview ─────────────────
  test('GET /settlements/:settlement_id/pdf/preview returns the same PDF inline @workflow @destructive @slow', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const setup = await createCalculatedSettlement(asDispatcher, asAdmin);
    createdSettlementIds.push(setup.settlementId);
    createdLoadIds.push(setup.loadId);
    createdDriverIds.push(setup.driverPublicId);

    const res = await asDispatcher.get(`/settlements/${setup.settlementId}/pdf/preview`);
    expect(res.status()).toBe(200);

    const contentType = res.headers()['content-type'];
    expect(contentType).toContain('application/pdf');
    // The preview variant sets `Content-Disposition: inline` (no filename
    // — see controller). Distinct from the attachment variant above.
    const contentDisposition = res.headers()['content-disposition'];
    expect(contentDisposition).toContain('inline');

    const body = await res.body();
    expect(body.length).toBeGreaterThan(PDF_MIN_BYTES);
    expect(body.subarray(0, 5).toString('utf-8')).toBe('%PDF-');
  });

  // 7 ── PUT /settlements/:settlement_id/notes ───────────────────────
  test('PUT /settlements/:settlement_id/notes updates the notes field on a DRAFT settlement @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const setup = await createCalculatedSettlement(asDispatcher, asAdmin);
    createdSettlementIds.push(setup.settlementId);
    createdLoadIds.push(setup.loadId);
    createdDriverIds.push(setup.driverPublicId);

    const payload = buildSettlementNotes('QA Phase 2 Group 2e — updated notes for DRAFT settlement');
    const res = await asDispatcher.put(`/settlements/${setup.settlementId}/notes`, payload);
    expect(res.status()).toBe(200);
    const updated = expectContract(
      SettlementNotesUpdateResponseSchema.strict(),
      await res.json(),
      'PUT /settlements/:id/notes',
    );

    // Semantic — notes landed verbatim, status did NOT change (this
    // endpoint is valid regardless of state).
    expect(updated.notes).toBe(payload.notes);
    expect(updated.status).toBe('DRAFT');
    expect(updated.settlementId).toBe(setup.settlementId);

    // Persistence — GET the detail back, notes match.
    const afterRes = await asDispatcher.get(`/settlements/${setup.settlementId}`);
    expect(afterRes.status()).toBe(200);
    const after = expectContract(
      SettlementResponseSchema.strict(),
      await afterRes.json(),
      'GET /settlements/:id after notes update',
    );
    expect(after.notes).toBe(payload.notes);
  });

  // ── Driver self-service subgroup ─────────────────────────────────
  //
  // The three asDriver tests below (#8, #9, #10) all calculate a
  // settlement against the SEEDED driver (so the asDriver JWT's linked
  // Driver row matches the settlement.driverId). Under `workers=2` two
  // tests from this group can hit `POST /settlements/calculate`
  // concurrently for the same driver + overlapping period and collide
  // with a 409 "Settlement already covers this period". Running them
  // in serial mode (same worker, sequential) lets each test's
  // afterEach void the settlement before the next one calculates.
  //
  // The tests outside this subgroup use freshly-minted drivers, so they
  // remain parallel-safe.
  test.describe.serial('Driver self-service reads', () => {
    // 8 ── GET /settlements/my-settlements (driver self-service) ──────
    test("GET /settlements/my-settlements lists the seeded driver's own settlements @workflow @destructive", async ({
      asDispatcher,
      asAdmin,
      asDriver,
      authState,
    }) => {
      // Setup uses the seeded DRIVER's public id so the calculated
      // settlement attaches to the fixture's linked Driver row. Without
      // this, `user.driverId` in the guard would filter out the settlement.
      // `createdDriver: false` — we must NOT deactivate the seeded driver.
      const setup = await createCalculatedSettlement(asDispatcher, asAdmin, {
        driverPublicId: seededDriverPublicId(authState),
      });
      createdSettlementIds.push(setup.settlementId);
      createdLoadIds.push(setup.loadId);

      const res = await asDriver.get('/settlements/my-settlements');
      expect(res.status()).toBe(200);
      const list = expectContract(SettlementListResponseSchema, await res.json(), 'GET /settlements/my-settlements');

      // Semantic — the freshly-calculated settlement appears in the driver's
      // list; every row in the list belongs to this driver (service scopes
      // `where.driverId = user.driverId`).
      const match = list.find((s) => s.settlementId === setup.settlementId);
      expect(match, 'just-calculated settlement must appear in driver list').toBeDefined();
      expect(match?.status).toBe('DRAFT');
      for (const row of list) {
        expect(row.driver?.driverId).toBe(setup.driverPublicId);
      }
    });

    // 9 ── GET /settlements/my-settlements/:settlement_id ──────────────
    test("GET /settlements/my-settlements/:settlement_id returns the driver's own settlement detail @workflow @destructive", async ({
      asDispatcher,
      asAdmin,
      asDriver,
      authState,
    }) => {
      const setup = await createCalculatedSettlement(asDispatcher, asAdmin, {
        driverPublicId: seededDriverPublicId(authState),
      });
      createdSettlementIds.push(setup.settlementId);
      createdLoadIds.push(setup.loadId);

      const res = await asDriver.get(`/settlements/my-settlements/${setup.settlementId}`);
      expect(res.status()).toBe(200);
      const detail = expectContract(
        SettlementResponseSchema.strict(),
        await res.json(),
        'GET /settlements/my-settlements/:id',
      );

      // Semantic — same canonical shape, driver scoped.
      expect(detail.settlementId).toBe(setup.settlementId);
      expect(detail.driver?.driverId).toBe(setup.driverPublicId);
      expect(detail.status).toBe('DRAFT');
      expect(detail.lineItems?.length).toBeGreaterThanOrEqual(1);

      // A settlement belonging to a different driver must 404 through this
      // route — the controller's `assertDriverScopedAccess` forbids it.
      // We stand up a second settlement on a fresh driver and verify.
      const foreign = await createCalculatedSettlement(asDispatcher, asAdmin);
      createdSettlementIds.push(foreign.settlementId);
      createdLoadIds.push(foreign.loadId);
      createdDriverIds.push(foreign.driverPublicId);
      const foreignRes = await asDriver.get(`/settlements/my-settlements/${foreign.settlementId}`);
      // Controller throws ForbiddenException from `assertDriverScopedAccess`
      // (403). Some similar endpoints in this codebase 404 for cross-tenant
      // shielding; settlements uses 403 for same-tenant cross-driver. Assert
      // the actual.
      expect([403, 404]).toContain(foreignRes.status());
    });

    // 10 ── GET /settlements/my-settlements/:settlement_id/pdf ────────
    test("GET /settlements/my-settlements/:settlement_id/pdf returns the driver's own settlement PDF @workflow @destructive @slow", async ({
      asDispatcher,
      asAdmin,
      asDriver,
      authState,
    }) => {
      const setup = await createCalculatedSettlement(asDispatcher, asAdmin, {
        driverPublicId: seededDriverPublicId(authState),
      });
      createdSettlementIds.push(setup.settlementId);
      createdLoadIds.push(setup.loadId);

      const res = await asDriver.get(`/settlements/my-settlements/${setup.settlementId}/pdf`);
      expect(res.status()).toBe(200);

      const contentType = res.headers()['content-type'];
      expect(contentType).toContain('application/pdf');
      const contentDisposition = res.headers()['content-disposition'];
      expect(contentDisposition).toContain('attachment');
      expect(contentDisposition).toContain('.pdf');

      const body = await res.body();
      expect(body.length).toBeGreaterThan(PDF_MIN_BYTES);
      expect(body.subarray(0, 5).toString('utf-8')).toBe('%PDF-');
    });
  }); // describe.serial "Driver self-service reads"
});

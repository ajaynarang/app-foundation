/**
 * Shared setup helpers for the Phase 2 financials spec suite (Group 2a and
 * beyond). File prefixed with an underscore so Playwright's default test
 * collector ignores it — nothing in here is a test.
 *
 * Helpers:
 *
 *   - `firstCustomerId` — canonical "grab a seeded customer id" preamble.
 *     Duplicated inline in `tests/api/fleet/loads/_helpers.ts` and several
 *     Phase 1 specs; mirrored here because every financials test that
 *     creates loads from scratch needs it.
 *
 *   - `createDeliveredLoad` — bootstraps PENDING → ASSIGNED → IN_TRANSIT →
 *     DELIVERED using the Phase 1 helpers. Returns the created-load
 *     identifiers and the ADMIN-provisioned driver's public id so the
 *     caller can deactivate the driver in `afterEach`. No vehicle is
 *     provisioned (not required for billing/profitability paths).
 *
 *   - `withBillingOverrideEnabled` — toggles the tenant's
 *     `FleetOperationsSettings.allowBillingOverride` flag via
 *     `/settings/operations`. The close-out approve path requires either a
 *     readiness score of 100 OR `allowBillingOverride: true` + an
 *     `overrideReason` — a fresh DELIVERED load has neither BOL nor POD
 *     uploaded, so we flip the flag once per test run and restore at the
 *     end. Idempotent per-test.
 *
 *   - `createInvoiceableLoad` — end-to-end bootstrap (Phase 2 Group 2b).
 *     Delivered load + close-out approve + invoice generation. Returns the
 *     load identifiers + the new `invoiceNumber` (the public business id, e.g.
 *     INV-2026-0001). Used by every test that needs a DRAFT invoice to mutate
 *     (send, void, update, record-payment, pdf, etc.).
 */
import { expect } from '@playwright/test';
import type { RoleApiClient } from '@sally/test-utils/playwright';
import { createLoad, assignLoad, updateLoadStatus, createDriver } from '@sally/test-utils/helpers';
import {
  buildDriver,
  buildApproveForBilling,
  buildPayStructureUpsert,
  buildSettlementCalcRequest,
  type PayStructureUpsertPayload,
} from '@sally/test-utils/factories';

// ── Types ─────────────────────────────────────────────────────────────

export interface DeliveredLoadSetup {
  /** Load.id (numeric primary key). */
  id: number;
  /** Load.loadId — the string public id (`LOAD-####`). */
  loadId: string;
  /** Load.loadNumber — the tenant-scoped counter value. */
  loadNumber: string;
  /** Driver.driverId — string public id the load was assigned to. */
  driverPublicId: string;
}

// ── firstCustomerId ───────────────────────────────────────────────────

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
    throw new Error('GET /customers returned 0 customers — financials tests require a seeded customer');
  }
  return items[0].id;
}

// ── createDeliveredLoad ───────────────────────────────────────────────

/**
 * Bootstrap a fresh load all the way to DELIVERED.
 *
 * Flow (mirrors Phase 1 state-machine walk):
 *   PENDING  (via POST /loads)
 *     → ASSIGNED   (via POST /loads/:id/assign with a freshly-minted driver)
 *     → IN_TRANSIT (via PATCH /loads/:id/status)
 *     → DELIVERED  (via PATCH /loads/:id/status)
 *
 * Bounded retry on driver creation (`DRV-` collision — finding #2). Vehicle
 * is NOT provisioned — close-out + profitability endpoints don't require one.
 *
 * Caller owns cleanup — push `loadId` to the spec's load tracker and
 * `driverPublicId` to the driver tracker.
 */
export async function createDeliveredLoad(
  asDispatcher: RoleApiClient,
  asAdmin: RoleApiClient,
): Promise<DeliveredLoadSetup> {
  const customerId = await firstCustomerId(asDispatcher);
  const seed = await createLoad(asDispatcher, customerId);

  // Bounded retry against the DRV-${Date.now()} collision class — same
  // pattern as `createAssignedLoad` in tests/api/fleet/loads/_helpers.ts.
  let driverPublicId = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const driver = await createDriver(asAdmin, buildDriver());
      driverPublicId = driver.driverId;
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('HTTP 409')) throw err;
    }
  }
  if (!driverPublicId) {
    throw new Error('createDeliveredLoad: POST /drivers returned 409 three times (driverId collision — finding #2)');
  }

  await assignLoad(asDispatcher, seed.loadId, driverPublicId);
  await updateLoadStatus(asDispatcher, seed.loadId, 'IN_TRANSIT');
  await updateLoadStatus(asDispatcher, seed.loadId, 'DELIVERED');

  return {
    id: seed.id,
    loadId: seed.loadId,
    loadNumber: seed.loadNumber,
    driverPublicId,
  };
}

// ── withBillingOverrideEnabled ────────────────────────────────────────

/**
 * Ensure the tenant's `FleetOperationsSettings.allowBillingOverride` flag is
 * true for the duration of a block. Returns a `restore` function.
 *
 * Why: a brand-new DELIVERED load has no BOL/POD uploads and no billable
 * charges, so `BillingReadinessService.evaluate` yields `score < 100`. The
 * approve endpoint only accepts the override path when the tenant flag is
 * true — otherwise it returns `400 "Cannot approve: missing ..."`. Flipping
 * the flag for the approve/send-back tests is the minimum-blast-radius
 * alternative to either (a) uploading real documents via /documents (which
 * needs S3 round-trip + separate content-type handling) or (b) satisfying
 * the readiness check by mutating enforcement keys across the board.
 *
 * Uses the `/settings/operations` PUT endpoint. Requires ADMIN/OWNER —
 * caller passes `asAdmin`.
 *
 * Idempotent: if the flag is already true, this is a no-op.
 *
 * Restore behaviour — `restore` is a NO-OP. Under `workers=2` the naïve
 * read-original / write-true / restore-to-false pattern causes two workers
 * to race: worker A toggles on, worker B reads "already on" and records
 * `original=true`, worker A's `afterEach restore()` flips it to false, and
 * worker B's next approve call fails with 400. We choose the simpler
 * contract of "leave it on for the rest of the test run" — the demo
 * tenants are QA fixtures, so the flag staying true between runs is
 * harmless. A dedicated global-teardown is the right place to revert
 * tenant-wide settings; none of the Phase 2 test suites register one, so
 * we don't manufacture false safety here. Documented in findings #16.
 */
export async function withBillingOverrideEnabled(_asAdmin: RoleApiClient): Promise<{ restore: () => Promise<void> }> {
  const getRes = await _asAdmin.get('/settings/operations');
  expect(getRes.status()).toBe(200);
  const current = (await getRes.json()) as { allowBillingOverride?: boolean };
  if (current.allowBillingOverride !== true) {
    const putRes = await _asAdmin.put('/settings/operations', {
      allowBillingOverride: true,
    });
    expect(putRes.status()).toBe(200);
  }

  return {
    restore: async () => {
      // Intentional no-op — see docstring.
    },
  };
}

// ── createInvoiceableLoad ─────────────────────────────────────────────

/**
 * End-to-end bootstrap for invoicing tests.
 *
 * Sequence:
 *   1. Create + assign + deliver a load via `createDeliveredLoad`.
 *   2. POST /close-out/:loadId/approve with an override reason — flips
 *      `billingStatus: PENDING_DOCUMENTS → APPROVED`. Required because
 *      `InvoicingService.generateFromLoad` rejects with 400
 *      "Load must be approved for billing" when billingStatus is set but
 *      not APPROVED.
 *   3. POST /invoices/generate/:loadId — creates a DRAFT invoice.
 *
 * PRECONDITION — caller must ensure `FleetOperationsSettings.allowBillingOverride`
 * is true for the tenant BEFORE invoking this helper. With workers=2 the
 * flag cannot be flipped on per-test — two workers racing on the PUT
 * restore each other back to false mid-test. The canonical pattern is:
 *
 *     test.beforeAll(async ({ browser }) => {
 *       // mint an admin client and flip the flag, KEEP IT ON for the spec
 *     });
 *
 * or — equivalently in a Playwright `@sally/test-utils/auth` fixture — in
 * the spec's top-level scope using a dedicated request context. The
 * helper intentionally does NOT toggle the flag: doing so caused cascading
 * 400 "Cannot approve: missing ..." errors under parallel workers (Phase 2
 * Group 2b verification, documented in findings as #16).
 *
 * Returns the delivered-load shape plus the string public invoice id
 * (`inv_<12-hex>`). Caller owns cleanup:
 *   - push `loadId` to the spec's load tracker
 *   - push `driverPublicId` to the driver tracker
 *
 * No retry: all three calls are deterministic on the public API. If
 * approve or generate fail, this throws with the HTTP status and body so
 * the caller can see whether the setup or the env is broken.
 */
export async function createInvoiceableLoad(
  asDispatcher: RoleApiClient,
  asAdmin: RoleApiClient,
): Promise<DeliveredLoadSetup & { invoiceNumber: string }> {
  const setup = await createDeliveredLoad(asDispatcher, asAdmin);

  const approveRes = await asDispatcher.post(
    `/close-out/${setup.loadId}/approve`,
    buildApproveForBilling({
      overrideReason: 'QA Phase 2 Group 2b — invoice setup (override approve for fresh DELIVERED load without docs)',
    }),
  );
  if (approveRes.status() !== 201) {
    const body = await approveRes.text().catch(() => '');
    throw new Error(
      `createInvoiceableLoad: POST /close-out/${setup.loadId}/approve → HTTP ${approveRes.status()} ${body.slice(0, 240)}`,
    );
  }

  const invRes = await asDispatcher.post(`/invoices/generate/${setup.loadId}`, {});
  if (invRes.status() !== 201) {
    const body = await invRes.text().catch(() => '');
    throw new Error(
      `createInvoiceableLoad: POST /invoices/generate/${setup.loadId} → HTTP ${invRes.status()} ${body.slice(0, 240)}`,
    );
  }

  const invoice = (await invRes.json()) as { invoiceNumber: string };
  expect(invoice.invoiceNumber, 'generated invoice must carry a public invoiceNumber').toBeTruthy();
  return { ...setup, invoiceNumber: invoice.invoiceNumber };
}

// ── createCalculatedSettlement ────────────────────────────────────────────
//
// Phase 2 Group 2e bootstrap. Stands up everything the settlements service
// needs to create a DRAFT settlement:
//
//   1. A driver — either freshly minted OR the caller-supplied existing
//      `driverPublicId` (e.g. `seededDriverPublicId(authState)` for the
//      asDriver self-service tests).
//   2. A pay structure attached to that driver, `isActive: true`,
//      `effectiveFrom` 30 days in the past. Defaults to FLAT_RATE — no
//      route-plan miles dependency, so the calc produces a deterministic
//      `grossPayCents = flatRateCents` regardless of load route metadata.
//   3. A DELIVERED load assigned to the driver with `deliveredAt` inside
//      the calc period. `createDeliveredLoad` drives the standard
//      PENDING → ASSIGNED → IN_TRANSIT → DELIVERED state machine; the
//      service stamps `deliveredAt: new Date()` when it hits DELIVERED,
//      so the 14-day back-window the factory uses is comfortably wider.
//   4. POST /settlements/calculate → DRAFT settlement. Returns the public
//      `settlementId` plus the setup identifiers so the caller can do
//      afterEach cleanup.
//
// Caller cleanup contract — afterEach must:
//   - `voidSettlement` on the settlementId when status is not PAID (the
//     backend rejects voiding a PAID settlement; callers that pay the
//     settlement as part of the test body pass `skipCleanupVoid: true`
//     to the helper OR skip the afterEach void for that one id).
//   - `cleanupLoad` on the loadId.
//   - `deactivateDriver` on the `driverPublicId` ONLY when `createdDriver`
//     is true (the seeded driver MUST NOT be deactivated — other tests
//     use it).
//
// Bounded retries match `createDeliveredLoad` — `DRV-` collision class.
//
// Signature is two-arg `(asDispatcher, asAdmin)` + an options bag so the
// caller can opt into self-service-mode by passing `driverPublicId`.

export interface CalculatedSettlementSetup {
  /** Settlement.settlementId — string public id (`stl_<12-hex>`). */
  settlementId: string;
  /** Settlement.settlementNumber (`STL-YYYY-WNN-LASTNAME[-SEQ]`). */
  settlementNumber: string;
  /** Driver.driverId — string public id the settlement was created for. */
  driverPublicId: string;
  /** True when this helper minted the driver (caller must deactivate).
   *  False when the caller supplied a pre-existing driverPublicId. */
  createdDriver: boolean;
  /** Load.loadId — the string public id of the DELIVERED load that
   *  drives the calc. Caller owns cleanup via `cleanupLoad`. */
  loadId: string;
  /** Load.loadNumber — tenant-scoped counter value. */
  loadNumber: string;
  /** The calc window (YYYY-MM-DD) — useful for GET /settlements filtering. */
  periodStart: string;
  periodEnd: string;
  /** The calc response's gross/net — matches `flatRateCents` for FLAT_RATE. */
  grossPayCents: number;
  netPayCents: number;
}

export async function createCalculatedSettlement(
  asDispatcher: RoleApiClient,
  asAdmin: RoleApiClient,
  options: {
    /** Use this existing driverId instead of minting one. Required for
     *  asDriver self-service tests so the settlement attaches to the
     *  fixture's linked Driver row. */
    driverPublicId?: string;
    /** Override the pay structure payload (default FLAT_RATE 50000 cents). */
    payStructure?: Partial<PayStructureUpsertPayload>;
  } = {},
): Promise<CalculatedSettlementSetup> {
  // Step 1 — resolve a driver (mint or reuse).
  let driverPublicId: string;
  let createdDriver: boolean;
  if (options.driverPublicId !== undefined) {
    driverPublicId = options.driverPublicId;
    createdDriver = false;
  } else {
    driverPublicId = '';
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
      throw new Error(
        'createCalculatedSettlement: POST /drivers returned 409 three times (driverId collision — finding #2)',
      );
    }
    createdDriver = true;
  }

  // Step 2 — ensure the driver has an active pay structure.
  //
  // Idempotency nuance (finding #21): the live `driver_pay_structures` table
  // on demo-northstar still carries the pre-2026-04-10 unique-on-driver_id
  // index, so `PayStructureService.upsert` fails with 409 when a row already
  // exists (deactivate old + create new → same driver_id → P2002). We GET
  // first; if the driver already has a pay structure (e.g. the seeded
  // DRIVER), we trust it and move on. Freshly-minted drivers return 200
  // with `null` body → we PUT to attach one.
  const existingRes = await asAdmin.get(`/pay-structures/${driverPublicId}`);
  if (existingRes.status() !== 200) {
    const body = await existingRes.text().catch(() => '');
    throw new Error(
      `createCalculatedSettlement: GET /pay-structures/${driverPublicId} → HTTP ${existingRes.status()} ${body.slice(0, 240)}`,
    );
  }
  const existingBody = await existingRes.text();
  const hasExistingStructure = existingBody.length > 0 && existingBody !== 'null';
  if (!hasExistingStructure) {
    const payStructurePayload = buildPayStructureUpsert(options.payStructure);
    const psRes = await asAdmin.put(`/pay-structures/${driverPublicId}`, payStructurePayload);
    if (psRes.status() !== 200) {
      const body = await psRes.text().catch(() => '');
      throw new Error(
        `createCalculatedSettlement: PUT /pay-structures/${driverPublicId} → HTTP ${psRes.status()} ${body.slice(0, 240)}`,
      );
    }
  }

  // Step 3 — stand up a DELIVERED load assigned to this driver. Reuse the
  // same state-machine walk `createDeliveredLoad` uses, but pass our
  // resolved driverPublicId so the load goes where the settlement needs it.
  const customerId = await firstCustomerId(asDispatcher);
  const seed = await createLoad(asDispatcher, customerId);
  await assignLoad(asDispatcher, seed.loadId, driverPublicId);
  await updateLoadStatus(asDispatcher, seed.loadId, 'IN_TRANSIT');
  await updateLoadStatus(asDispatcher, seed.loadId, 'DELIVERED');

  // Step 4 — calculate. The factory defaults to a 14-day back-window
  // ending tomorrow; `deliveredAt` was stamped moments ago so it's
  // inside (see factory docstring for the tomorrow/midnight rationale).
  //
  // Bounded retry on 409 — finding #23: the service's
  // `generateSettlementNumber` uses a non-atomic `count + 1` to pick a
  // suffix, so two concurrent calcs for drivers whose last-name prefix
  // collides (e.g. both last-name-starting-with-'SMITH' drivers in
  // the same calendar week) can produce the same settlementNumber and
  // hit the `@@unique([tenantId, settlementNumber])` constraint. A
  // retry mints the next suffix. Three attempts is comfortable for
  // `workers=2`; the backend should be fixed to use an atomic counter
  // (finding #23).
  const calcRequest = buildSettlementCalcRequest(driverPublicId);
  let calcRes = await asDispatcher.post('/settlements/calculate', calcRequest);
  let calcBody = await calcRes.text().catch(() => '');
  for (let attempt = 0; attempt < 3 && calcRes.status() === 409; attempt++) {
    // Only retry the race (409 + "A record with this value already
    // exists" signal — settlementNumber unique collision). 409 with
    // "Settlement already covers this period" is a legitimate
    // precondition failure — don't loop on it.
    if (!calcBody.includes('A record with this value')) break;
    await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    calcRes = await asDispatcher.post('/settlements/calculate', calcRequest);
    calcBody = await calcRes.text().catch(() => '');
  }
  if (calcRes.status() !== 201) {
    throw new Error(
      `createCalculatedSettlement: POST /settlements/calculate → HTTP ${calcRes.status()} ${calcBody.slice(0, 240)}`,
    );
  }
  const settlement = JSON.parse(calcBody) as {
    settlementId: string;
    settlementNumber: string;
    grossPayCents: number;
    netPayCents: number;
  };
  expect(settlement.settlementId, 'calculated settlement must carry a public settlementId').toBeTruthy();

  return {
    settlementId: settlement.settlementId,
    settlementNumber: settlement.settlementNumber,
    driverPublicId,
    createdDriver,
    loadId: seed.loadId,
    loadNumber: seed.loadNumber,
    periodStart: calcRequest.periodStart,
    periodEnd: calcRequest.periodEnd,
    grossPayCents: settlement.grossPayCents,
    netPayCents: settlement.netPayCents,
  };
}

/**
 * Integrations · Accounting (Phase 5 Group 5c — 10 tests on AccountingController).
 *
 * Covers the 10 endpoints on
 * `apps/backend/src/domains/integrations/accounting/controllers/accounting.controller.ts`:
 *
 *   29. GET   /accounting/status                         — connection status
 *   30. GET   /accounting/mappings/customer              — entity-mapping list
 *   31. GET   /accounting/external-entities/customer     — external-entity cache
 *   32. PATCH /accounting/mappings/:id                   — update mapping
 *   33. POST  /accounting/mappings/:id/confirm           — confirm mapping (@HttpCode(200))
 *   34. GET   /accounting/account-mappings               — item-type → QB account list
 *   35. PATCH /accounting/account-mappings/:id           — update account mapping
 *   36. POST  /accounting/sync/invoice/:invoiceId        — queue invoice sync
 *   37. POST  /accounting/sync/settlement/:settlementId  — queue settlement sync
 *   38. POST  /accounting/setup/initial-sync             — queue initial sync
 *
 * Shared precondition: an ACCOUNTING integration row must exist on
 * the tenant — otherwise every endpoint 404s ("No active QuickBooks
 * integration found"). demo-northstar-2026 ships ZERO accounting rows
 * today, so the file-level `beforeAll` calls `ensureAccountingIntegration`
 * (creates a QUICKBOOKS row with no credentials — enough for the
 * service to proceed past the 404 guard; all 10 endpoints pass). The
 * `afterAll` idempotently deletes the row.
 *
 * Status-code map (verified against controller source):
 *   - GET 29, 30, 31, 34: 200 (Nest GET default).
 *   - PATCH 32, 35: 200 (Nest PATCH default).
 *   - POST 33 (confirm): 200 — controller has explicit `@HttpCode(200)`.
 *   - POST 36, 37, 38 (sync + initial-sync): 201 — NestJS POST default
 *     (NO `@HttpCode` override). Finding #46 precedent.
 *
 * Response-shape note (drift from plan §6):
 *   The plan doc listed `SyncTriggerResponseSchema` (jobIds plural) for
 *   tests 36–38. Live-probed response is `{success: true, jobId: string,
 *   message?: string}` — singular `jobId`, and the fleet-sync plural
 *   schema does NOT match. New schema `AccountingSyncTriggerResponseSchema`
 *   models the actual wire shape. See findings.md §47.
 *
 * Data-capability gating:
 *   - Tests 32, 33 require at least one mapping row → tagged
 *     `@requires:data-accounting-mapping`.
 *   - Test 35 requires at least one account-mapping row → tagged
 *     `@requires:data-accounting-account-mapping`.
 *   On demo-northstar these rows are empty (mappings seeded only by
 *   real-QB-credential initial sync), so the 3 tests are collection-
 *   excluded on default dev runs. 7 tests run; 3 excluded-at-collection.
 *
 * Tests 36 + 37 do NOT carry @requires:data-* tags in this spec because
 * the controller does not validate the entityId — `/sync/invoice/bogus`
 * enqueues a Job successfully (the async worker would fail, but the
 * HTTP contract passes). Tagging these with data-completed-job /
 * data-approved-settlement would incorrectly exclude them on dev.
 *
 * Rubric (per tests/README.md):
 *   - Role fixture: `asAdmin` — controller is `@Roles(ADMIN, OWNER)`.
 *   - Factories: buildAccountingMappingPatch, buildAccountAccountMappingPatch.
 *   - Exact numeric status on every test (verified against source).
 *   - expectContract(Schema.strict(), body) on every happy path.
 *   - Semantic assertion (echo or state check) on every test.
 *   - Cleanup: beforeAll bootstraps + afterAll tears down the scoped
 *     QUICKBOOKS integration. Idempotent.
 *   - Tags: `@workflow @contract` baseline; `@slow` on the 3 sync POSTs
 *     (enqueue Bull jobs); `@destructive` on the 2 PATCH tests.
 *   - Zero runtime `test.skip(cond, ...)`.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildAccountingMappingPatch, buildAccountAccountMappingPatch } from '@sally/test-utils/factories';
import { expectContract, IntegrationSchemas } from '@sally/test-utils/schemas';
import {
  ensureAccountingIntegration,
  firstAccountingMapping,
  firstAccountingAccountMapping,
} from './_helpers';

const {
  AccountingStatusSchema,
  AccountingMappingSchema,
  AccountingMappingListSchema,
  ExternalEntityListSchema,
  AccountAccountMappingSchema,
  AccountAccountMappingListSchema,
  AccountingSyncTriggerResponseSchema,
} = IntegrationSchemas;

test.describe('Integrations · Accounting (QuickBooks) @workflow', () => {
  // All 10 tests share one bootstrapped accounting integration. Each
  // test calls `ensureAccountingIntegration(asAdmin)` at the top; the
  // helper is idempotent (returns the existing row without creating a
  // new one). The first test to create the row captures the cleanup
  // closure into `cleanupFn`; `afterAll` invokes it exactly once.
  // (beforeAll would have worked too but Playwright's beforeAll lacks
  // access to the `asAdmin` fixture.)
  let cleanupFn: (() => Promise<void>) | undefined;

  test.afterAll(async () => {
    if (cleanupFn) await cleanupFn();
  });

  // 29 ── GET /accounting/status ───────────────────────────────────────
  test('GET /accounting/status returns connection shape (ADMIN) @workflow @contract', async ({ asAdmin }) => {
    const bootstrap = await ensureAccountingIntegration(asAdmin);
    if (!cleanupFn) cleanupFn = bootstrap.cleanup;

    const res = await asAdmin.get('/accounting/status');
    expect(res.status()).toBe(200);
    const body = expectContract(AccountingStatusSchema, await res.json(), 'GET /accounting/status');

    // Semantic — `connected` is a boolean (discriminator). On a row
    // without OAuth credentials (our bootstrap), `connected: false` is
    // the expected branch. A real QB-connected tenant would flip to
    // the `connected: true` branch.
    expect(typeof body.connected).toBe('boolean');
    if (body.connected) {
      expect(body.vendor).toBe('QUICKBOOKS');
    }
  });

  // 30 ── GET /accounting/mappings/customer ────────────────────────────
  test('GET /accounting/mappings/customer returns array (ADMIN) @workflow @contract', async ({ asAdmin }) => {
    const bootstrap = await ensureAccountingIntegration(asAdmin);
    if (!cleanupFn) cleanupFn = bootstrap.cleanup;

    const res = await asAdmin.get('/accounting/mappings/customer');
    expect(res.status()).toBe(200);
    const body = expectContract(
      AccountingMappingListSchema,
      await res.json(),
      'GET /accounting/mappings/customer',
    );

    // Semantic — always an array; may be empty on a freshly-bootstrapped
    // integration (no initial sync has run).
    expect(Array.isArray(body)).toBe(true);
    for (const row of body) {
      expect(row.entityType).toBe('customer');
      expect(row.integrationId).toBe(bootstrap.integrationId);
    }
  });

  // 31 ── GET /accounting/external-entities/customer ───────────────────
  test('GET /accounting/external-entities/customer returns array (ADMIN) @workflow @contract', async ({
    asAdmin,
  }) => {
    const bootstrap = await ensureAccountingIntegration(asAdmin);
    if (!cleanupFn) cleanupFn = bootstrap.cleanup;

    const res = await asAdmin.get('/accounting/external-entities/customer');
    expect(res.status()).toBe(200);
    const body = expectContract(
      ExternalEntityListSchema,
      await res.json(),
      'GET /accounting/external-entities/customer',
    );

    // Semantic — always an array. Each cached entity carries the
    // integrationId we bootstrapped with.
    expect(Array.isArray(body)).toBe(true);
    for (const row of body) {
      expect(row.entityType).toBe('customer');
      expect(row.integrationId).toBe(bootstrap.integrationId);
    }
  });

  // 32 ── PATCH /accounting/mappings/:id ───────────────────────────────
  test('PATCH /accounting/mappings/:id echoes externalId (ADMIN) @workflow @contract @destructive @requires:data-accounting-mapping', async ({
    asAdmin,
  }) => {
    const bootstrap = await ensureAccountingIntegration(asAdmin);
    if (!cleanupFn) cleanupFn = bootstrap.cleanup;

    const mapping = await firstAccountingMapping(asAdmin, 'customer');
    const payload = buildAccountingMappingPatch();
    const res = await asAdmin.patch(`/accounting/mappings/${mapping.id}`, payload);
    expect(res.status()).toBe(200);
    const body = expectContract(AccountingMappingSchema, await res.json(), `PATCH /accounting/mappings/${mapping.id}`);

    // Semantic — patched externalId + externalName echo through.
    expect(body.id).toBe(mapping.id);
    expect(body.externalId).toBe(payload.externalId);
    expect(body.externalName).toBe(payload.externalName);
  });

  // 33 ── POST /accounting/mappings/:id/confirm ────────────────────────
  test('POST /accounting/mappings/:id/confirm stamps confirmedAt (ADMIN) @workflow @contract @destructive @requires:data-accounting-mapping', async ({
    asAdmin,
  }) => {
    const bootstrap = await ensureAccountingIntegration(asAdmin);
    if (!cleanupFn) cleanupFn = bootstrap.cleanup;

    const mapping = await firstAccountingMapping(asAdmin, 'customer');
    // Explicit @HttpCode(200) on the controller — status is 200, NOT 201.
    const res = await asAdmin.post(`/accounting/mappings/${mapping.id}/confirm`, {});
    expect(res.status()).toBe(200);
    const body = expectContract(
      AccountingMappingSchema,
      await res.json(),
      `POST /accounting/mappings/${mapping.id}/confirm`,
    );

    // Semantic — `confirmedAt` is now a non-null ISO timestamp.
    expect(body.id).toBe(mapping.id);
    expect(body.confirmedAt).not.toBeNull();
    if (body.confirmedAt !== null) {
      expect(body.confirmedAt.length).toBeGreaterThan(0);
    }
  });

  // 34 ── GET /accounting/account-mappings ─────────────────────────────
  test('GET /accounting/account-mappings returns array (ADMIN) @workflow @contract', async ({ asAdmin }) => {
    const bootstrap = await ensureAccountingIntegration(asAdmin);
    if (!cleanupFn) cleanupFn = bootstrap.cleanup;

    const res = await asAdmin.get('/accounting/account-mappings');
    expect(res.status()).toBe(200);
    const body = expectContract(
      AccountAccountMappingListSchema,
      await res.json(),
      'GET /accounting/account-mappings',
    );

    // Semantic — always an array; each row carries the bootstrapped
    // integrationId and a valid direction.
    expect(Array.isArray(body)).toBe(true);
    for (const row of body) {
      expect(row.integrationId).toBe(bootstrap.integrationId);
      expect(['INCOME', 'EXPENSE']).toContain(row.direction);
    }
  });

  // 35 ── PATCH /accounting/account-mappings/:id ───────────────────────
  test('PATCH /accounting/account-mappings/:id echoes externalAccountId (ADMIN) @workflow @contract @destructive @requires:data-accounting-account-mapping', async ({
    asAdmin,
  }) => {
    const bootstrap = await ensureAccountingIntegration(asAdmin);
    if (!cleanupFn) cleanupFn = bootstrap.cleanup;

    const mapping = await firstAccountingAccountMapping(asAdmin);
    const payload = buildAccountAccountMappingPatch();
    const res = await asAdmin.patch(`/accounting/account-mappings/${mapping.id}`, payload);
    expect(res.status()).toBe(200);
    const body = expectContract(
      AccountAccountMappingSchema,
      await res.json(),
      `PATCH /accounting/account-mappings/${mapping.id}`,
    );

    // Semantic — patched externalAccountId + externalAccountName echo.
    expect(body.id).toBe(mapping.id);
    expect(body.externalAccountId).toBe(payload.externalAccountId);
    expect(body.externalAccountName).toBe(payload.externalAccountName);
  });

  // 36 ── POST /accounting/sync/invoice/:invoiceId ─────────────────────
  test('POST /accounting/sync/invoice/:invoiceId enqueues a job (ADMIN) @workflow @contract @slow', async ({
    asAdmin,
  }) => {
    const bootstrap = await ensureAccountingIntegration(asAdmin);
    if (!cleanupFn) cleanupFn = bootstrap.cleanup;

    // NestJS POST default — 201 (no @HttpCode override). The controller
    // does NOT validate the invoiceId against the DB — the Bull worker
    // is responsible for that. So passing a synthetic id still enqueues
    // and returns a valid contract — that's what we assert here.
    const syntheticInvoiceId = `qa-inv-${Date.now()}`;
    const res = await asAdmin.post(`/accounting/sync/invoice/${syntheticInvoiceId}`, {});
    expect(res.status()).toBe(201);
    const body = expectContract(
      AccountingSyncTriggerResponseSchema,
      await res.json(),
      `POST /accounting/sync/invoice/${syntheticInvoiceId}`,
    );

    // Semantic — successful enqueue returns `{success: true, jobId: string}`.
    // The guard branch returns `{success: false, message, jobId: <in-flight>}` —
    // extremely unlikely given our synthetic-per-call invoiceId but
    // accommodate anyway.
    expect(typeof body.success).toBe('boolean');
    expect(body.jobId.length).toBeGreaterThan(0);
    if (!body.success && body.message) {
      expect(body.message.toLowerCase()).toMatch(/progress|already/);
    }
  });

  // 37 ── POST /accounting/sync/settlement/:settlementId ───────────────
  test('POST /accounting/sync/settlement/:settlementId enqueues a job (ADMIN) @workflow @contract @slow', async ({
    asAdmin,
  }) => {
    const bootstrap = await ensureAccountingIntegration(asAdmin);
    if (!cleanupFn) cleanupFn = bootstrap.cleanup;

    // Same pattern as test 36 — synthetic id, Bull worker handles DB
    // validation, HTTP contract passes on any string id.
    const syntheticSettlementId = `qa-stl-${Date.now()}`;
    const res = await asAdmin.post(`/accounting/sync/settlement/${syntheticSettlementId}`, {});
    expect(res.status()).toBe(201);
    const body = expectContract(
      AccountingSyncTriggerResponseSchema,
      await res.json(),
      `POST /accounting/sync/settlement/${syntheticSettlementId}`,
    );

    expect(typeof body.success).toBe('boolean');
    expect(body.jobId.length).toBeGreaterThan(0);
    if (!body.success && body.message) {
      expect(body.message.toLowerCase()).toMatch(/progress|already/);
    }
  });

  // 38 ── POST /accounting/setup/initial-sync ──────────────────────────
  //
  // Ordered LAST in the describe block so it can also serve as the
  // reliable cleanup site for the bootstrapped QB integration. The
  // `afterAll` hook captures `cleanupFn` from the first test to create
  // the row, but by afterAll time the `asAdmin` fixture's request
  // context has been torn down — the DELETE throws "Target page,
  // context or browser has been closed" and the try/catch swallows it,
  // leaving the row behind. Same caveat as Group 5a's serial-block
  // `afterAll`. We issue the DELETE inline here (where the fixture is
  // still alive), and the afterAll becomes purely defensive.
  test('POST /accounting/setup/initial-sync enqueues a job (ADMIN) @workflow @contract @slow', async ({ asAdmin }) => {
    const bootstrap = await ensureAccountingIntegration(asAdmin);
    if (!cleanupFn) cleanupFn = bootstrap.cleanup;

    try {
      // NestJS POST default — 201. No @HttpCode override.
      const res = await asAdmin.post('/accounting/setup/initial-sync', {});
      expect(res.status()).toBe(201);
      const body = expectContract(
        AccountingSyncTriggerResponseSchema,
        await res.json(),
        'POST /accounting/setup/initial-sync',
      );

      // Semantic — happy path on initial-sync sets `message: 'Initial
      // entity sync started'` (controller line 329) AND `success: true`.
      // No concurrent-sync guard on this endpoint — always enqueues.
      expect(body.success).toBe(true);
      expect(body.jobId.length).toBeGreaterThan(0);
      expect(body.message).toBeDefined();
      if (body.message) {
        expect(body.message.toLowerCase()).toContain('sync');
      }
    } finally {
      // Inline cleanup — fixture context is still alive here. Idempotent:
      // the helper's `cleanup` is a no-op if the row wasn't created by
      // THIS run (pre-existing tenant integration).
      await cleanupFn?.();
    }
  });
});

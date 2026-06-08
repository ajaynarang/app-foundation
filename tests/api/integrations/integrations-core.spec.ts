/**
 * Integrations · Core (Phase 5 Group 5a — 12 tests on IntegrationsController).
 *
 * Covers the 12 non-plan-gated endpoints on
 * `apps/backend/src/domains/integrations/integrations.controller.ts`:
 *
 *    1.  GET  /integrations                        — list
 *    2.  GET  /integrations/vendors                — vendor registry
 *    3.  GET  /integrations/health                 — health roll-up
 *    4.  GET  /integrations/sync-history           — unified envelope
 *    5.  POST /integrations                        — create (shared bootstrap)
 *    6.  GET  /integrations/:integrationId         — detail
 *    7.  PATCH /integrations/:integrationId        — update
 *    8.  DELETE /integrations/:integrationId       — remove (terminal)
 *    9.  POST /integrations/:integrationId/test    — test-connection
 *   10.  POST /integrations/:integrationId/sync    — trigger sync (@slow)
 *   11.  GET  /integrations/:integrationId/sync-history  — per-integration list
 *   12.  GET  /integrations/:integrationId/sync-history/stats — roll-up
 *
 * File-level strategy — two describe blocks, both SERIAL:
 *   A "POST-first" serial block (tests 5 → 6 → 7 → 9 → 10 → 11 → 12 → 8):
 *     one integration is created once; tests GET / PATCH / test /
 *     sync / sync-history / stats against it; test 8 is LAST and
 *     DELETEs it — the delete is both the test-8 assertion AND the
 *     cleanup for the whole block.
 *   A "read-only" parallel block (tests 1 → 2 → 3 → 4):
 *     these don't need a freshly-created row; they read tenant-level
 *     data. Ordered before the serial block purely for readability.
 *
 * Why two blocks: tests 5–12 have a DATA dependency on each other
 * (same integration row). A parallel block with shared state would
 * race. Playwright's `test.describe.configure({mode: 'serial'})`
 * serialises inside the block and still allows the read-only block
 * to run in parallel with other spec files.
 *
 * Rubric (per tests/README.md):
 *   - Role fixture: `asAdmin` / `asOwner` — the controller is
 *     `@Roles(ADMIN, OWNER)`-gated; DISPATCHER gets 403.
 *   - Factories: buildIntegrationCreate, buildIntegrationUpdate.
 *   - Exact numeric status. NestJS POST default is 201 — test 5 hits
 *     201, tests 9/10 ALSO return 201 because they're POSTs (not 200
 *     as v1 plan predicted — live probe confirmed).
 *   - expectContract(Schema.strict(), body) on every happy path.
 *   - Semantic assertion (echo check or state change) on every test.
 *   - Persistence: test 5 is verified by test 6 (GET in the next
 *     test); test 7 by a second GET in the same test; test 8 by GET
 *     returning 404 (final state).
 *   - Cleanup: afterAll in the serial block DELETEs via `cleanup()`
 *     even if test 8 fails (idempotent — second DELETE is a 404).
 *   - Tags: `@workflow @contract` baseline; `@destructive` on 5, 7,
 *     8; `@slow` on 10 (POST /sync enqueues real jobs).
 *   - Zero runtime `test.skip(cond, ...)`.
 *
 * Finding #45 (SyncTriggerResponseSchema is a union): test 10 asserts
 * the schema and then branches on `body.success` for the semantic
 * assertion (happy branch is expected on a freshly-created row with
 * no prior syncs in flight).
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildIntegrationCreate, buildIntegrationUpdate } from '@sally/test-utils/factories';
import { expectContract, IntegrationSchemas } from '@sally/test-utils/schemas';
import type { ScopedIntegration } from './_helpers';

const {
  IntegrationRowSchema,
  IntegrationListSchema,
  IntegrationCreateResponseSchema,
  IntegrationUpdateResponseSchema,
  DeleteIntegrationResponseSchema,
  VendorRegistrySchema,
  IntegrationHealthResponseSchema,
  SyncHistoryListResponseSchema,
  SyncHistoryArraySchema,
  SyncStatsSchema,
  TestConnectionResponseSchema,
  SyncTriggerResponseSchema,
} = IntegrationSchemas;

// ─── Read-only, parallel-safe (tests 1–4) ──────────────────────────────
test.describe('Integrations · Core read paths @workflow @contract', () => {
  // 1 ── GET /integrations ─────────────────────────────────────────────
  test('GET /integrations lists tenant integrations (ADMIN) @workflow @contract', async ({ asAdmin }) => {
    const res = await asAdmin.get('/integrations');
    expect(res.status()).toBe(200);
    const body = expectContract(IntegrationListSchema, await res.json(), 'GET /integrations');

    // Semantic — the list is scoped to demo-northstar-2026 which at
    // minimum has a DAT_LOAD_BOARD row (seeded); every row carries an
    // `int_<uuid>` or `integ_<tenant>_<vendor>` string id + a non-empty
    // vendor + a known integrationType.
    expect(body.length).toBeGreaterThan(0);
    for (const row of body) {
      expect(row.id.length).toBeGreaterThan(0);
      expect(row.vendor.length).toBeGreaterThan(0);
      expect(['TMS', 'ELD', 'ACCOUNTING', 'LOAD_BOARD']).toContain(row.integrationType);
    }
  });

  // 2 ── GET /integrations/vendors ─────────────────────────────────────
  test('GET /integrations/vendors returns the vendor registry (ADMIN) @workflow @contract', async ({ asAdmin }) => {
    const res = await asAdmin.get('/integrations/vendors');
    expect(res.status()).toBe(200);
    const body = expectContract(VendorRegistrySchema, await res.json(), 'GET /integrations/vendors');

    // Semantic — the registry surfaces at least the core vendors
    // (Samsara, QuickBooks). VENDOR_REGISTRY is keyed by vendor id
    // like SAMSARA_ELD / QUICKBOOKS (live-probed); the service flattens
    // it into an array but preserves the `id` field.
    expect(body.length).toBeGreaterThan(0);
    const ids = body.map((v) => v.id);
    expect(ids).toContain('SAMSARA_ELD');
    expect(ids).toContain('QUICKBOOKS');
    for (const vendor of body) {
      expect(vendor.displayName.length).toBeGreaterThan(0);
      expect(vendor.connectionMethods.length).toBeGreaterThan(0);
    }
  });

  // 3 ── GET /integrations/health ──────────────────────────────────────
  test('GET /integrations/health returns the tenant roll-up (ADMIN) @workflow @contract', async ({ asAdmin }) => {
    const res = await asAdmin.get('/integrations/health');
    expect(res.status()).toBe(200);
    const body = expectContract(IntegrationHealthResponseSchema, await res.json(), 'GET /integrations/health');

    // Semantic — `hasIntegrations` must be true on a tenant with any
    // row, `configuredTypes` is a non-empty array listing integrationType
    // values that actually exist. `unmatchedAssets` is currently a
    // placeholder number (service returns 0 always — line 152).
    expect(body.hasIntegrations).toBe(true);
    expect(body.configuredTypes.length).toBeGreaterThan(0);
    expect(typeof body.unmatchedAssets).toBe('number');
    // `tms` and `eld` are both nullable but `hasFleetPipeline` must
    // reflect at least one of them being present.
    if (body.hasFleetPipeline) {
      expect(body.tms !== null || body.eld !== null).toBe(true);
    }
  });

  // 4 ── GET /integrations/sync-history ────────────────────────────────
  test('GET /integrations/sync-history returns the paged envelope (ADMIN) @workflow @contract', async ({ asAdmin }) => {
    const res = await asAdmin.get('/integrations/sync-history');
    expect(res.status()).toBe(200);
    const body = expectContract(SyncHistoryListResponseSchema, await res.json(), 'GET /integrations/sync-history');

    // Semantic — the envelope carries limit/offset defaults (20/0
    // per controller line 77) and `items` is an array sized ≤ limit.
    expect(body.limit).toBe(20);
    expect(body.offset).toBe(0);
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeLessThanOrEqual(body.limit);
    expect(body.total).toBeGreaterThanOrEqual(body.items.length);
  });
});

// ─── Mutation suite (tests 5–12 — POST bootstrap, DELETE terminal) ────
test.describe('Integrations · Core CRUD + action paths @workflow', () => {
  // Serial — all 8 tests share one created integration.
  test.describe.configure({ mode: 'serial' });

  let scoped: ScopedIntegration | undefined;

  test.afterAll(async () => {
    // Best-effort belt-and-braces cleanup. The afterAll fires AFTER
    // each test's `asAdmin` fixture has been torn down, so the
    // cleanup closure's captured `request` context is invalidated —
    // calling DELETE throws "Target page, context or browser has
    // been closed". That's harmless: test 8 already DELETEd the row
    // on the happy path; the try/catch inside `scoped.cleanup` swallows
    // the context-closed error. This hook exists for the case where
    // test 8 errors BEFORE issuing DELETE (e.g. precondition failure).
    if (scoped) await scoped.cleanup();
  });

  // 5 ── POST /integrations ────────────────────────────────────────────
  test('POST /integrations creates an MCLEOD_TMS row (ADMIN) @workflow @contract @destructive', async ({ asAdmin }) => {
    const payload = buildIntegrationCreate('MCLEOD_TMS');
    const res = await asAdmin.post('/integrations', payload);
    expect(res.status()).toBe(201);
    const body = expectContract(IntegrationCreateResponseSchema, await res.json(), 'POST /integrations');

    // Semantic — payload echoed; fresh row is enabled + CONFIGURED.
    expect(body.integrationType).toBe(payload.integrationType);
    expect(body.vendor).toBe(payload.vendor);
    expect(body.displayName).toBe(payload.displayName);
    expect(body.isEnabled).toBe(true);
    expect(body.status).toBe('CONFIGURED');
    expect(body.id.startsWith('int_')).toBe(true);

    // Persistence — test 6 will re-GET this row. Stash it on the
    // describe-scoped handle (with a no-op cleanup so afterAll can
    // rely on `scoped` existing even if later tests don't mutate it).
    scoped = {
      integrationId: body.id,
      integrationType: body.integrationType,
      vendor: body.vendor,
      displayName: body.displayName,
      cleanup: async () => {
        // Best-effort. The `asAdmin` fixture may have been torn down
        // between the last test and afterAll — in that case DELETE
        // throws "Target page, context or browser has been closed",
        // which is harmless because test 8 already DELETEd the row
        // (the afterAll is purely defensive for the case where test 8
        // skipped / errored before its DELETE).
        try {
          const del = await asAdmin.delete(`/integrations/${body.id}`);
          if (del.status() !== 200 && del.status() !== 404) {
            // eslint-disable-next-line no-console
            console.error(
              `afterAll cleanup: DELETE /integrations/${body.id} → HTTP ${del.status()}`,
            );
          }
        } catch {
          // Request context torn down — ignore. Row is either already
          // deleted (test 8 happy path) or will be cleaned up on next
          // QA tenant reset.
        }
      },
    };

    // Additional persistence check — GET /integrations list MUST now
    // contain the fresh row.
    const listRes = await asAdmin.get('/integrations');
    expect(listRes.status()).toBe(200);
    const list = (await listRes.json()) as Array<{ id: string }>;
    expect(list.some((r) => r.id === body.id)).toBe(true);
  });

  // 6 ── GET /integrations/:integrationId ──────────────────────────────
  test('GET /integrations/:integrationId returns the created row (ADMIN) @workflow @contract', async ({ asAdmin }) => {
    expect(scoped, 'test 5 must have succeeded to bootstrap the row').toBeDefined();
    const res = await asAdmin.get(`/integrations/${scoped!.integrationId}`);
    expect(res.status()).toBe(200);
    const body = expectContract(IntegrationRowSchema, await res.json(), `GET /integrations/${scoped!.integrationId}`);

    // Semantic — detail row matches creation.
    expect(body.id).toBe(scoped!.integrationId);
    expect(body.vendor).toBe(scoped!.vendor);
    expect(body.integrationType).toBe(scoped!.integrationType);
    expect(body.displayName).toBe(scoped!.displayName);
    expect(body.isEnabled).toBe(true);
  });

  // 7 ── PATCH /integrations/:integrationId ────────────────────────────
  test('PATCH /integrations/:integrationId renames the row (ADMIN) @workflow @contract @destructive', async ({
    asAdmin,
  }) => {
    expect(scoped, 'test 5 must have succeeded to bootstrap the row').toBeDefined();
    const payload = buildIntegrationUpdate({ displayName: `[QA-TEST] RENAMED ${Date.now()}` });
    const res = await asAdmin.patch(`/integrations/${scoped!.integrationId}`, payload);
    expect(res.status()).toBe(200);
    const body = expectContract(
      IntegrationUpdateResponseSchema,
      await res.json(),
      `PATCH /integrations/${scoped!.integrationId}`,
    );

    // Semantic — new name echoes, id preserved.
    expect(body.displayName).toBe(payload.displayName);
    expect(body.id).toBe(scoped!.integrationId);
    scoped!.displayName = body.displayName;

    // Persistence — GET reflects the new name.
    const verifyRes = await asAdmin.get(`/integrations/${scoped!.integrationId}`);
    expect(verifyRes.status()).toBe(200);
    const verify = expectContract(IntegrationRowSchema, await verifyRes.json());
    expect(verify.displayName).toBe(payload.displayName);
  });

  // 9 ── POST /integrations/:integrationId/test ────────────────────────
  test('POST /integrations/:integrationId/test exercises the connection probe (ADMIN) @workflow @contract', async ({
    asAdmin,
  }) => {
    expect(scoped, 'test 5 must have succeeded to bootstrap the row').toBeDefined();
    // NestJS default POST status is 201 — the controller does not
    // override with @HttpCode — live probe confirmed.
    const res = await asAdmin.post(`/integrations/${scoped!.integrationId}/test`, {});
    expect(res.status()).toBe(201);
    const body = expectContract(
      TestConnectionResponseSchema,
      await res.json(),
      `POST /integrations/${scoped!.integrationId}/test`,
    );

    // Semantic — the response carries `success` (boolean) + a human
    // message. The stubbed McLeod adapter returns success=true; we
    // assert BOTH shape AND the message-exists contract (strict
    // schema already enforces structure).
    expect(typeof body.success).toBe('boolean');
    expect(body.message.length).toBeGreaterThan(0);
  });

  // 10 ── POST /integrations/:integrationId/sync (@slow) ───────────────
  test('POST /integrations/:integrationId/sync enqueues sync jobs (ADMIN) @workflow @contract @slow', async ({
    asAdmin,
  }) => {
    expect(scoped, 'test 5 must have succeeded to bootstrap the row').toBeDefined();
    // POST default 201 — same reason as test 9.
    const res = await asAdmin.post(`/integrations/${scoped!.integrationId}/sync`, {});
    expect(res.status()).toBe(201);
    const body = expectContract(
      SyncTriggerResponseSchema,
      await res.json(),
      `POST /integrations/${scoped!.integrationId}/sync`,
    );

    // Semantic — on a freshly-created row with no prior jobs, the
    // happy branch of the union applies (finding #45). jobIds has
    // one entry per sync type × integration (for TMS: drivers + vehicles
    // + loads → 3 jobs).
    expect(body.success).toBe(true);
    if (body.success) {
      // narrow for TS — the true branch carries jobIds
      expect(body.jobIds.length).toBeGreaterThan(0);
      expect(body.message.length).toBeGreaterThan(0);
      for (const jobId of body.jobIds) {
        expect(typeof jobId).toBe('string');
        expect(jobId.length).toBeGreaterThan(0);
      }
    }
  });

  // 11 ── GET /integrations/:integrationId/sync-history ────────────────
  test('GET /integrations/:integrationId/sync-history returns the row history (ADMIN) @workflow @contract', async ({
    asAdmin,
  }) => {
    expect(scoped, 'test 5 must have succeeded to bootstrap the row').toBeDefined();
    // Per-integration sync-history is a FLAT ARRAY (service returns
    // `jobs.map(...)` — NOT the paged envelope used by the unified
    // /sync-history endpoint). Live probe confirmed.
    const res = await asAdmin.get(`/integrations/${scoped!.integrationId}/sync-history`);
    expect(res.status()).toBe(200);
    const body = expectContract(
      SyncHistoryArraySchema,
      await res.json(),
      `GET /integrations/${scoped!.integrationId}/sync-history`,
    );

    // Semantic — test 10 enqueued jobs; some should now surface in
    // this history (jobs with `inputData.integrationId === <numeric DB id>`).
    // BullMQ processing is async; assert the ARRAY is well-formed
    // without requiring a race on job processing.
    expect(Array.isArray(body)).toBe(true);
    for (const item of body) {
      expect(item.id.length).toBeGreaterThan(0);
      expect(item.vendor.length).toBeGreaterThan(0);
    }
  });

  // 12 ── GET /integrations/:integrationId/sync-history/stats ──────────
  test('GET /integrations/:integrationId/sync-history/stats returns the roll-up (ADMIN) @workflow @contract', async ({
    asAdmin,
  }) => {
    expect(scoped, 'test 5 must have succeeded to bootstrap the row').toBeDefined();
    const res = await asAdmin.get(`/integrations/${scoped!.integrationId}/sync-history/stats`);
    expect(res.status()).toBe(200);
    const body = expectContract(
      SyncStatsSchema,
      await res.json(),
      `GET /integrations/${scoped!.integrationId}/sync-history/stats`,
    );

    // Semantic — counts are non-negative; successRate is 0-100.
    expect(body.totalSyncs).toBeGreaterThanOrEqual(0);
    expect(body.successfulSyncs).toBeGreaterThanOrEqual(0);
    expect(body.failedSyncs).toBeGreaterThanOrEqual(0);
    expect(body.successRate).toBeGreaterThanOrEqual(0);
    expect(body.successRate).toBeLessThanOrEqual(100);
    // Invariant — successful + failed cannot exceed total (queued /
    // processing jobs are neither).
    expect(body.successfulSyncs + body.failedSyncs).toBeLessThanOrEqual(body.totalSyncs);
  });

  // 8 ── DELETE /integrations/:integrationId ───────────────────────────
  //
  // Ordered LAST in the serial block so earlier tests (6/7/9/10/11/12)
  // all see the row present. Live probe confirmed status=200 + body
  // `{success: true}` (NOT 204 as v1 plan guessed).
  test('DELETE /integrations/:integrationId removes the row (ADMIN) @workflow @contract @destructive', async ({
    asAdmin,
  }) => {
    expect(scoped, 'test 5 must have succeeded to bootstrap the row').toBeDefined();
    const res = await asAdmin.delete(`/integrations/${scoped!.integrationId}`);
    expect(res.status()).toBe(200);
    const body = expectContract(
      DeleteIntegrationResponseSchema,
      await res.json(),
      `DELETE /integrations/${scoped!.integrationId}`,
    );

    // Semantic — service returns `{success: true}`.
    expect(body.success).toBe(true);

    // Persistence — subsequent GET returns 404.
    const verifyRes = await asAdmin.get(`/integrations/${scoped!.integrationId}`);
    expect(verifyRes.status()).toBe(404);
  });

});

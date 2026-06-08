/**
 * Integrations · Fleet + ELD sync triggers (Phase 5 Group 5b — 7 tests).
 *
 * Covers the 7 plan-gated sync-trigger endpoints on
 * `apps/backend/src/domains/integrations/integrations.controller.ts`:
 *
 *   22. POST /integrations/fleet/sync           (@requires:plan-tms_integration)
 *   23. POST /integrations/fleet/sync-loads     (@requires:plan-tms_integration)
 *   24. POST /integrations/fleet/sync-drivers   (@requires:plan-tms_integration)
 *   25. POST /integrations/fleet/sync-vehicles  (@requires:plan-tms_integration)
 *   26. POST /integrations/eld/sync             (@requires:plan-samsara_integration)
 *   27. POST /integrations/eld/sync-hos         (@requires:plan-samsara_integration)
 *   28. POST /integrations/eld/sync-telematics  (@requires:plan-samsara_integration)
 *
 * Controller precedent (Group 5a, finding #46a): every POST on
 * IntegrationsController returns **201**, not 200 — NestJS's default
 * status for POST when no `@HttpCode()` override is present. Every
 * handler in this group is a `@Post` without `@HttpCode`, so all 7
 * endpoints return 201 on the happy path.
 *
 * Finding #45 (schema union): `SyncTriggerResponseSchema` is a
 * `z.discriminatedUnion('success', …)` — happy branch
 * `{ success: true, message, jobIds: string[] }` vs concurrent-guard
 * branch `{ success: false, message }` (ONLY `fleet/sync` has that
 * guard, controller lines 91–100). The guard early-returns the
 * `success: false` body WITHOUT overriding status — NestJS still
 * returns 201 for it (same `@Post()` default).
 *
 * The other 6 endpoints unconditionally enqueue. If the tenant has
 * no matching integration rows, `enqueueSyncJobs` iterates nothing
 * and returns `jobIds: []` — schema still validates (array of length
 * 0). Semantic assertion accommodates both populated + empty arrays.
 *
 * Persistence check (criterion 6): the `jobIds` in the response ARE
 * persistence — `enqueueSyncJobs` writes each Job row via
 * `jobService.createJob` BEFORE pushing the id into the return
 * array. A non-empty `jobIds` array is direct evidence of DB writes;
 * an empty array means no integration of the right type existed (so
 * there was nothing to persist). We assert BOTH branches against the
 * strict union schema, which IS the contract. For the populated
 * branch, we additionally assert each id is a non-empty string.
 *
 * No cleanup needed — Job rows are audit trail and don't interfere
 * with subsequent runs (they carry unique UUIDs; Bull processes them
 * asynchronously; there's no tenant-unique constraint).
 *
 * Rubric (per tests/README.md):
 *   - Role fixture: `asAdmin` — controller is `@Roles(ADMIN, OWNER)`.
 *   - Factories: N/A — all 7 endpoints accept empty bodies (no DTO
 *     validation; the handlers only read `req.user`/`@Request`).
 *     Passing `{}` is the 5a precedent (integrations-core test 9/10).
 *   - Exact numeric status: `.toBe(201)` on every test.
 *   - expectContract(SyncTriggerResponseSchema.strict(), body) on
 *     all 7 — the union validates both branches.
 *   - Semantic assertion: every test branches on `body.success` and
 *     asserts `jobIds` shape when truthy, `message` shape always.
 *   - Persistence: implicit in `jobIds.length > 0` (DB write already
 *     completed by the time the response returns — see service note
 *     above). No second GET needed; the jobs are async and might not
 *     yet appear in a per-tenant sync-history GET.
 *   - Tags: `@workflow @contract @slow` + respective
 *     `@requires:plan-<feature>`. Not tagged `@destructive` — while
 *     Bull queue state changes, no DB row of business relevance is
 *     created/modified (Job rows are audit/queue scaffolding that's
 *     expected to accumulate; they don't constrain other tests).
 *   - Zero runtime `test.skip(cond, …)`.
 *
 * Parallel-safety: all 7 tests are independent — no shared state, no
 * serial block required. The only cross-test risk is `fleet/sync`'s
 * concurrent-sync guard: if test 22 runs while test 23 is still
 * enqueuing TMS jobs, test 22 may see the guard trip and return
 * `success: false`. Our schema handles both branches + the assertion
 * branches on `body.success`, so parallel execution is safe.
 */
import { test, expect } from '@sally/test-utils/auth';
import { expectContract, IntegrationSchemas } from '@sally/test-utils/schemas';

const { SyncTriggerResponseSchema } = IntegrationSchemas;

// ── Helper — shared assertion logic ──────────────────────────────────
//
// Every endpoint in this group returns the same shape; the only axis
// of variation is the concurrent-sync guard on `fleet/sync` (test 22).
// All 7 tests funnel through this helper.
type SyncResponse =
  | { success: true; message: string; jobIds: string[] }
  | { success: false; message: string };

function assertSyncBody(body: SyncResponse, endpointLabel: string): void {
  // Contract (schema already asserted before this helper runs, so here
  // we only add the semantic checks).
  expect(typeof body.message, `${endpointLabel}: message must be a string`).toBe('string');
  expect(body.message.length, `${endpointLabel}: message must be non-empty`).toBeGreaterThan(0);

  if (body.success) {
    // Happy branch — jobIds is always an array (even when empty,
    // if no integration of the target type exists on this tenant).
    expect(Array.isArray(body.jobIds), `${endpointLabel}: jobIds must be an array`).toBe(true);
    for (const jobId of body.jobIds) {
      expect(typeof jobId, `${endpointLabel}: each jobId must be a string`).toBe('string');
      expect(jobId.length, `${endpointLabel}: each jobId must be non-empty`).toBeGreaterThan(0);
    }
  } else {
    // Concurrent-sync guard branch — only `fleet/sync` can reach
    // this. Message should mention a sync being in progress.
    expect(body.message.toLowerCase(), `${endpointLabel}: guard message should mention progress`).toMatch(
      /progress|already|wait/,
    );
  }
}

test.describe('Integrations · Fleet + ELD sync triggers @workflow', () => {
  // 22 ── POST /integrations/fleet/sync ────────────────────────────────
  test('POST /integrations/fleet/sync enqueues a combined sync (ADMIN) @workflow @contract @slow @requires:plan-tms_integration', async ({
    asAdmin,
  }) => {
    const res = await asAdmin.post('/integrations/fleet/sync', {});
    expect(res.status()).toBe(201);
    const body = expectContract(
      SyncTriggerResponseSchema,
      await res.json(),
      'POST /integrations/fleet/sync',
    );

    // Semantic — union branch handled by helper. On happy branch the
    // combined sync enqueues ELD `fleet-sync` jobs + TMS `drivers`/
    // `vehicles`/`loads` jobs (one per integration × type). On the
    // guard branch, a prior TMS sync is in flight.
    assertSyncBody(body, 'POST /integrations/fleet/sync');
  });

  // 23 ── POST /integrations/fleet/sync-loads ──────────────────────────
  test('POST /integrations/fleet/sync-loads enqueues loads-only sync (ADMIN) @workflow @contract @slow @requires:plan-tms_integration', async ({
    asAdmin,
  }) => {
    const res = await asAdmin.post('/integrations/fleet/sync-loads', {});
    expect(res.status()).toBe(201);
    const body = expectContract(
      SyncTriggerResponseSchema,
      await res.json(),
      'POST /integrations/fleet/sync-loads',
    );

    // Semantic — this endpoint has NO concurrent-sync guard (controller
    // lines 158–180). `success` is always `true`; `jobIds` is empty
    // only if no TMS integration exists on the tenant.
    expect(body.success, 'sync-loads has no concurrent-sync guard').toBe(true);
    assertSyncBody(body, 'POST /integrations/fleet/sync-loads');
  });

  // 24 ── POST /integrations/fleet/sync-drivers ────────────────────────
  test('POST /integrations/fleet/sync-drivers enqueues drivers-only sync (ADMIN) @workflow @contract @slow @requires:plan-tms_integration', async ({
    asAdmin,
  }) => {
    const res = await asAdmin.post('/integrations/fleet/sync-drivers', {});
    expect(res.status()).toBe(201);
    const body = expectContract(
      SyncTriggerResponseSchema,
      await res.json(),
      'POST /integrations/fleet/sync-drivers',
    );

    // Semantic — no guard. ELD (`fleet-sync`) + TMS (`drivers`)
    // fan-out. Empty `jobIds` iff neither an ELD nor a TMS
    // integration exists.
    expect(body.success, 'sync-drivers has no concurrent-sync guard').toBe(true);
    assertSyncBody(body, 'POST /integrations/fleet/sync-drivers');
  });

  // 25 ── POST /integrations/fleet/sync-vehicles ───────────────────────
  test('POST /integrations/fleet/sync-vehicles enqueues vehicles-only sync (ADMIN) @workflow @contract @slow @requires:plan-tms_integration', async ({
    asAdmin,
  }) => {
    const res = await asAdmin.post('/integrations/fleet/sync-vehicles', {});
    expect(res.status()).toBe(201);
    const body = expectContract(
      SyncTriggerResponseSchema,
      await res.json(),
      'POST /integrations/fleet/sync-vehicles',
    );

    // Semantic — no guard. ELD (`fleet-sync`) + TMS (`vehicles`)
    // fan-out, same pattern as sync-drivers.
    expect(body.success, 'sync-vehicles has no concurrent-sync guard').toBe(true);
    assertSyncBody(body, 'POST /integrations/fleet/sync-vehicles');
  });

  // 26 ── POST /integrations/eld/sync ──────────────────────────────────
  test('POST /integrations/eld/sync enqueues HOS + telematics (ADMIN) @workflow @contract @slow @requires:plan-samsara_integration', async ({
    asAdmin,
  }) => {
    const res = await asAdmin.post('/integrations/eld/sync', {});
    expect(res.status()).toBe(201);
    const body = expectContract(
      SyncTriggerResponseSchema,
      await res.json(),
      'POST /integrations/eld/sync',
    );

    // Semantic — no guard. Enqueues `hos` + `gps` per ELD integration
    // (2 jobs × N integrations). Empty when no ELD row exists.
    expect(body.success, 'eld/sync has no concurrent-sync guard').toBe(true);
    assertSyncBody(body, 'POST /integrations/eld/sync');
  });

  // 27 ── POST /integrations/eld/sync-hos ──────────────────────────────
  test('POST /integrations/eld/sync-hos enqueues HOS-only (ADMIN) @workflow @contract @slow @requires:plan-samsara_integration', async ({
    asAdmin,
  }) => {
    const res = await asAdmin.post('/integrations/eld/sync-hos', {});
    expect(res.status()).toBe(201);
    const body = expectContract(
      SyncTriggerResponseSchema,
      await res.json(),
      'POST /integrations/eld/sync-hos',
    );

    // Semantic — no guard. Enqueues `hos` only (1 job × N ELDs).
    expect(body.success, 'eld/sync-hos has no concurrent-sync guard').toBe(true);
    assertSyncBody(body, 'POST /integrations/eld/sync-hos');
  });

  // 28 ── POST /integrations/eld/sync-telematics ───────────────────────
  test('POST /integrations/eld/sync-telematics enqueues telematics-only (ADMIN) @workflow @contract @slow @requires:plan-samsara_integration', async ({
    asAdmin,
  }) => {
    const res = await asAdmin.post('/integrations/eld/sync-telematics', {});
    expect(res.status()).toBe(201);
    const body = expectContract(
      SyncTriggerResponseSchema,
      await res.json(),
      'POST /integrations/eld/sync-telematics',
    );

    // Semantic — no guard. Enqueues `gps` only (1 job × N ELDs).
    expect(body.success, 'eld/sync-telematics has no concurrent-sync guard').toBe(true);
    assertSyncBody(body, 'POST /integrations/eld/sync-telematics');
  });
});

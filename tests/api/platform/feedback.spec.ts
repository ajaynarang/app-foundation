/**
 * Platform — Feedback (Phase 4 Group 4b).
 *
 * Covers 11 endpoints across two controllers:
 *
 *   FeedbackController (authenticated, any tenant user) — 2 endpoints
 *     1. POST /feedback
 *     2. GET  /feedback          — listOwn (caller's own rows)
 *
 *   FeedbackAdminController (SUPER_ADMIN) — 9 endpoints
 *     3. GET   /admin/feedback                   — paginated list
 *     4. GET   /admin/feedback/:id               — row detail
 *     5. PATCH /admin/feedback/:id/status        — transition new→reviewed
 *     6. PATCH /admin/feedback/:id/category      — manual category set
 *     7. PATCH /admin/feedback/:id/resolve       — transition →resolved
 *     8. POST  /admin/feedback/:id/categorize    — AI categorize (@slow)
 *     9. POST  /admin/feedback/bulk-categorize   — AI categorize all (@slow)
 *    10. GET   /admin/feedback/stats             — dashboard counters
 *    11. GET   /admin/feedback/tenants           — tenant summary list
 *
 * Data strategy:
 *   - Every admin-side test self-provisions a fresh feedback row via the
 *     dispatcher POST path inside the test body. No `@requires:data-*` tag
 *     is needed — feedback is a self-service surface and the POST path is
 *     unrestricted (any tenant user can submit).
 *   - Admin mutations (status/category/resolve) are terminal from the
 *     test's point of view — `status: 'resolved'` is a final state, but
 *     the row isn't cleaned up because feedback has no delete endpoint.
 *     Each test creates its own row with a unique marker message, asserts,
 *     then leaves the row in the DB (acceptable: rows accumulate slowly
 *     and are visible in the admin UI as test artefacts, not state leaks).
 *
 * AI endpoint caveat — finding #32 applies to the two AI-gated endpoints
 * below. When the Vercel AI Gateway has insufficient credits, both
 * `/categorize` and `/bulk-categorize` surface upstream as HTTP 500.
 * Those two tests carry `@requires:data-ai-gateway-credits @slow` so they
 * are automatically skipped until credits are topped up.
 *
 * Schema strategy: five hand-written `.strict()` schemas in
 * `packages/test-utils/src/schemas/platform.ts` under `PlatformSchemas.*`.
 * shared-types `FeedbackSchema` drifts from every live shape — see
 * SCHEMA-AUDIT.md Phase-4-Group-4b notes + finding #36.
 */
import { test, expect } from '@sally/test-utils/auth';
import { expectContract, expectArrayContract, PlatformSchemas } from '@sally/test-utils/schemas';
import {
  buildFeedback,
  buildFeedbackStatusUpdate,
  buildFeedbackCategoryUpdate,
  buildFeedbackResolve,
} from '@sally/test-utils/factories';

test.describe('Platform · Feedback · User self-service @workflow', () => {
  // 1 ── POST /feedback ──────────────────────────────────────────────────────
  test('POST /feedback creates a feedback row and returns the Prisma row (DISPATCHER) @workflow @contract @destructive', async ({
    asDispatcher,
  }) => {
    const payload = buildFeedback({ sentiment: 4, page: '/phase-4-b/create' });
    const res = await asDispatcher.post('/feedback', payload);
    expect(res.status()).toBe(201);
    const body = expectContract(PlatformSchemas.FeedbackRowSchema.strict(), await res.json(), 'POST /feedback');

    // Semantic — the row echoes the submitted values, status defaults to
    // 'new', category is null (uncategorized), createdAt == updatedAt on
    // first write.
    expect(body.sentiment).toBe(payload.sentiment);
    expect(body.message).toBe(payload.message);
    expect(body.page).toBe(payload.page);
    expect(body.status).toBe('new');
    expect(body.category).toBeNull();
    expect(body.note).toBeNull();
    expect(body.resolvedBy).toBeNull();
    expect(body.resolvedAt).toBeNull();
    expect(body.createdAt).toBe(body.updatedAt);

    // Persistence — the caller's /feedback list surfaces the new row.
    const listRes = await asDispatcher.get('/feedback');
    expect(listRes.status()).toBe(200);
    const list = expectArrayContract(PlatformSchemas.FeedbackOwnRowSchema.strict(), await listRes.json(), {
      context: 'GET /feedback',
    });
    const found = list.find((row) => row.id === body.id);
    expect(found).toBeDefined();
    expect(found!.message).toBe(payload.message);
  });

  // 2 ── GET /feedback (listOwn) ─────────────────────────────────────────────
  test('GET /feedback returns the caller-owned feedback list (DISPATCHER) @workflow @contract', async ({
    asDispatcher,
  }) => {
    // Seed a row so the list is non-empty for this dispatcher. The listOwn
    // response caps at 100 rows, ordered by createdAt desc — newest first.
    const seedPayload = buildFeedback({
      sentiment: 2,
      page: '/phase-4-b/list-own',
    });
    const seedRes = await asDispatcher.post('/feedback', seedPayload);
    expect(seedRes.status()).toBe(201);
    const seed = expectContract(PlatformSchemas.FeedbackRowSchema.strict(), await seedRes.json());

    const res = await asDispatcher.get('/feedback');
    expect(res.status()).toBe(200);
    const rows = expectArrayContract(PlatformSchemas.FeedbackOwnRowSchema.strict(), await res.json(), {
      context: 'GET /feedback',
    });

    // Semantic — at least one row exists (the seed), list is bounded to
    // 100, and the seed row is first (createdAt desc). Every row has the
    // trimmed projection fields only (enforced by `.strict()`).
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(100);
    expect(rows[0].id).toBe(seed.id);
    expect(rows[0].sentiment).toBe(seedPayload.sentiment);
    expect(rows[0].page).toBe(seedPayload.page);
    expect(rows[0].status).toBe('new');
  });
});

test.describe('Platform · Feedback · Admin @workflow', () => {
  // 3 ── GET /admin/feedback ─────────────────────────────────────────────────
  test('GET /admin/feedback returns the paginated admin list with nested relations (SUPER_ADMIN) @workflow @contract', async ({
    asDispatcher,
    asSuperAdmin,
  }) => {
    // Seed so there's at least one deterministic row to locate.
    const seedPayload = buildFeedback({ page: '/phase-4-b/admin-list' });
    const seedRes = await asDispatcher.post('/feedback', seedPayload);
    expect(seedRes.status()).toBe(201);
    const seed = expectContract(PlatformSchemas.FeedbackRowSchema.strict(), await seedRes.json());

    // Tight pagination so the assertion cost is bounded regardless of
    // accumulated test-run rows.
    const res = await asSuperAdmin.get('/admin/feedback?limit=5&page=1');
    expect(res.status()).toBe(200);
    const body = expectContract(
      PlatformSchemas.FeedbackListEnvelopeSchema.strict(),
      await res.json(),
      'GET /admin/feedback',
    );

    // Semantic — envelope echoes the query. Data is createdAt-desc ordered
    // so the newest row wins; for test correctness we just assert the seed
    // is retrievable via a narrower filter (sentimentMin/Max + page date).
    expect(body.page).toBe(1);
    expect(body.limit).toBe(5);
    expect(body.total).toBeGreaterThan(0);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.length).toBeLessThanOrEqual(5);
    for (const row of body.data) {
      expect(row.tenant.companyName.length).toBeGreaterThan(0);
      expect(row.user.email.length).toBeGreaterThan(0);
    }

    // Filter — the `status=new` filter narrows to the seed row's bucket;
    // the seed MUST be present in the list when filtered by its own status.
    const filteredRes = await asSuperAdmin.get('/admin/feedback?status=new&limit=100');
    expect(filteredRes.status()).toBe(200);
    const filtered = expectContract(PlatformSchemas.FeedbackListEnvelopeSchema.strict(), await filteredRes.json());
    const found = filtered.data.find((row) => row.id === seed.id);
    expect(found).toBeDefined();
    expect(found!.status).toBe('new');
    expect(found!.user.role).toBe('DISPATCHER');
  });

  // 4 ── GET /admin/feedback/:id ─────────────────────────────────────────────
  test('GET /admin/feedback/:id returns a single admin row + 404 on unknown id (SUPER_ADMIN) @workflow @contract', async ({
    asDispatcher,
    asSuperAdmin,
  }) => {
    const seedPayload = buildFeedback({ page: '/phase-4-b/admin-detail' });
    const seedRes = await asDispatcher.post('/feedback', seedPayload);
    expect(seedRes.status()).toBe(201);
    const seed = expectContract(PlatformSchemas.FeedbackRowSchema.strict(), await seedRes.json());

    const res = await asSuperAdmin.get(`/admin/feedback/${seed.id}`);
    expect(res.status()).toBe(200);
    const body = expectContract(
      PlatformSchemas.FeedbackAdminRowSchema.strict(),
      await res.json(),
      `GET /admin/feedback/${seed.id}`,
    );

    // Semantic — the detail row matches the seed, the nested `resolver`
    // is null (row is still 'new'), and `user`/`tenant` are populated.
    expect(body.id).toBe(seed.id);
    expect(body.message).toBe(seedPayload.message);
    expect(body.status).toBe('new');
    expect(body.resolver).toBeNull();
    expect(body.user.id).toBe(seed.userId);
    expect(body.tenant.id).toBe(seed.tenantId);

    // Unknown id → 404 (service throws NotFoundException).
    const missing = await asSuperAdmin.get('/admin/feedback/9999999');
    expect(missing.status()).toBe(404);
  });

  // 5 ── PATCH /admin/feedback/:id/status ────────────────────────────────────
  test('PATCH /admin/feedback/:id/status transitions new→reviewed (SUPER_ADMIN) @workflow @destructive', async ({
    asDispatcher,
    asSuperAdmin,
  }) => {
    const seedRes = await asDispatcher.post('/feedback', buildFeedback({ page: '/phase-4-b/status-transition' }));
    expect(seedRes.status()).toBe(201);
    const seed = expectContract(PlatformSchemas.FeedbackRowSchema.strict(), await seedRes.json());

    const patchPayload = buildFeedbackStatusUpdate({ status: 'reviewed' });
    const res = await asSuperAdmin.patch(`/admin/feedback/${seed.id}/status`, patchPayload);
    expect(res.status()).toBe(200);
    const body = expectContract(
      PlatformSchemas.FeedbackRowSchema.strict(),
      await res.json(),
      `PATCH /admin/feedback/${seed.id}/status`,
    );

    // Semantic — status is reviewed, resolvedBy/resolvedAt still null
    // (reviewed != resolved), updatedAt advanced.
    expect(body.status).toBe('reviewed');
    expect(body.resolvedBy).toBeNull();
    expect(body.resolvedAt).toBeNull();
    expect(Date.parse(body.updatedAt)).toBeGreaterThan(Date.parse(seed.updatedAt));

    // Persistence — detail GET shows the new status.
    const verifyRes = await asSuperAdmin.get(`/admin/feedback/${seed.id}`);
    expect(verifyRes.status()).toBe(200);
    const verify = expectContract(PlatformSchemas.FeedbackAdminRowSchema.strict(), await verifyRes.json());
    expect(verify.status).toBe('reviewed');
  });

  // 6 ── PATCH /admin/feedback/:id/category ──────────────────────────────────
  test('PATCH /admin/feedback/:id/category manually sets the category (SUPER_ADMIN) @workflow @destructive', async ({
    asDispatcher,
    asSuperAdmin,
  }) => {
    const seedRes = await asDispatcher.post('/feedback', buildFeedback({ page: '/phase-4-b/category-manual' }));
    expect(seedRes.status()).toBe(201);
    const seed = expectContract(PlatformSchemas.FeedbackRowSchema.strict(), await seedRes.json());
    expect(seed.category).toBeNull();

    const patchPayload = buildFeedbackCategoryUpdate({ category: 'bug' });
    const res = await asSuperAdmin.patch(`/admin/feedback/${seed.id}/category`, patchPayload);
    expect(res.status()).toBe(200);
    const body = expectContract(
      PlatformSchemas.FeedbackRowSchema.strict(),
      await res.json(),
      `PATCH /admin/feedback/${seed.id}/category`,
    );

    // Semantic — category set to 'bug', other fields untouched.
    expect(body.category).toBe('bug');
    expect(body.status).toBe('new');
    expect(body.message).toBe(seed.message);

    // Persistence.
    const verifyRes = await asSuperAdmin.get(`/admin/feedback/${seed.id}`);
    expect(verifyRes.status()).toBe(200);
    const verify = expectContract(PlatformSchemas.FeedbackAdminRowSchema.strict(), await verifyRes.json());
    expect(verify.category).toBe('bug');
  });

  // 7 ── PATCH /admin/feedback/:id/resolve ───────────────────────────────────
  test('PATCH /admin/feedback/:id/resolve terminally resolves a feedback row (SUPER_ADMIN) @workflow @destructive', async ({
    asDispatcher,
    asSuperAdmin,
  }) => {
    const seedRes = await asDispatcher.post('/feedback', buildFeedback({ page: '/phase-4-b/resolve' }));
    expect(seedRes.status()).toBe(201);
    const seed = expectContract(PlatformSchemas.FeedbackRowSchema.strict(), await seedRes.json());

    const patchPayload = buildFeedbackResolve();
    const res = await asSuperAdmin.patch(`/admin/feedback/${seed.id}/resolve`, patchPayload);
    expect(res.status()).toBe(200);
    const body = expectContract(
      PlatformSchemas.FeedbackRowSchema.strict(),
      await res.json(),
      `PATCH /admin/feedback/${seed.id}/resolve`,
    );

    // Semantic — status resolved, note echoed, resolvedBy is the
    // super-admin's numeric id (non-null), resolvedAt populated, updatedAt
    // advanced past the seed.
    expect(body.status).toBe('resolved');
    expect(body.note).toBe(patchPayload.note);
    expect(body.resolvedBy).not.toBeNull();
    expect(typeof body.resolvedBy).toBe('number');
    expect(body.resolvedAt).not.toBeNull();

    // Persistence — detail GET surfaces the resolver relation.
    const verifyRes = await asSuperAdmin.get(`/admin/feedback/${seed.id}`);
    expect(verifyRes.status()).toBe(200);
    const verify = expectContract(PlatformSchemas.FeedbackAdminRowSchema.strict(), await verifyRes.json());
    expect(verify.status).toBe('resolved');
    expect(verify.resolver).not.toBeNull();
    expect(verify.resolver!.id).toBe(body.resolvedBy!);
  });

  // 8 ── POST /admin/feedback/:id/categorize (AI) ────────────────────────────
  test('POST /admin/feedback/:id/categorize AI-categorizes a single row (SUPER_ADMIN) @workflow @destructive @slow @requires:data-ai-gateway-credits', async ({
    asDispatcher,
    asSuperAdmin,
  }) => {
    test.setTimeout(45000);

    // Use a cue-rich message so the FEEDBACK_CATEGORIZER Mastra prompt
    // has a strong signal to classify. The service falls back to 'general'
    // for ambiguous text, so leaning bug-ward exercises the happy path.
    const seedRes = await asDispatcher.post(
      '/feedback',
      buildFeedback({
        message:
          'The map route page is completely broken — error when I click plan. ' +
          'This looks like a bug in the route planner.',
        page: '/phase-4-b/ai-categorize',
      }),
    );
    expect(seedRes.status()).toBe(201);
    const seed = expectContract(PlatformSchemas.FeedbackRowSchema.strict(), await seedRes.json());
    expect(seed.category).toBeNull();

    const res = await asSuperAdmin.post(`/admin/feedback/${seed.id}/categorize`, {});
    expect(res.status()).toBe(201);
    const body = expectContract(
      PlatformSchemas.FeedbackRowSchema.strict(),
      await res.json(),
      `POST /admin/feedback/${seed.id}/categorize`,
    );

    // Semantic — category is now one of the three valid enum values (the
    // service clamps any out-of-vocab answer to 'general'). We don't
    // assert 'bug' specifically — model determinism isn't guaranteed.
    expect(['bug', 'idea', 'general']).toContain(body.category);

    // Persistence.
    const verifyRes = await asSuperAdmin.get(`/admin/feedback/${seed.id}`);
    expect(verifyRes.status()).toBe(200);
    const verify = expectContract(PlatformSchemas.FeedbackAdminRowSchema.strict(), await verifyRes.json());
    expect(verify.category).toBe(body.category);
  });

  // 9 ── POST /admin/feedback/bulk-categorize (AI) ───────────────────────────
  test('POST /admin/feedback/bulk-categorize AI-categorizes all uncategorized rows (SUPER_ADMIN) @workflow @destructive @slow @requires:data-ai-gateway-credits', async ({
    asDispatcher,
    asSuperAdmin,
  }) => {
    test.setTimeout(60000);

    // Seed a pair of uncategorized rows so we can assert the response
    // envelope. `total` may be higher than 2 if other tests have already
    // queued uncategorized rows — that's fine; we only need the envelope
    // contract + a lower bound.
    const seedA = await asDispatcher.post(
      '/feedback',
      buildFeedback({
        message: 'Dashboard crashes on resize — bug.',
        page: '/phase-4-b/bulk-a',
      }),
    );
    expect(seedA.status()).toBe(201);
    const seedB = await asDispatcher.post(
      '/feedback',
      buildFeedback({
        message: 'Love to see a fuel-price widget — feature idea.',
        page: '/phase-4-b/bulk-b',
      }),
    );
    expect(seedB.status()).toBe(201);
    const seedARow = expectContract(PlatformSchemas.FeedbackRowSchema.strict(), await seedA.json());
    const seedBRow = expectContract(PlatformSchemas.FeedbackRowSchema.strict(), await seedB.json());

    const res = await asSuperAdmin.post('/admin/feedback/bulk-categorize', {});
    expect(res.status()).toBe(201);
    const body = expectContract(
      PlatformSchemas.FeedbackBulkCategorizeSchema.strict(),
      await res.json(),
      'POST /admin/feedback/bulk-categorize',
    );

    // Semantic — envelope has `categorized >= 0`; when `total` is present,
    // it is the count of uncategorized rows found before the loop ran, and
    // categorized <= total (some inferCategory() calls may fail and be
    // logged instead of throwing).
    expect(body.categorized).toBeGreaterThanOrEqual(0);
    if (body.total !== undefined) {
      expect(body.total).toBeGreaterThanOrEqual(body.categorized);
      // We submitted two fresh uncategorized rows moments ago, so the
      // pre-run uncategorized count MUST be >= 2.
      expect(body.total).toBeGreaterThanOrEqual(2);
    }

    // Persistence — at least one of our seeded rows now has a non-null
    // category (the service logs failed inferences but doesn't roll back
    // successful ones; both could fail in unusual infra states, but the
    // happy path categorizes deterministically).
    const verifyA = await asSuperAdmin.get(`/admin/feedback/${seedARow.id}`);
    expect(verifyA.status()).toBe(200);
    const verifyB = await asSuperAdmin.get(`/admin/feedback/${seedBRow.id}`);
    expect(verifyB.status()).toBe(200);
    const rowA = expectContract(PlatformSchemas.FeedbackAdminRowSchema.strict(), await verifyA.json());
    const rowB = expectContract(PlatformSchemas.FeedbackAdminRowSchema.strict(), await verifyB.json());
    const categorizedCount = [rowA.category, rowB.category].filter((c) => c !== null).length;
    expect(categorizedCount).toBeGreaterThanOrEqual(1);
  });

  // 10 ── GET /admin/feedback/stats ──────────────────────────────────────────
  test('GET /admin/feedback/stats returns rolled-up counters (SUPER_ADMIN) @workflow @contract', async ({
    asDispatcher,
    asSuperAdmin,
  }) => {
    // Seed so we know `total >= 1` regardless of DB state.
    const seedRes = await asDispatcher.post(
      '/feedback',
      buildFeedback({ sentiment: 5, page: '/phase-4-b/stats-seed' }),
    );
    expect(seedRes.status()).toBe(201);

    const res = await asSuperAdmin.get('/admin/feedback/stats');
    expect(res.status()).toBe(200);
    const body = expectContract(
      PlatformSchemas.FeedbackStatsSchema.strict(),
      await res.json(),
      'GET /admin/feedback/stats',
    );

    // Semantic — status counters sum to total, every bySentiment bucket
    // carries a 1..5 sentiment + non-negative count, counts match `total`.
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.new + body.reviewed + body.resolved).toBe(body.total);
    const bySentimentSum = body.bySentiment.reduce((acc, bucket) => acc + bucket.count, 0);
    expect(bySentimentSum).toBe(body.total);
    const sentimentsSeen = new Set(body.bySentiment.map((b) => b.sentiment));
    for (const s of sentimentsSeen) {
      expect(s).toBeGreaterThanOrEqual(1);
      expect(s).toBeLessThanOrEqual(5);
    }
  });

  // 11 ── GET /admin/feedback/tenants ────────────────────────────────────────
  test('GET /admin/feedback/tenants lists distinct tenants with submitted feedback (SUPER_ADMIN) @workflow @contract', async ({
    asDispatcher,
    asSuperAdmin,
  }) => {
    // Guarantee the caller's tenant has at least one row.
    const seedRes = await asDispatcher.post('/feedback', buildFeedback({ page: '/phase-4-b/tenants-seed' }));
    expect(seedRes.status()).toBe(201);
    const seed = expectContract(PlatformSchemas.FeedbackRowSchema.strict(), await seedRes.json());

    const res = await asSuperAdmin.get('/admin/feedback/tenants');
    expect(res.status()).toBe(200);
    const rows = expectArrayContract(PlatformSchemas.FeedbackTenantSummarySchema, await res.json(), {
      context: 'GET /admin/feedback/tenants',
    });

    // Semantic — rows are distinct by id (service uses `distinct:
    // ['tenantId']`), and the seeded row's tenant is in the list.
    const ids = new Set(rows.map((r) => r.id));
    expect(ids.size).toBe(rows.length);
    const seenSeedTenant = rows.find((r) => r.id === seed.tenantId);
    expect(seenSeedTenant).toBeDefined();
    expect(seenSeedTenant!.companyName.length).toBeGreaterThan(0);
  });
});

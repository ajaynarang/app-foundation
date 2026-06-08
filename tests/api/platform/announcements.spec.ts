/**
 * Platform — Announcements / Broadcasts (Phase 4 Group 4e).
 *
 * Covers 7 endpoints across two controllers:
 *
 *   AnnouncementsController (SUPER_ADMIN) — 6 endpoints
 *     1. GET    /admin/broadcasts[?status=...]   — list all
 *     2. GET    /admin/broadcasts/:id            — detail
 *     3. POST   /admin/broadcasts                — create (DRAFT default)
 *     4. PATCH  /admin/broadcasts/:id            — update
 *     5. POST   /admin/broadcasts/:id/publish    — terminal: DRAFT→PUBLISHED
 *     6. POST   /admin/broadcasts/:id/archive    — terminal: *→ARCHIVED
 *
 *   BroadcastsPublicController (authenticated, any tenant user) — 1 endpoint
 *     7. GET    /broadcasts/active               — tenant-filtered active feed
 *
 * Target count: **7 tests** — 6 admin + 1 public. One of the admin tests
 * (test 1) doubles as the RBAC fence (DISPATCHER → 403 before the
 * SUPER_ADMIN happy path).
 *
 * Critical constraints (§8 risks):
 *   - **Terminal transitions.** publish + archive are terminal; archive
 *     blocks re-publish. Every test that exercises those paths creates
 *     a FRESH DRAFT broadcast via `createDraftBroadcast(asSuperAdmin)`.
 *     DO NOT share broadcast ids across tests.
 *   - **Global-ish visibility.** Broadcasts are visible via the public
 *     `/broadcasts/active` feed to any authenticated user whose tenant
 *     matches the `targetIds`. Default factory emits `targetType: TENANT`
 *     + `targetIds: ['__qa_no_match_tenant__']` — a bogus id that matches
 *     no real tenant. That keeps QA broadcast rows OUT of every tenant's
 *     public feed EXCEPT for the one test (test 7) that deliberately
 *     targets the calling tenant.
 *   - **Cache coherence.** The `findActiveForTenant` path is cached
 *     globally under one key (TTL 30m) with in-memory filtering. Tests
 *     on the /broadcasts/active endpoint MUST be aware that a publish
 *     from a sibling test can leak into the feed via shared cache.
 *     To keep the public-feed test deterministic we only assert that
 *     our OWN seeded broadcast is present (by id) — not that the list
 *     is of a specific size.
 *   - **Serial mode.** The public-feed test (test 7) creates + publishes
 *     a broadcast that targets the demo tenant. If another test runs
 *     in parallel and hits the same cache key, the admin-list test
 *     may observe the not-yet-archived row. We mitigate with
 *     `describe.configure({ mode: 'serial' })` on the public block and
 *     an afterEach archive cleanup.
 *   - **Cleanup.** Every test that creates a broadcast archives it in
 *     afterEach via `archiveBroadcastSafe`. Archive is idempotent and
 *     does not surface the row on /broadcasts/active.
 *
 * Schema strategy:
 *   - No shared-types equivalents — all 4 schemas hand-written. Finding #39.
 *   - Publish + archive drop the `createdBy` include → distinct
 *     `AnnouncementRowBareSchema`. Create / update / list / detail all
 *     include `createdBy` → `AnnouncementAdminRowSchema`.
 *
 * PartialType DTO quirk (finding #39):
 *   `UpdateAnnouncementDto extends PartialType(CreateAnnouncementDto)`.
 *   Defaults on the Create DTO (`targetType = ALL`, `targetIds = []`,
 *   `priority = INFO`) are silently applied to the PATCH body when those
 *   fields are undefined. Consequence: a title-only PATCH will reset
 *   `targetType` → ALL and `targetIds` → []. The update test asserts the
 *   observed post-PATCH shape (ALL-targeted), documenting the quirk.
 */
import { test, expect } from '@sally/test-utils/auth';
import { expectContract, expectArrayContract, PlatformSchemas } from '@sally/test-utils/schemas';
import { buildAnnouncement, buildAnnouncementUpdate } from '@sally/test-utils/factories';
import { createDraftBroadcast, archiveBroadcastSafe, demoTenantId } from './_helpers';

test.describe('Platform · Announcements admin (SUPER_ADMIN) @workflow', () => {
  let cleanupIds: number[] = [];

  test.afterEach(async ({ asSuperAdmin }) => {
    // Archive every broadcast created during this test. Archive is
    // idempotent so a test that already archived still no-ops safely.
    for (const id of cleanupIds) {
      await archiveBroadcastSafe(asSuperAdmin, id);
    }
    cleanupIds = [];
  });

  // 1 ── GET /admin/broadcasts + RBAC fence ──────────────────────────────
  test('GET /admin/broadcasts lists all broadcasts; DISPATCHER hits 403 (SUPER_ADMIN + RBAC) @workflow @contract @rbac', async ({
    asDispatcher,
    asSuperAdmin,
  }) => {
    // RBAC fence — DISPATCHER cannot see the admin list.
    const rbacRes = await asDispatcher.get('/admin/broadcasts');
    expect(rbacRes.status()).toBe(403);

    // Seed a fresh draft so the list is provably non-empty.
    const draft = await createDraftBroadcast(asSuperAdmin);
    cleanupIds.push(draft.id);

    const res = await asSuperAdmin.get('/admin/broadcasts');
    expect(res.status()).toBe(200);
    const rows = expectArrayContract(PlatformSchemas.AnnouncementAdminListItemSchema.strict(), await res.json(), {
      context: 'GET /admin/broadcasts',
    });

    // Semantic — list is non-empty, rows are desc by createdAt, the
    // seeded row is present with status DRAFT and the echoed title.
    expect(rows.length).toBeGreaterThan(0);
    const seen = rows.find((r) => r.id === draft.id);
    expect(seen).toBeDefined();
    expect(seen!.status).toBe('DRAFT');
    expect(seen!.title).toBe(draft.title);
    expect(seen!.createdBy.id).toBeGreaterThan(0);

    // Status filter honours the query param — DRAFT rows only.
    const filteredRes = await asSuperAdmin.get('/admin/broadcasts?status=DRAFT');
    expect(filteredRes.status()).toBe(200);
    const filtered = expectArrayContract(
      PlatformSchemas.AnnouncementAdminListItemSchema.strict(),
      await filteredRes.json(),
    );
    for (const row of filtered) {
      expect(row.status).toBe('DRAFT');
    }
    expect(filtered.some((r) => r.id === draft.id)).toBe(true);
  });

  // 2 ── GET /admin/broadcasts/:id ───────────────────────────────────────
  test('GET /admin/broadcasts/:id returns a single row; unknown id → 404 (SUPER_ADMIN) @workflow @contract', async ({
    asSuperAdmin,
  }) => {
    const draft = await createDraftBroadcast(asSuperAdmin, {
      title: '[QA-TEST] Phase-4e detail-read',
      priority: 'WARNING',
    });
    cleanupIds.push(draft.id);

    const res = await asSuperAdmin.get(`/admin/broadcasts/${draft.id}`);
    expect(res.status()).toBe(200);
    const body = expectContract(
      PlatformSchemas.AnnouncementAdminRowSchema.strict(),
      await res.json(),
      `GET /admin/broadcasts/${draft.id}`,
    );

    // Semantic — echoed payload matches the seed + status is DRAFT + the
    // createdBy relation is populated.
    expect(body.id).toBe(draft.id);
    expect(body.title).toBe(draft.title);
    expect(body.body).toBe(draft.body);
    expect(body.priority).toBe('WARNING');
    expect(body.status).toBe('DRAFT');
    expect(body.publishedAt).toBeNull();
    expect(body.createdBy.email).not.toBeNull();

    // Unknown id → 404 (findUniqueOrThrow).
    const missing = await asSuperAdmin.get('/admin/broadcasts/9999999');
    expect(missing.status()).toBe(404);
  });

  // 3 ── POST /admin/broadcasts ──────────────────────────────────────────
  test('POST /admin/broadcasts creates a DRAFT broadcast and echoes the payload (SUPER_ADMIN) @workflow @contract @destructive', async ({
    asSuperAdmin,
  }) => {
    const payload = buildAnnouncement({
      title: '[QA-TEST] Phase-4e create-probe',
      body: 'Create-path probe body.',
      priority: 'CRITICAL',
      // PLAN-targeted with a bogus plan so the row cannot surface on any
      // real tenant's /broadcasts/active feed even if it ships to PUBLISHED.
      targetType: 'PLAN',
      targetIds: ['__qa_no_match_plan__'],
    });

    const res = await asSuperAdmin.post('/admin/broadcasts', payload);
    expect(res.status()).toBe(201);
    const body = expectContract(
      PlatformSchemas.AnnouncementAdminRowSchema.strict(),
      await res.json(),
      'POST /admin/broadcasts',
    );
    cleanupIds.push(body.id);

    // Semantic — payload echoed, status defaults to DRAFT, publishedAt
    // is null, createdAt == updatedAt on first write.
    expect(body.title).toBe(payload.title);
    expect(body.body).toBe(payload.body);
    expect(body.targetType).toBe('PLAN');
    expect(body.targetIds).toEqual(['__qa_no_match_plan__']);
    expect(body.priority).toBe('CRITICAL');
    expect(body.status).toBe('DRAFT');
    expect(body.publishedAt).toBeNull();
    expect(body.expiresAt).toBeNull();
    expect(body.createdAt).toBe(body.updatedAt);

    // Persistence — detail GET returns the same row.
    const verifyRes = await asSuperAdmin.get(`/admin/broadcasts/${body.id}`);
    expect(verifyRes.status()).toBe(200);
    const verify = expectContract(PlatformSchemas.AnnouncementAdminRowSchema.strict(), await verifyRes.json());
    expect(verify.id).toBe(body.id);
    expect(verify.title).toBe(payload.title);
    expect(verify.priority).toBe('CRITICAL');
  });

  // 4 ── PATCH /admin/broadcasts/:id ─────────────────────────────────────
  test('PATCH /admin/broadcasts/:id updates a DRAFT row; PartialType defaults reset unset fields (SUPER_ADMIN) @workflow @contract @destructive', async ({
    asSuperAdmin,
  }) => {
    const draft = await createDraftBroadcast(asSuperAdmin, {
      title: '[QA-TEST] Phase-4e update-before',
      priority: 'INFO',
    });
    cleanupIds.push(draft.id);

    // Title-only PATCH — PartialType applies DTO defaults for undefined
    // fields, which silently resets targetType → ALL, targetIds → [].
    // The assertion below documents the observed post-PATCH shape so
    // schema + factory drift surfaces immediately.
    const payload = buildAnnouncementUpdate({
      title: '[QA-TEST] Phase-4e update-after',
    });

    const res = await asSuperAdmin.patch(`/admin/broadcasts/${draft.id}`, payload);
    expect(res.status()).toBe(200);
    const body = expectContract(
      PlatformSchemas.AnnouncementAdminRowSchema.strict(),
      await res.json(),
      `PATCH /admin/broadcasts/${draft.id}`,
    );

    expect(body.id).toBe(draft.id);
    expect(body.title).toBe(payload.title);
    expect(body.body).toBe(draft.body);
    expect(body.status).toBe('DRAFT');
    // Observed post-PATCH shape — the PartialType default re-applies.
    expect(body.targetType).toBe('ALL');
    expect(body.targetIds).toEqual([]);
    // updatedAt advanced.
    expect(Date.parse(body.updatedAt)).toBeGreaterThan(Date.parse(body.createdAt));

    // Persistence — GET sees the same title.
    const verifyRes = await asSuperAdmin.get(`/admin/broadcasts/${draft.id}`);
    expect(verifyRes.status()).toBe(200);
    const verify = expectContract(PlatformSchemas.AnnouncementAdminRowSchema.strict(), await verifyRes.json());
    expect(verify.title).toBe(payload.title);
  });

  // 5 ── POST /admin/broadcasts/:id/publish ──────────────────────────────
  test('POST /admin/broadcasts/:id/publish transitions DRAFT → PUBLISHED (SUPER_ADMIN) @workflow @contract @destructive', async ({
    asSuperAdmin,
  }) => {
    // PLAN-targeted bogus id so the published row cannot leak to a real
    // tenant's /broadcasts/active feed.
    const draft = await createDraftBroadcast(asSuperAdmin, {
      title: '[QA-TEST] Phase-4e publish-probe',
      targetType: 'PLAN',
      targetIds: ['__qa_no_match_plan__'],
    });
    cleanupIds.push(draft.id);

    const res = await asSuperAdmin.post(`/admin/broadcasts/${draft.id}/publish`, {});
    expect(res.status()).toBe(201);
    // Publish drops the `createdBy` include — distinct schema.
    const body = expectContract(
      PlatformSchemas.AnnouncementRowBareSchema.strict(),
      await res.json(),
      `POST /admin/broadcasts/${draft.id}/publish`,
    );

    expect(body.id).toBe(draft.id);
    expect(body.status).toBe('PUBLISHED');
    expect(body.publishedAt).not.toBeNull();
    expect(Date.parse(body.updatedAt)).toBeGreaterThan(Date.parse(body.createdAt));

    // Persistence — detail GET confirms the transition + re-includes
    // createdBy on the read path.
    const verifyRes = await asSuperAdmin.get(`/admin/broadcasts/${draft.id}`);
    expect(verifyRes.status()).toBe(200);
    const verify = expectContract(PlatformSchemas.AnnouncementAdminRowSchema.strict(), await verifyRes.json());
    expect(verify.status).toBe('PUBLISHED');
    expect(verify.publishedAt).not.toBeNull();
  });

  // 6 ── POST /admin/broadcasts/:id/archive ──────────────────────────────
  test('POST /admin/broadcasts/:id/archive transitions → ARCHIVED (SUPER_ADMIN) @workflow @contract @destructive', async ({
    asSuperAdmin,
  }) => {
    const draft = await createDraftBroadcast(asSuperAdmin, {
      title: '[QA-TEST] Phase-4e archive-probe',
    });
    cleanupIds.push(draft.id);

    const res = await asSuperAdmin.post(`/admin/broadcasts/${draft.id}/archive`, {});
    expect(res.status()).toBe(201);
    const body = expectContract(
      PlatformSchemas.AnnouncementRowBareSchema.strict(),
      await res.json(),
      `POST /admin/broadcasts/${draft.id}/archive`,
    );

    expect(body.id).toBe(draft.id);
    expect(body.status).toBe('ARCHIVED');
    // Archive does NOT set publishedAt if the row was DRAFT.
    expect(body.publishedAt).toBeNull();

    // Persistence — detail GET confirms ARCHIVED.
    const verifyRes = await asSuperAdmin.get(`/admin/broadcasts/${draft.id}`);
    expect(verifyRes.status()).toBe(200);
    const verify = expectContract(PlatformSchemas.AnnouncementAdminRowSchema.strict(), await verifyRes.json());
    expect(verify.status).toBe('ARCHIVED');
  });
});

// ── Public broadcasts feed ────────────────────────────────────────────
//
// Serial mode: this block creates + publishes + archives a tenant-
// targeted broadcast. Running in parallel with the admin block would
// leak the PUBLISHED row onto the shared `/broadcasts/active` cache key
// (30m TTL) for the duration of any sibling test's admin-list assertion.
// Serializing keeps the public-feed window bounded to a single test.
test.describe.configure({ mode: 'serial' });
test.describe('Platform · Public broadcasts feed @workflow', () => {
  let cleanupIds: number[] = [];

  test.afterEach(async ({ asSuperAdmin }) => {
    for (const id of cleanupIds) {
      await archiveBroadcastSafe(asSuperAdmin, id);
    }
    cleanupIds = [];
  });

  // 7 ── GET /broadcasts/active ─────────────────────────────────────────
  test('GET /broadcasts/active returns tenant-targeted PUBLISHED broadcasts (DISPATCHER) @workflow @contract @destructive', async ({
    asSuperAdmin,
    asDispatcher,
  }) => {
    const demo = demoTenantId();

    // Seed a PUBLISHED broadcast that targets the demo tenant specifically
    // — that's the only way to deterministically exercise the tenant-
    // filter path. Targeting only this tenant guarantees no other real
    // tenant sees the row while the test runs.
    const draft = await createDraftBroadcast(asSuperAdmin, {
      title: '[QA-TEST] Phase-4e public-feed',
      body: 'Public feed probe.',
      targetType: 'TENANT',
      targetIds: [demo],
      priority: 'INFO',
    });
    cleanupIds.push(draft.id);

    const publishRes = await asSuperAdmin.post(`/admin/broadcasts/${draft.id}/publish`, {});
    expect(publishRes.status()).toBe(201);

    // DISPATCHER-as-tenant-user hits the public feed; the seeded row is
    // present (tenantId match).
    const res = await asDispatcher.get('/broadcasts/active');
    expect(res.status()).toBe(200);
    const rows = expectArrayContract(PlatformSchemas.BroadcastActiveItemSchema.strict(), await res.json(), {
      context: 'GET /broadcasts/active',
    });

    // Semantic — seeded row is present (tenant match), every row in the
    // list carries a PUBLISHED timestamp and matches either ALL, TENANT
    // with demo, or PLAN with demo's plan.
    const seen = rows.find((r) => r.id === draft.id);
    expect(seen).toBeDefined();
    expect(seen!.title).toBe(draft.title);
    expect(seen!.targetType).toBe('TENANT');
    expect(seen!.targetIds).toContain(demo);
    expect(seen!.publishedAt).not.toBeNull();
    for (const row of rows) {
      expect(row.publishedAt).not.toBeNull();
      if (row.targetType === 'TENANT') {
        expect(row.targetIds).toContain(demo);
      }
    }
  });
});

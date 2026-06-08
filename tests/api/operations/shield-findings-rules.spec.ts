/**
 * Operations — Shield findings + custom rules (Phase 3 Group 3d).
 *
 * Covers the 7 non-audit endpoints on `ShieldController`:
 *
 *   1. GET    /shield/findings                    list (filterable)
 *   2. PATCH  /shield/findings/:id/resolve        mark one finding resolved
 *   3. PATCH  /shield/findings/bulk-resolve       mark N findings resolved
 *   4. GET    /shield/rules                       list custom rules
 *   5. POST   /shield/rules                       create custom rule
 *   6. PATCH  /shield/rules/:id                   update
 *   7. DELETE /shield/rules/:id                   delete
 *
 * Findings tests (1-3) run as `asDispatcher` — the controller is class-level
 * gated to DISPATCHER/ADMIN/OWNER and dispatchers can mutate findings. Rules
 * tests (4-7) run as `asAdmin` because rule authoring in production is an
 * admin responsibility (the endpoint accepts any of the three class-level
 * roles; this choice mirrors the real-world flow).
 *
 * Plan gate `@requires:plan-shield` on every test.
 *
 * Data gate: tests 1-3 require a COMPLETED Shield audit with at least one
 * UNRESOLVED finding. `seedShieldAudit()` blocks until an audit completes;
 * the file-local `getUnresolvedFindings()` picks from the result. If the
 * tenant has no findings (cold seed), tests tag `@requires:data-shield-audit`
 * and collection-time exclusion applies.
 *
 * Bulk route shadowing check — PATCH /shield/findings/bulk-resolve:
 * Verified against the controller at shield.controller.ts:222-235 — the
 * bulk-resolve route is declared BEFORE the `:id/resolve` route, so Nest
 * matches it correctly. Live curl confirms HTTP 200 on `{ resolved: N }`.
 * No new finding needed (contrast with finding #31 for alerts, where the
 * single-id route IS declared first and shadows the bulk endpoint).
 *
 * Schema drift — hot-fixed locally (finding #33):
 *   - Shared-types `ShieldFindingSchema` is missing `tenantId`, `resolvedById`,
 *     and `updatedAt` from the real Prisma row. It also declares `source`
 *     as optional but the controller always sets it. Hot-fix:
 *     `LiveShieldFindingSchema` below.
 *   - Shared-types `ShieldCustomRuleSchema` is missing `createdBy: number`
 *     (the user id who created the rule). Hot-fix: `LiveShieldCustomRuleSchema`.
 *
 * Cleanup: test 5 (create) and test 6 (update) both create rules; the test
 * that creates also deletes in the same test (either via test 7's assertion
 * path, or inline afterEach). Test 6 cleans up via afterEach. Test 7 is the
 * natural cleanup for the rule it seeds. Findings are NOT deleted — resolving
 * is a state flip, not a teardown (the audit itself cannot be deleted, so
 * residual resolved findings are expected and bounded).
 */
import { test, expect } from '@sally/test-utils/auth';
import { expectContract, expectArrayContract } from '@sally/test-utils/schemas';
import type { RoleApiClient } from '@sally/test-utils/playwright';
import { buildCustomRulePayload, buildCustomRuleUpdate } from '@sally/test-utils/factories';
import { z } from 'zod';
import { seedShieldAudit, seedCustomRule } from './_shield-helpers.js';

// ── Live ShieldFinding schema (TODO(phase-3-verify) finding #33) ────────────
//
// Controller returns the raw Prisma row from `prisma.shieldFinding.findMany`.
// `source` is always set (RULE by default), `tenantId` / `resolvedById` /
// `updatedAt` are present on every row. `metadata` is nullable JSON.
const LiveShieldFindingSchema = z
  .object({
    id: z.string(),
    auditId: z.string(),
    tenantId: z.number().int(),
    category: z.enum(['HOS', 'DRIVERS', 'VEHICLES', 'LOADS']),
    severity: z.enum(['CRITICAL', 'WARNING', 'INFO', 'PASSED']),
    source: z.enum(['RULE', 'AI', 'CUSTOM']),
    title: z.string(),
    description: z.string(),
    regulation: z.string().nullable(),
    entityType: z.string().nullable(),
    entityId: z.string().nullable(),
    entityName: z.string().nullable(),
    impact: z.string().nullable(),
    recommendation: z.string().nullable(),
    dueDate: z.string().nullable(),
    isResolved: z.boolean(),
    resolvedAt: z.string().nullable(),
    resolvedById: z.number().int().nullable(),
    metadata: z.unknown().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();

// ── Live ShieldCustomRule schema (TODO(phase-3-verify) finding #33) ──────────
//
// Prisma row includes `createdBy: number` (user id) — not declared in
// shared-types' schema. Strict to catch drift early.
const LiveShieldCustomRuleSchema = z
  .object({
    id: z.string(),
    tenantId: z.number().int(),
    rule: z.string(),
    isActive: z.boolean(),
    createdBy: z.number().int(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();

// ── PATCH /shield/findings/bulk-resolve response ─────────────────────────────
const BulkResolveResponseSchema = z.object({ resolved: z.number().int() }).strict();

// ── DELETE /shield/rules/:id response ────────────────────────────────────────
const DeleteRuleResponseSchema = z.object({ deleted: z.literal(true) }).strict();

// ── Spec-local helper: pick N UNRESOLVED findings ────────────────────────────
//
// Tests 2 and 3 need unresolved findings. Helper reads the filtered list and
// throws if fewer than N are available — the calling test is tagged with
// `@requires:data-shield-audit` which excludes it at collection time.
async function getUnresolvedFindings(api: RoleApiClient, limit: number): Promise<string[]> {
  const res = await api.get('/shield/findings?resolved=false');
  expect(res.status()).toBe(200);
  const body = (await res.json()) as unknown;
  const items = Array.isArray(body) ? (body as Array<{ id?: string; isResolved?: boolean }>) : [];
  const ids = items.filter((f) => f.isResolved === false && typeof f.id === 'string').map((f) => f.id as string);
  if (ids.length < limit) {
    throw new Error(
      `getUnresolvedFindings: need ${limit} UNRESOLVED findings, got ${ids.length} — ` +
        `tag test @requires:data-shield-audit`,
    );
  }
  return ids.slice(0, limit);
}

test.describe('Operations · Shield · findings + custom rules @workflow @requires:plan-shield', () => {
  // Track rules created in tests 6 so afterEach can clean them up.
  const createdRuleIds = new Set<string>();

  test.afterEach(async ({ asAdmin }) => {
    for (const ruleId of createdRuleIds) {
      const res = await asAdmin.delete(`/shield/rules/${ruleId}`);
      // 200 on successful delete; 404 is fine (already deleted in test body).
      if (res.status() !== 200 && res.status() !== 404) {
        // eslint-disable-next-line no-console
        console.warn(`afterEach: DELETE /shield/rules/${ruleId} → HTTP ${res.status()}`);
      }
    }
    createdRuleIds.clear();
  });

  // 1 ── GET /shield/findings ─────────────────────────────────────────────────
  test('GET /shield/findings returns a filterable array of findings @workflow @requires:plan-shield @requires:data-shield-audit', async ({
    asDispatcher,
  }) => {
    // Bootstrap — ensure at least one audit has completed so findings exist.
    await seedShieldAudit(asDispatcher);

    const res = await asDispatcher.get('/shield/findings?severity=CRITICAL&resolved=false');
    expect(res.status()).toBe(200);
    const rows = expectArrayContract(LiveShieldFindingSchema, await res.json(), {
      allowEmpty: true,
      context: 'GET /shield/findings',
    });

    // Semantic — every returned row reflects the filters.
    for (const row of rows) {
      expect(row.severity).toBe('CRITICAL');
      expect(row.isResolved).toBe(false);
    }

    // Unfiltered read returns ≥ the filtered count (monotonic).
    const unfilteredRes = await asDispatcher.get('/shield/findings');
    expect(unfilteredRes.status()).toBe(200);
    const unfiltered = expectArrayContract(LiveShieldFindingSchema, await unfilteredRes.json(), {
      allowEmpty: true,
      context: 'GET /shield/findings (unfiltered)',
    });
    expect(unfiltered.length).toBeGreaterThanOrEqual(rows.length);

    // Invalid filter → 400 (controller whitelists enum values explicitly).
    const badRes = await asDispatcher.get('/shield/findings?category=BOGUS');
    expect(badRes.status()).toBe(400);
  });

  // 2 ── PATCH /shield/findings/:id/resolve ───────────────────────────────────
  test('PATCH /shield/findings/:id/resolve flips a finding to isResolved=true @workflow @requires:plan-shield @requires:data-shield-audit @destructive', async ({
    asDispatcher,
  }) => {
    await seedShieldAudit(asDispatcher);
    const [findingId] = await getUnresolvedFindings(asDispatcher, 1);

    const res = await asDispatcher.patch(`/shield/findings/${findingId}/resolve`);
    expect(res.status()).toBe(200);
    const resolved = expectContract(LiveShieldFindingSchema, await res.json(), 'PATCH /shield/findings/:id/resolve');

    // Semantic — isResolved flips true; resolvedAt is a recent ISO timestamp;
    // resolvedById echoes the authenticated user.
    expect(resolved.id).toBe(findingId);
    expect(resolved.isResolved).toBe(true);
    expect(resolved.resolvedAt).not.toBeNull();
    expect(resolved.resolvedById).not.toBeNull();
    const resolvedMs = Date.parse(resolved.resolvedAt ?? '');
    expect(Number.isNaN(resolvedMs)).toBe(false);
    expect(Date.now() - resolvedMs).toBeLessThan(60_000);

    // Persistence — filtering for resolved=true returns the same finding.
    const listRes = await asDispatcher.get(`/shield/findings?resolved=true`);
    expect(listRes.status()).toBe(200);
    const list = expectArrayContract(LiveShieldFindingSchema, await listRes.json(), { allowEmpty: true });
    const match = list.find((f) => f.id === findingId);
    expect(match).toBeDefined();
    expect(match?.isResolved).toBe(true);
  });

  // 3 ── PATCH /shield/findings/bulk-resolve ──────────────────────────────────
  test('PATCH /shield/findings/bulk-resolve resolves every submitted finding @workflow @requires:plan-shield @requires:data-shield-audit @destructive', async ({
    asDispatcher,
  }) => {
    await seedShieldAudit(asDispatcher);
    const findingIds = await getUnresolvedFindings(asDispatcher, 2);

    const res = await asDispatcher.patch('/shield/findings/bulk-resolve', {
      findingIds,
    });
    expect(res.status()).toBe(200);
    const body = expectContract(BulkResolveResponseSchema, await res.json(), 'PATCH /shield/findings/bulk-resolve');

    // Semantic — resolved count matches the batch size (all submitted ids
    // belong to the tenant and were unresolved pre-batch).
    expect(body.resolved).toBe(findingIds.length);

    // Persistence — spot-check one of the submitted ids is now resolved.
    const listRes = await asDispatcher.get(`/shield/findings?resolved=true`);
    expect(listRes.status()).toBe(200);
    const list = expectArrayContract(LiveShieldFindingSchema, await listRes.json(), { allowEmpty: true });
    for (const id of findingIds) {
      const match = list.find((f) => f.id === id);
      expect(match).toBeDefined();
      expect(match?.isResolved).toBe(true);
    }
  });

  // 4 ── GET /shield/rules ────────────────────────────────────────────────────
  test('GET /shield/rules returns a list of custom rules @workflow @requires:plan-shield', async ({ asAdmin }) => {
    // Seed one rule so the array is non-empty; cleaned up in afterEach.
    const seed = await seedCustomRule(asAdmin);
    createdRuleIds.add(seed.ruleId);

    const res = await asAdmin.get('/shield/rules');
    expect(res.status()).toBe(200);
    const rules = expectArrayContract(LiveShieldCustomRuleSchema, await res.json(), {
      allowEmpty: false,
      context: 'GET /shield/rules',
    });

    // Semantic — the seeded rule is present; `isActive` defaults to true on
    // create; `createdBy` echoes the admin's dbId (positive integer).
    const match = rules.find((r) => r.id === seed.ruleId);
    expect(match).toBeDefined();
    expect(match?.isActive).toBe(true);
    expect(match?.createdBy).toBeGreaterThan(0);
  });

  // 5 ── POST /shield/rules ───────────────────────────────────────────────────
  test('POST /shield/rules creates a custom rule with isActive=true @workflow @requires:plan-shield @destructive', async ({
    asAdmin,
  }) => {
    const payload = buildCustomRulePayload();
    const res = await asAdmin.post('/shield/rules', payload);
    expect(res.status()).toBe(201);
    const rule = expectContract(LiveShieldCustomRuleSchema, await res.json(), 'POST /shield/rules');
    createdRuleIds.add(rule.id);

    // Semantic — rule text echoed verbatim; isActive true by default;
    // timestamps present.
    expect(rule.rule).toBe(payload.rule);
    expect(rule.isActive).toBe(true);
    expect(Number.isNaN(Date.parse(rule.createdAt))).toBe(false);

    // Persistence — appears in the list endpoint.
    const listRes = await asAdmin.get('/shield/rules');
    expect(listRes.status()).toBe(200);
    const list = expectArrayContract(LiveShieldCustomRuleSchema, await listRes.json(), { allowEmpty: false });
    expect(list.find((r) => r.id === rule.id)).toBeDefined();
  });

  // 6 ── PATCH /shield/rules/:id ──────────────────────────────────────────────
  test('PATCH /shield/rules/:id toggles isActive and echoes updated row @workflow @requires:plan-shield @destructive', async ({
    asAdmin,
  }) => {
    const seed = await seedCustomRule(asAdmin);
    createdRuleIds.add(seed.ruleId);

    const payload = buildCustomRuleUpdate({ isActive: false });
    const res = await asAdmin.patch(`/shield/rules/${seed.ruleId}`, payload);
    expect(res.status()).toBe(200);
    const updated = expectContract(LiveShieldCustomRuleSchema, await res.json(), 'PATCH /shield/rules/:id');

    // Semantic — isActive flipped; updatedAt advanced past createdAt.
    expect(updated.id).toBe(seed.ruleId);
    expect(updated.isActive).toBe(false);
    expect(Date.parse(updated.updatedAt)).toBeGreaterThanOrEqual(Date.parse(updated.createdAt));

    // Persistence — follow-up GET sees the inactive flag.
    const listRes = await asAdmin.get('/shield/rules');
    expect(listRes.status()).toBe(200);
    const list = expectArrayContract(LiveShieldCustomRuleSchema, await listRes.json(), { allowEmpty: false });
    const match = list.find((r) => r.id === seed.ruleId);
    expect(match).toBeDefined();
    expect(match?.isActive).toBe(false);
  });

  // 7 ── DELETE /shield/rules/:id ─────────────────────────────────────────────
  test('DELETE /shield/rules/:id removes the rule and returns { deleted: true } @workflow @requires:plan-shield @destructive', async ({
    asAdmin,
  }) => {
    const seed = await seedCustomRule(asAdmin);
    // Not added to createdRuleIds — this test IS the cleanup.

    const res = await asAdmin.delete(`/shield/rules/${seed.ruleId}`);
    expect(res.status()).toBe(200);
    const body = expectContract(DeleteRuleResponseSchema, await res.json(), 'DELETE /shield/rules/:id');
    expect(body.deleted).toBe(true);

    // Persistence — subsequent list omits the rule.
    const listRes = await asAdmin.get('/shield/rules');
    expect(listRes.status()).toBe(200);
    const list = expectArrayContract(LiveShieldCustomRuleSchema, await listRes.json(), { allowEmpty: true });
    expect(list.find((r) => r.id === seed.ruleId)).toBeUndefined();

    // Double-delete returns 404 (row no longer exists).
    const missingRes = await asAdmin.delete(`/shield/rules/${seed.ruleId}`);
    expect(missingRes.status()).toBe(404);
  });
});

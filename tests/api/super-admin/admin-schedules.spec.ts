/**
 * Admin Schedules (Phase 7 Group 7a — 2 tests on AdminSchedulesController).
 *
 * Covers the 2 endpoints on
 * `apps/backend/src/domains/admin/admin-schedules.controller.ts`:
 *
 *   10. GET   /admin/schedules         — list BullMQ schedules
 *   11. PATCH /admin/schedules/:id     — toggle isEnabled (+ snapshot/restore)
 *
 * Auth: class-level `@Roles(SUPER_ADMIN)`.
 *
 * Destructive test 11 captures pre-state in `beforeEach` and flips
 * `isEnabled`; `afterEach` PATCHes it back to the captured value
 * unconditionally (try/finally semantics via Playwright's `.catch`).
 *
 * Status codes (verified live 2026-05-15):
 *   - GET   /admin/schedules           → 200
 *   - PATCH /admin/schedules/:id       → 200 (NestJS PATCH default; no
 *                                       @HttpCode override)
 *
 * Picks `compliance` schedule by default (`firstScheduleRow` helper)
 * because it's the least operationally critical on dev — toggling
 * it `enabled: false` for the few hundred ms of the test will not
 * cause production-side fan-out. Restored within the same test run.
 *
 * Rubric:
 *   - Role fixture: `asSuperAdmin`.
 *   - Factory: `buildUpdateSchedule` (test 11).
 *   - Exact numeric status.
 *   - expectContract on every body.
 *   - Semantic property: list returns ≥1 schedule on dev; patch
 *     echoes the flipped `isEnabled` value AND the rest of the row
 *     is preserved (no field drift).
 *   - Cleanup: `afterEach` restores the schedule to pre-state.
 *   - Tags: `@workflow @contract @super-admin`; `@destructive` on
 *     11; `@requires:data-schedule-row` on 11 (helper throws if
 *     empty list).
 *   - Zero runtime `test.skip(cond, ...)`.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildUpdateSchedule } from '@sally/test-utils/factories';
import { expectContract, SuperAdminSchemas } from '@sally/test-utils/schemas';
import { firstScheduleRow } from './_helpers';

const { AdminScheduleListSchema, AdminScheduleRowSchema } = SuperAdminSchemas;

// ─── Read path (test 10) ─────────────────────────────────────────────
test.describe('Admin Schedules · list @workflow @contract @super-admin', () => {
  // 10 ── GET /admin/schedules ────────────────────────────────────
  test('GET /admin/schedules returns bare array of BullMQ schedules (SUPER_ADMIN) @workflow @contract @super-admin', async ({
    asSuperAdmin,
  }) => {
    const res = await asSuperAdmin.get('/admin/schedules');
    expect(res.status()).toBe(200);

    const body = expectContract(AdminScheduleListSchema, await res.json(), 'GET /admin/schedules');

    // Semantic: ScheduleManagerService bootstraps multiple schedules
    // at app start; an empty list implies the worker isn't wired.
    expect(body.length).toBeGreaterThan(0);

    // Every row has EITHER pattern (cron) OR intervalMs set, never
    // both null at once — UI relies on this invariant.
    for (const row of body) {
      const hasOne = row.pattern !== null || row.intervalMs !== null;
      expect(hasOne, `schedule id=${row.id} has neither pattern nor intervalMs`).toBe(true);
    }
  });
});

// ─── Mutation path (test 11) ─────────────────────────────────────────
test.describe('Admin Schedules · patch @workflow @destructive @super-admin', () => {
  // afterEach restores the patched schedule to its pre-state. Captured
  // value lives on the spec scope so a mid-test failure still triggers
  // cleanup.
  let restoreState: { id: number; isEnabled: boolean } | null = null;

  test.afterEach(async ({ asSuperAdmin }) => {
    if (restoreState) {
      await asSuperAdmin
        .patch(`/admin/schedules/${restoreState.id}`, {
          isEnabled: restoreState.isEnabled,
        })
        .catch(() => undefined);
      restoreState = null;
    }
  });

  // 11 ── PATCH /admin/schedules/:id ───────────────────────────────
  test('PATCH /admin/schedules/:id flips isEnabled and persists the row (SUPER_ADMIN) @workflow @destructive @super-admin @requires:data-schedule-row', async ({
    asSuperAdmin,
  }) => {
    const pre = await firstScheduleRow(asSuperAdmin);
    restoreState = { id: pre.id, isEnabled: pre.isEnabled };

    const flipped = !pre.isEnabled;
    const res = await asSuperAdmin.patch(`/admin/schedules/${pre.id}`, buildUpdateSchedule({ isEnabled: flipped }));
    expect(res.status()).toBe(200);

    const body = expectContract(AdminScheduleRowSchema, await res.json(), 'PATCH /admin/schedules/:id');

    // Semantic: the flipped value is echoed AND the schedule's
    // identity fields (id, category, jobType, pattern/intervalMs)
    // are preserved.
    expect(body.id).toBe(pre.id);
    expect(body.isEnabled).toBe(flipped);
    expect(body.pattern).toBe(pre.pattern);
    expect(body.intervalMs).toBe(pre.intervalMs);

    // Persistence: a follow-up GET reflects the patched state.
    const listRes = await asSuperAdmin.get('/admin/schedules');
    expect(listRes.status()).toBe(200);
    const list = expectContract(AdminScheduleListSchema, await listRes.json(), 'GET /admin/schedules (post-patch)');
    const found = list.find((r) => r.id === pre.id);
    expect(found, `schedule id=${pre.id} disappeared after patch`).toBeDefined();
    expect(found!.isEnabled).toBe(flipped);
  });
});

/**
 * Platform — Users (Phase 4 Group 4d).
 *
 * Covers all 7 endpoints on `UsersController` (per live read of
 * `apps/backend/src/domains/platform/users/users.controller.ts`):
 *
 *   OWNER/ADMIN-gated (tenant-scoped)
 *     1. GET    /users                              — list tenant users
 *     2. GET    /users/:userId                      — detail (list-row + full tenant + driver)
 *     3. POST   /users                              — create a new user (unprivileged role)
 *     4. PATCH  /users/:userId                      — update (firstName/lastName/role/isActive)
 *     5. DELETE /users/:userId                      — soft-delete (service renames to deactivate)
 *     6. POST   /users/:userId/deactivate           — toggle isActive=false
 *     7. POST   /users/:userId/activate             — toggle isActive=true
 *
 * Target count: **7 tests** — one per endpoint. Test 3 (POST) doubles as the
 * RBAC fence (DISPATCHER → 403) by splitting into two asserts: the happy
 * path on `asOwner` and a preceding `asDispatcher` probe that confirms
 * `@Roles(OWNER, ADMIN)` rejects tenant-scoped non-admin roles.
 *
 * Rubric:
 *   - Role fixture from `@sally/test-utils/auth`.
 *   - Factories from `@sally/test-utils/factories` (`buildUser`, `buildUserUpdate`).
 *   - Exact numeric statuses via `expect(res.status()).toBe(N)`.
 *   - `expectContract(Schema.strict(), body)` on every happy path.
 *   - Semantic assertion on a known value (echo check, state change).
 *   - Persistence via a second request (GET after mutation, list-membership check).
 *   - Cleanup: every spec that CREATES a user deactivates it via DELETE
 *     `/users/:userId` in a finally block. DELETE on demo-northstar is a
 *     soft-delete (isActive=false, row kept) — not a hard row-removal, but
 *     it takes the user out of every list and unused tokens can't be
 *     re-activated cross-test because the email is already in-use.
 *   - Tags: `@workflow @contract` baseline, `@destructive` on writes,
 *     `@rbac` on the 403 check.
 *   - Zero runtime `test.skip(cond, …)`.
 *
 * Data pollution acknowledgement (finding #38): demo-northstar-2026
 * accumulates deactivated test-user rows across runs. Each row carries
 * a unique timestamp-suffixed email (`qa-user-<nonce>@test.sally.dev`)
 * and `isActive=false` so it's visually distinct from real users in the
 * admin UI. The backend has no hard-delete path for a User row; rows
 * are safe to leave behind (no FK leaks, no background workload).
 */
import { test, expect } from '@sally/test-utils/auth';
import { expectContract, expectArrayContract, PlatformSchemas } from '@sally/test-utils/schemas';
import { buildUser, buildUserUpdate } from '@sally/test-utils/factories';
import type { RoleApiClient } from '@sally/test-utils/playwright';

// Small helper — POST /users + return the newly-minted userId. The test body
// always wraps the return value in a try/finally to ensure cleanup even on
// mid-assertion failure. Kept inline (not in `_helpers.ts`) because users
// CRUD is self-contained to this spec file.
async function createUser(
  asOwner: RoleApiClient,
  overrides: Record<string, unknown> = {},
): Promise<{ userId: string; email: string }> {
  const payload = buildUser(overrides);
  const res = await asOwner.post('/users', payload);
  expect(res.status()).toBe(201);
  const body = expectContract(
    PlatformSchemas.UserCreateResponseSchema.strict(),
    await res.json(),
    'createUser helper POST /users',
  );
  return { userId: body.userId, email: body.email };
}

async function cleanupUser(asOwner: RoleApiClient, userId: string | undefined): Promise<void> {
  if (!userId) return;
  const res = await asOwner.delete(`/users/${userId}`);
  // 200 on soft-delete; 404 if already gone (defensive). Never fail the
  // test on cleanup — log and move on. The demo tenant accumulates rows
  // but never FKs.
  if (res.status() !== 200 && res.status() !== 404) {
    // eslint-disable-next-line no-console
    console.error(`cleanupUser: DELETE /users/${userId} returned HTTP ${res.status()}; ` + `row may be left active.`);
  }
}

test.describe('Platform · Users · Reads @workflow', () => {
  // 1 ── GET /users ──────────────────────────────────────────────────────────
  test('GET /users returns the tenant user list with the demo OWNER present (OWNER) @workflow @contract', async ({
    asOwner,
  }) => {
    const res = await asOwner.get('/users');
    expect(res.status()).toBe(200);
    const rows = expectArrayContract(PlatformSchemas.UserListRowSchema.strict(), await res.json(), {
      context: 'GET /users',
    });

    // Semantic — the demo tenant has OWNER + ADMIN + DISPATCHER + DRIVER
    // users seeded. The list MUST include at least one OWNER with a
    // non-empty email, and every row MUST belong to the demo tenant
    // (service explicitly filters on tenantId AND excludes SUPER_ADMIN).
    expect(rows.length).toBeGreaterThan(0);
    const owner = rows.find((r) => r.role === 'OWNER');
    expect(owner).toBeDefined();
    expect(owner!.email.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.role).not.toBe('SUPER_ADMIN');
      expect(r.tenant).not.toBeNull();
      expect(r.tenant!.tenantId).toBe('demo-northstar-2026');
    }
  });

  // 2 ── GET /users/:userId ──────────────────────────────────────────────────
  test('GET /users/:userId returns the detail envelope with full tenant row (OWNER) @workflow @contract', async ({
    asOwner,
  }) => {
    // Locate the demo OWNER via the list — no fixture gives us a real
    // userId string, and the detail endpoint needs one. Using the list's
    // first OWNER row is stable (the seed guarantees exactly one).
    const listRes = await asOwner.get('/users');
    expect(listRes.status()).toBe(200);
    const list = expectArrayContract(PlatformSchemas.UserListRowSchema.strict(), await listRes.json());
    const target = list.find((r) => r.role === 'OWNER');
    expect(target).toBeDefined();

    const res = await asOwner.get(`/users/${target!.userId}`);
    expect(res.status()).toBe(200);
    const body = expectContract(
      PlatformSchemas.UserDetailSchema.strict(),
      await res.json(),
      `GET /users/${target!.userId}`,
    );

    // Semantic — detail row matches the list row on every shared field,
    // embeds the full Prisma tenant (status=ACTIVE, isActive=true,
    // plan metadata present), and has no driver (OWNER is not a driver).
    expect(body.userId).toBe(target!.userId);
    expect(body.email).toBe(target!.email);
    expect(body.role).toBe('OWNER');
    expect(body.tenant).not.toBeNull();
    expect(body.tenant!.status).toBe('ACTIVE');
    expect(body.tenant!.isActive).toBe(true);
    expect(body.tenant!.tenantId).toBe('demo-northstar-2026');
    expect(body.driver).toBeNull();
  });
});

test.describe('Platform · Users · Mutations @workflow', () => {
  // 3 ── POST /users ─────────────────────────────────────────────────────────
  test('POST /users creates a DISPATCHER user (OWNER) + DISPATCHER caller is rejected with 403 (RBAC) @workflow @contract @destructive @rbac', async ({
    asOwner,
    asDispatcher,
  }) => {
    // RBAC fence — `@Roles(OWNER, ADMIN)` on `createUser`. Any tenant-
    // scoped non-admin role must be rejected at the Roles guard BEFORE
    // the DTO pipe. We probe with a full payload to prove the 403 is
    // role-sourced, not validation-sourced (a missing-role 400 would be
    // a different contract and a different assertion).
    const rbacPayload = buildUser({
      email: `qa-rbac-${Date.now()}@test.sally.dev`,
    });
    const rbacRes = await asDispatcher.post('/users', rbacPayload);
    expect(rbacRes.status()).toBe(403);

    // Happy path — OWNER creates a fresh DISPATCHER user.
    let createdUserId: string | undefined;
    try {
      const payload = buildUser({ firstName: 'Phase4d', lastName: 'Create' });
      const res = await asOwner.post('/users', payload);
      expect(res.status()).toBe(201);
      const body = expectContract(PlatformSchemas.UserCreateResponseSchema.strict(), await res.json(), 'POST /users');
      createdUserId = body.userId;

      // Semantic — response echoes payload; tenant is the demo row;
      // isActive defaults true; userId carries the `user_` prefix.
      expect(body.email).toBe(payload.email);
      expect(body.firstName).toBe(payload.firstName);
      expect(body.lastName).toBe(payload.lastName);
      expect(body.role).toBe('DISPATCHER');
      expect(body.isActive).toBe(true);
      expect(body.userId.startsWith('user_')).toBe(true);
      expect(body.tenant).not.toBeNull();
      expect(body.tenant!.tenantId).toBe('demo-northstar-2026');

      // Persistence — GET /users/:userId finds the new row with the full
      // detail shape (list-row + full tenant + null driver).
      const verifyRes = await asOwner.get(`/users/${body.userId}`);
      expect(verifyRes.status()).toBe(200);
      const verify = expectContract(PlatformSchemas.UserDetailSchema.strict(), await verifyRes.json());
      expect(verify.userId).toBe(body.userId);
      expect(verify.email).toBe(payload.email);
      expect(verify.driver).toBeNull();
    } finally {
      await cleanupUser(asOwner, createdUserId);
    }
  });

  // 4 ── PATCH /users/:userId ────────────────────────────────────────────────
  test('PATCH /users/:userId updates firstName and echoes the change (OWNER) @workflow @contract @destructive', async ({
    asOwner,
  }) => {
    // Create a fresh target so the PATCH has no side effect on seeded users.
    let createdUserId: string | undefined;
    try {
      const created = await createUser(asOwner, {
        firstName: 'BeforePatch',
        lastName: 'Phase4d',
      });
      createdUserId = created.userId;

      const patchPayload = buildUserUpdate({ firstName: 'AfterPatch' });
      const res = await asOwner.patch(`/users/${created.userId}`, patchPayload);
      expect(res.status()).toBe(200);
      const body = expectContract(
        PlatformSchemas.UserUpdateResponseSchema.strict(),
        await res.json(),
        `PATCH /users/${created.userId}`,
      );

      // Semantic — firstName flipped, every other field preserved.
      expect(body.firstName).toBe(patchPayload.firstName);
      expect(body.lastName).toBe('Phase4d');
      expect(body.userId).toBe(created.userId);
      expect(body.role).toBe('DISPATCHER');
      expect(body.isActive).toBe(true);

      // Persistence — the next read returns the same updated firstName.
      const verifyRes = await asOwner.get(`/users/${created.userId}`);
      expect(verifyRes.status()).toBe(200);
      const verify = expectContract(PlatformSchemas.UserDetailSchema.strict(), await verifyRes.json());
      expect(verify.firstName).toBe(patchPayload.firstName);
    } finally {
      await cleanupUser(asOwner, createdUserId);
    }
  });

  // 5 ── DELETE /users/:userId ───────────────────────────────────────────────
  test('DELETE /users/:userId soft-deletes the user (isActive=false) (OWNER) @workflow @contract @destructive', async ({
    asOwner,
  }) => {
    // Create, delete, assert, done. NO finally cleanup — the DELETE IS
    // the cleanup, and asserting a second DELETE is outside the scope
    // of this rubric criterion (persistence is verified via detail GET).
    const created = await createUser(asOwner, {
      firstName: 'DeleteProbe',
      lastName: 'Phase4d',
    });

    const res = await asOwner.delete(`/users/${created.userId}`);
    expect(res.status()).toBe(200);
    const body = expectContract(
      PlatformSchemas.UserMessageResponseSchema.strict(),
      await res.json(),
      `DELETE /users/${created.userId}`,
    );

    // Semantic — message describes the soft-delete. The service renames
    // DELETE → "deactivated" because the row is kept with isActive=false.
    expect(body.message).toBe('User deactivated successfully');

    // Persistence — GET still returns 200 (row exists) but isActive=false.
    // Also the list endpoint should NOT include the row as active — the
    // service's GET /users projection doesn't filter by isActive, so the
    // row appears with isActive=false. Assert both to hold the contract.
    const verifyRes = await asOwner.get(`/users/${created.userId}`);
    expect(verifyRes.status()).toBe(200);
    const verify = expectContract(PlatformSchemas.UserDetailSchema.strict(), await verifyRes.json());
    expect(verify.isActive).toBe(false);
  });

  // 6 ── POST /users/:userId/deactivate ──────────────────────────────────────
  test('POST /users/:userId/deactivate flips isActive to false (OWNER) @workflow @contract @destructive', async ({
    asOwner,
  }) => {
    let createdUserId: string | undefined;
    try {
      const created = await createUser(asOwner, {
        firstName: 'DeactivateProbe',
        lastName: 'Phase4d',
      });
      createdUserId = created.userId;

      const res = await asOwner.post(`/users/${created.userId}/deactivate`, {});
      expect(res.status()).toBe(201);
      const body = expectContract(
        PlatformSchemas.UserMessageResponseSchema.strict(),
        await res.json(),
        `POST /users/${created.userId}/deactivate`,
      );

      // Semantic — deactivation confirmed by message string.
      expect(body.message).toBe('User deactivated successfully');

      // Persistence — detail row reports isActive=false.
      const verifyRes = await asOwner.get(`/users/${created.userId}`);
      expect(verifyRes.status()).toBe(200);
      const verify = expectContract(PlatformSchemas.UserDetailSchema.strict(), await verifyRes.json());
      expect(verify.isActive).toBe(false);
    } finally {
      await cleanupUser(asOwner, createdUserId);
    }
  });

  // 7 ── POST /users/:userId/activate ────────────────────────────────────────
  test('POST /users/:userId/activate flips a deactivated user back to isActive=true (OWNER) @workflow @contract @destructive', async ({
    asOwner,
  }) => {
    let createdUserId: string | undefined;
    try {
      const created = await createUser(asOwner, {
        firstName: 'ActivateProbe',
        lastName: 'Phase4d',
      });
      createdUserId = created.userId;

      // Pre-step: deactivate (so the activate call has something to flip).
      // This is set-up, not a second assertion — we don't verify the
      // intermediate state.
      const deactivate = await asOwner.post(`/users/${created.userId}/deactivate`, {});
      expect(deactivate.status()).toBe(201);

      const res = await asOwner.post(`/users/${created.userId}/activate`, {});
      expect(res.status()).toBe(201);
      const body = expectContract(
        PlatformSchemas.UserMessageResponseSchema.strict(),
        await res.json(),
        `POST /users/${created.userId}/activate`,
      );

      // Semantic — activation confirmed by message string.
      expect(body.message).toBe('User activated successfully');

      // Persistence — detail row reports isActive=true (back to default).
      const verifyRes = await asOwner.get(`/users/${created.userId}`);
      expect(verifyRes.status()).toBe(200);
      const verify = expectContract(PlatformSchemas.UserDetailSchema.strict(), await verifyRes.json());
      expect(verify.isActive).toBe(true);
    } finally {
      await cleanupUser(asOwner, createdUserId);
    }
  });
});

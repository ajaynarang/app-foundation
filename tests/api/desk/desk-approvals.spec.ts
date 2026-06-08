/**
 * Desk Approvals (Phase 6 Group 6e — 3 tests on ApprovalController).
 *
 * Covers the 3 endpoints on
 * `apps/backend/src/domains/desk/core/approval/approval.controller.ts`:
 *
 *    33. GET  /desk/approvals          — pending queue (list)
 *    34. POST /desk/approvals/:id/claim   — first-write-wins claim
 *    35. POST /desk/approvals/:id/decide  — APPROVE / EDIT / REJECT
 *
 * Auth: `@Roles(DISPATCHER, ADMIN, OWNER, SUPER_ADMIN)` at the class
 * level — `asDispatcher` is the canonical happy-path role.
 *
 * Spec topology — two describe blocks:
 *   1. Read path (test 33) — parallel-safe, no data dependency. The
 *      list endpoint returns a bare array (NOT `{rows}` envelope) on
 *      live demo (verified 2026-04-27); empty array is valid.
 *   2. Mutations (tests 34 + 35) — SERIAL on a single bootstrapped
 *      approval row. Test 34's `claim` mutates state that test 35's
 *      `decide` reads (the claimedByUserId guard, decide service line
 *      113-115 — only the claimant can decide a claimed row). Sharing
 *      the same row keeps the test deterministic when only one
 *      pending approval is seeded on the tenant. Both tests carry
 *      `@requires:data-desk-approval` so they collection-exclude when
 *      no pending row exists (the demo norm — the ar_followup
 *      workflow auto-decides under SUPERVISED trust).
 *
 * Status codes (verified live):
 *   - GET /desk/approvals             → 200 (NestJS GET default)
 *   - POST /desk/approvals/:id/claim  → 200 (explicit @HttpCode(200))
 *   - POST /desk/approvals/:id/decide → 200 (explicit @HttpCode(200))
 *
 * Persistence:
 *   - Test 34: `claimedByUserId` is a positive integer (proves a real
 *     user claimed it). `claimedAt` is now non-null. The exact dbId is
 *     not exposed via the test fixtures (DevUser carries the string
 *     `userId` — `user_xxx` — not the numeric `dbId` on the User
 *     table). Schema-level type enforcement (`z.number().int().positive()`)
 *     covers the precision gap.
 *   - Test 35: `decision` is the literal sent (default 'APPROVED'),
 *     `decidedByUserId` is a positive integer AND matches the value
 *     that test 34 wrote to `claimedByUserId` (only the claimant can
 *     decide — service line 113-115). `decidedAt` is non-null.
 *     Persistence is verified by the response shape itself (Prisma
 *     `update` returns the post-update row); the decided row drops
 *     out of the `decision: null` queue filter so a follow-up GET on
 *     the queue list can't re-fetch it.
 *
 * Rubric (per tests/README.md):
 *   - Role fixture: `asDispatcher`.
 *   - Factories: `buildDeskApprovalDecide` (test 35).
 *   - Exact numeric status. NestJS POST default = 201, but BOTH
 *     mutation endpoints carry explicit @HttpCode(200) decorators.
 *   - expectContract on every happy path.
 *   - Semantic property + state-change assertion on every test.
 *   - Tags: `@workflow @contract @desk` baseline; `@destructive` on
 *     34, 35; `@requires:data-desk-approval` on 34, 35.
 *   - Zero runtime `test.skip(cond, ...)`.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildDeskApprovalDecide } from '@sally/test-utils/factories';
import { expectContract, DeskSchemas } from '@sally/test-utils/schemas';
import { firstPendingApproval } from './_helpers';

const { DeskApprovalRowSchema, DeskApprovalListSchema } = DeskSchemas;

// ─── Read path (test 33) ─────────────────────────────────────────────
test.describe('Desk Approvals · queue list @workflow @contract @desk', () => {
  // 33 ── GET /desk/approvals ───────────────────────────────────────
  test('GET /desk/approvals returns the pending queue (DISPATCHER) @workflow @contract @desk', async ({
    asDispatcher,
  }) => {
    // ?limit=5 — controller line 39 clamps 1..100 (default 50). The
    // bare-array return preserves order: oldest-first by `requestedAt`
    // (service line 202).
    const res = await asDispatcher.get('/desk/approvals?limit=5');
    expect(res.status()).toBe(200);

    const body = expectContract(DeskApprovalListSchema, await res.json(), 'GET /desk/approvals');

    // Semantic — the response is a bare array (NOT envelope-wrapped),
    // every row has the canonical 4-key episode meta block, and every
    // row's `decision` is null (the WHERE filter). MAY be empty when
    // no `ar_followup` runs have gated for approval.
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeLessThanOrEqual(5);
    for (const row of body) {
      expect(row.decision).toBeNull();
      expect(row.episode.id).toBe(row.episodeId);
      expect(row.episode.responsibility.key.length).toBeGreaterThan(0);
    }
  });
});

// ─── Mutations (tests 34 + 35) ───────────────────────────────────────
//
// SERIAL: test 34 claims the bootstrapped approval; test 35 decides
// the SAME row (only the claimant may decide — see decide service line
// 113-115). Both bootstrap from `firstPendingApproval` but the second
// re-fetch could return a DIFFERENT row if the queue grows mid-run —
// to keep the chain deterministic, test 34 stashes the `id` in the
// describe-scoped variable and test 35 reuses it without re-bootstrapping.
test.describe('Desk Approvals · claim + decide @workflow @destructive @desk', () => {
  test.describe.configure({ mode: 'serial' });

  let approvalId: string | undefined;
  // Captured from test 34's response (the dbId that claimed the row);
  // test 35 asserts the same dbId appears on `decidedByUserId`.
  let claimedDbId: number | undefined;

  // 34 ── POST /desk/approvals/:id/claim ─────────────────────────────
  //
  // Explicit @HttpCode(200) — NestJS default for POST is 201, but
  // approval.controller.ts line 44 overrides. Service `claim()` returns
  // the post-update Prisma row (no include — bare row shape, matches
  // DeskApprovalRowSchema).
  //
  // The claim is first-write-wins via `updateMany` with a
  // `claimedByUserId IS NULL` predicate. A second claim by another
  // user returns 409 — out of scope for this test.
  test('POST /desk/approvals/:id/claim claims a pending approval (DISPATCHER) @workflow @destructive @desk @requires:data-desk-approval', async ({
    asDispatcher,
  }) => {
    const bootstrap = await firstPendingApproval(asDispatcher);
    approvalId = bootstrap.id;

    const res = await asDispatcher.post(`/desk/approvals/${approvalId}/claim`, {});
    expect(res.status()).toBe(200);

    const body = expectContract(
      DeskApprovalRowSchema,
      await res.json(),
      `POST /desk/approvals/${approvalId}/claim`,
    );

    // Semantic — id echoes; `claimedByUserId` is now a positive integer
    // (the claimant's User.id — service line 71 writes `user.id` from
    // `@CurrentUser()`); `claimedAt` is non-null; `decision` is still
    // null (claim does not decide). Stash the dbId for test 35 to
    // re-assert in the decide response.
    expect(body.id).toBe(approvalId);
    expect(body.claimedByUserId).not.toBeNull();
    expect(body.claimedByUserId).toBeGreaterThan(0);
    expect(body.claimedAt).not.toBeNull();
    expect(body.decision).toBeNull();

    claimedDbId = body.claimedByUserId!;
  });

  // 35 ── POST /desk/approvals/:id/decide ────────────────────────────
  //
  // Default decide payload approves cleanly — no editedAction or
  // rejectionReason needed. Service `decide()` line 128-138 issues a
  // bare `prisma.deskApproval.update(...)` and returns the post-update
  // row — same DeskApprovalRowSchema shape as claim.
  //
  // Persistence — the response IS the post-update Prisma row (no
  // re-fetch needed). The decision is permanent (cannot decide again —
  // service line 110-112 throws ConflictException 'already decided').
  test('POST /desk/approvals/:id/decide records the decision (DISPATCHER) @workflow @destructive @desk @requires:data-desk-approval', async ({
    asDispatcher,
  }) => {
    expect(approvalId, 'test 34 must run first to bootstrap the approval id').toBeDefined();
    expect(claimedDbId, 'test 34 must run first to capture the claimed dbId').toBeDefined();
    const id = approvalId!;

    const decision = 'APPROVED' as const;
    const res = await asDispatcher.post(
      `/desk/approvals/${id}/decide`,
      buildDeskApprovalDecide({ decision }),
    );
    expect(res.status()).toBe(200);

    const body = expectContract(
      DeskApprovalRowSchema,
      await res.json(),
      `POST /desk/approvals/${id}/decide`,
    );

    // Semantic — id echoes; decision matches the literal sent;
    // decidedByUserId matches the dbId that claimed the row in test 34
    // (only the claimant can decide — service line 113-115); decidedAt
    // is non-null; claimedByUserId still matches (claim persists across
    // decide); terminate=false default → terminateEpisode is false.
    expect(body.id).toBe(id);
    expect(body.decision).toBe(decision);
    expect(body.decidedByUserId).toBe(claimedDbId);
    expect(body.decidedAt).not.toBeNull();
    expect(body.claimedByUserId).toBe(claimedDbId);
    expect(body.terminateEpisode).toBe(false);
  });
});

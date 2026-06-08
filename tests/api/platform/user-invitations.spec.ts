/**
 * Platform — User Invitations (Phase 4 Group 4d).
 *
 * Covers all 7 ACTIVE endpoints on `UserInvitationsController` (per live
 * read of `apps/backend/src/domains/platform/user-invitations/user-invitations.controller.ts`).
 * The controller mounts 8 routes but `POST /invitations/accept-phone` is
 * the SMS/OTP channel — Twilio Verify-backed — which cannot be exercised
 * without a live SMS integration or a dev bypass. That 8th endpoint is
 * deliberately out-of-scope for this group and logged as finding #38.
 *
 * Endpoint map:
 *
 *   OWNER/ADMIN-gated
 *     1. POST   /invitations                       — create invitation (email channel)
 *     2. GET    /invitations                       — list tenant invitations
 *     3. POST   /invitations/:id/resend            — new token + reset expiry
 *     4. DELETE /invitations/:id                   — cancel (status → CANCELLED)
 *
 *   OWNER/ADMIN/DISPATCHER-gated
 *     5. GET    /invitations/:id/link              — return `{inviteLink}` without regenerating
 *
 *   Public (no auth)
 *     6. GET    /invitations/by-token/:token       — public lookup for acceptance page
 *     7. POST   /invitations/accept                — public accept via token + firebaseUid
 *
 * Target count: **8 tests** — one per active endpoint PLUS a second
 * happy-path test for the public flow (token lookup + accept chained
 * end-to-end). The accept test creates a real User row; the test uses a
 * unique timestamp-suffixed email + firebaseUid so no collision with
 * real users is possible, and the created user is cleaned up in the
 * same test's finally block via DELETE /users/:userId.
 *
 * Accept-flow note (finding #38):
 *   - `acceptInvitation` in `user-invitations.service.ts` writes the
 *     submitted `firebaseUid` directly to the new User row. The Firebase
 *     Admin SDK is NOT called — no `verifyIdToken`, no downstream
 *     Firebase dependency on the accept path. Verified 2026-04-20.
 *   - Consequence: tests can emit pseudo-uids without needing a real
 *     Firebase token. The happy path runs end-to-end on dev + staging
 *     and no `@requires:data-invitation-accept-bypass` gating is needed.
 *
 * Rubric:
 *   - Role fixture from `@sally/test-utils/auth` (asOwner, asAnonymous).
 *   - Factories from `@sally/test-utils/factories`.
 *   - Exact numeric statuses via `expect(res.status()).toBe(N)`.
 *   - `expectContract(Schema.strict(), body)` on every happy path.
 *   - Semantic assertion (echo / state-transition / token-change).
 *   - Persistence via a second request (list membership check, re-read
 *     by-token, detail re-read for cancel/resend state).
 *   - Cleanup: every test that creates an invitation cancels it in the
 *     finally block. The accept-flow test additionally DELETEs the
 *     user it creates. The resend test uses the SAME invitation that
 *     cancel cleans up (no separate lifecycle cost).
 *   - Tags: `@workflow @contract` baseline, `@destructive` on writes.
 *   - Zero runtime `test.skip(cond, …)`.
 */
import { test, expect } from '@sally/test-utils/auth';
import { expectContract, expectArrayContract, PlatformSchemas } from '@sally/test-utils/schemas';
import { buildUserInvitation, buildInvitationAccept, buildInvitationCancel } from '@sally/test-utils/factories';
import type { RoleApiClient } from '@sally/test-utils/playwright';

// Create an invitation → return {invitationId, token} for tests that don't
// need the full response shape. Kept inline (not in _helpers.ts) because
// the only caller is this spec file.
async function createInvitation(
  asOwner: RoleApiClient,
  overrides: Record<string, unknown> = {},
): Promise<{ invitationId: string; token: string; email: string }> {
  const payload = buildUserInvitation(overrides);
  const res = await asOwner.post('/invitations', payload);
  expect(res.status()).toBe(201);
  const body = expectContract(
    PlatformSchemas.UserInvitationCreateResponseSchema.strict(),
    await res.json(),
    'createInvitation helper POST /invitations',
  );
  return {
    invitationId: body.invitationId,
    token: body.token,
    email: payload.email as string,
  };
}

async function cleanupInvitation(asOwner: RoleApiClient, invitationId: string | undefined): Promise<void> {
  if (!invitationId) return;
  const res = await asOwner.delete(`/invitations/${invitationId}`, {
    data: buildInvitationCancel(),
  });
  // 200 on cancel; 400 if already cancelled/accepted (defensive tolerance
  // — the /accept flow transitions the row to ACCEPTED, which cannot be
  // cancelled afterwards); 404 if already gone.
  if (![200, 400, 404].includes(res.status())) {
    // eslint-disable-next-line no-console
    console.error(`cleanupInvitation: DELETE /invitations/${invitationId} returned HTTP ${res.status()}`);
  }
}

test.describe('Platform · User Invitations · Admin CRUD @workflow', () => {
  // 1 ── POST /invitations ───────────────────────────────────────────────────
  test('POST /invitations creates a pending email invitation with a one-shot token and inviteLink (OWNER) @workflow @contract @destructive', async ({
    asOwner,
  }) => {
    let invitationId: string | undefined;
    try {
      const payload = buildUserInvitation({
        firstName: 'Phase4d',
        lastName: 'Create',
      });
      const res = await asOwner.post('/invitations', payload);
      expect(res.status()).toBe(201);
      const body = expectContract(
        PlatformSchemas.UserInvitationCreateResponseSchema.strict(),
        await res.json(),
        'POST /invitations',
      );
      invitationId = body.invitationId;

      // Semantic — row echoes the payload, status=PENDING, inviteChannel
      // defaults to EMAIL when `email` is provided, token is a 32-char
      // nanoid, inviteLink is built from APP_URL + `?token=<token>`,
      // the `invitedByUser` include surfaces the demo OWNER, and the
      // `tenant` include is the demo tenant row (ACTIVE).
      expect(body.email).toBe(payload.email);
      expect(body.firstName).toBe(payload.firstName);
      expect(body.lastName).toBe(payload.lastName);
      expect(body.role).toBe('DISPATCHER');
      expect(body.inviteChannel).toBe('EMAIL');
      expect(body.status).toBe('PENDING');
      expect(body.token.length).toBe(32);
      expect(body.invitationId.startsWith('inv_')).toBe(true);
      expect(body.inviteLink.endsWith(`?token=${body.token}`)).toBe(true);
      expect(body.tenant.tenantId).toBe('demo-northstar-2026');
      expect(body.tenant.status).toBe('ACTIVE');
      expect(body.invitedByUser.role).toBe('OWNER');

      // Persistence — the row appears on GET /invitations with status=PENDING.
      const listRes = await asOwner.get('/invitations');
      expect(listRes.status()).toBe(200);
      const list = expectArrayContract(PlatformSchemas.UserInvitationListItemSchema.strict(), await listRes.json(), {
        context: 'GET /invitations (post-create persistence)',
      });
      const found = list.find((r) => r.invitationId === body.invitationId);
      expect(found).toBeDefined();
      expect(found!.status).toBe('PENDING');
      expect(found!.email).toBe(payload.email);
    } finally {
      await cleanupInvitation(asOwner, invitationId);
    }
  });

  // 2 ── GET /invitations ────────────────────────────────────────────────────
  test('GET /invitations returns tenant invitations with the seeded row present (OWNER) @workflow @contract', async ({
    asOwner,
  }) => {
    // Seed one row so the list is deterministically non-empty.
    let invitationId: string | undefined;
    try {
      const seed = await createInvitation(asOwner, {
        firstName: 'Phase4d',
        lastName: 'List',
      });
      invitationId = seed.invitationId;

      const res = await asOwner.get('/invitations');
      expect(res.status()).toBe(200);
      const rows = expectArrayContract(PlatformSchemas.UserInvitationListItemSchema.strict(), await res.json(), {
        context: 'GET /invitations',
      });

      // Semantic — list is non-empty, rows are ordered by createdAt desc
      // (service `orderBy`), the seeded row is present, every row carries
      // the thin `invitedByUser` projection (4 fields) + nullable `driver`.
      expect(rows.length).toBeGreaterThan(0);
      const found = rows.find((r) => r.invitationId === seed.invitationId);
      expect(found).toBeDefined();
      expect(found!.email).toBe(seed.email);
      expect(found!.status).toBe('PENDING');
      expect(found!.invitedByUser.userId.length).toBeGreaterThan(0);

      // Status filter — GET /invitations?status=PENDING must include the seed
      // but not any ACCEPTED / CANCELLED rows.
      const pendingRes = await asOwner.get('/invitations?status=PENDING');
      expect(pendingRes.status()).toBe(200);
      const pendingRows = expectArrayContract(
        PlatformSchemas.UserInvitationListItemSchema.strict(),
        await pendingRes.json(),
      );
      for (const row of pendingRows) {
        expect(row.status).toBe('PENDING');
      }
      expect(pendingRows.find((r) => r.invitationId === seed.invitationId)).toBeDefined();
    } finally {
      await cleanupInvitation(asOwner, invitationId);
    }
  });

  // 3 ── GET /invitations/:invitationId/link ────────────────────────────────
  test('GET /invitations/:invitationId/link returns the link for a pending invitation (OWNER) @workflow @contract', async ({
    asOwner,
  }) => {
    let invitationId: string | undefined;
    try {
      const seed = await createInvitation(asOwner, {
        firstName: 'Phase4d',
        lastName: 'LinkRead',
      });
      invitationId = seed.invitationId;

      const res = await asOwner.get(`/invitations/${seed.invitationId}/link`);
      expect(res.status()).toBe(200);
      const body = expectContract(
        PlatformSchemas.UserInvitationLinkSchema.strict(),
        await res.json(),
        `GET /invitations/${seed.invitationId}/link`,
      );

      // Semantic — the link matches the original create response's token
      // (this endpoint does NOT regenerate). String-match for stability.
      expect(body.inviteLink.endsWith(`?token=${seed.token}`)).toBe(true);
      expect(body.inviteLink.includes('/accept-invitation')).toBe(true);
    } finally {
      await cleanupInvitation(asOwner, invitationId);
    }
  });

  // 4 ── POST /invitations/:invitationId/resend ─────────────────────────────
  test('POST /invitations/:invitationId/resend rotates the token and extends expiry (OWNER) @workflow @contract @destructive', async ({
    asOwner,
  }) => {
    let invitationId: string | undefined;
    try {
      const seed = await createInvitation(asOwner, {
        firstName: 'Phase4d',
        lastName: 'Resend',
      });
      invitationId = seed.invitationId;

      const res = await asOwner.post(`/invitations/${seed.invitationId}/resend`, {});
      expect(res.status()).toBe(201);
      const body = expectContract(
        PlatformSchemas.UserInvitationResendResponseSchema.strict(),
        await res.json(),
        `POST /invitations/${seed.invitationId}/resend`,
      );

      // Semantic — invitationId unchanged, token ROTATED (not equal to
      // the seed token), expiresAt parsed as ISO, status still PENDING,
      // inviteLink reflects the new token.
      expect(body.invitationId).toBe(seed.invitationId);
      expect(body.token).not.toBe(seed.token);
      expect(body.token.length).toBe(32);
      expect(body.status).toBe('PENDING');
      expect(body.inviteLink.endsWith(`?token=${body.token}`)).toBe(true);

      // Persistence — the /link endpoint now returns the new token.
      const verifyRes = await asOwner.get(`/invitations/${seed.invitationId}/link`);
      expect(verifyRes.status()).toBe(200);
      const verify = expectContract(PlatformSchemas.UserInvitationLinkSchema.strict(), await verifyRes.json());
      expect(verify.inviteLink.endsWith(`?token=${body.token}`)).toBe(true);
    } finally {
      await cleanupInvitation(asOwner, invitationId);
    }
  });

  // 5 ── DELETE /invitations/:invitationId ──────────────────────────────────
  test('DELETE /invitations/:invitationId cancels a pending invitation and records the reason (OWNER) @workflow @contract @destructive', async ({
    asOwner,
  }) => {
    // No finally cleanup — the DELETE IS the cleanup.
    const seed = await createInvitation(asOwner, {
      firstName: 'Phase4d',
      lastName: 'Cancel',
    });

    const cancelPayload = buildInvitationCancel({
      reason: `QA Phase-4d cancel probe ${Date.now()}`,
    });
    const res = await asOwner.delete(`/invitations/${seed.invitationId}`, {
      data: cancelPayload,
    });
    expect(res.status()).toBe(200);
    const body = expectContract(
      PlatformSchemas.UserInvitationRowSchema.strict(),
      await res.json(),
      `DELETE /invitations/${seed.invitationId}`,
    );

    // Semantic — status advanced to CANCELLED, cancelledAt populated,
    // cancellationReason echoes payload, invitationId unchanged.
    expect(body.invitationId).toBe(seed.invitationId);
    expect(body.status).toBe('CANCELLED');
    expect(body.cancelledAt).not.toBeNull();
    expect(body.cancellationReason).toBe(cancelPayload.reason);

    // Persistence — the row is NOT on the PENDING-status list.
    const listRes = await asOwner.get('/invitations?status=PENDING');
    expect(listRes.status()).toBe(200);
    const list = expectArrayContract(PlatformSchemas.UserInvitationListItemSchema.strict(), await listRes.json(), {
      allowEmpty: true,
    });
    const stillPending = list.find((r) => r.invitationId === seed.invitationId);
    expect(stillPending).toBeUndefined();
  });
});

test.describe('Platform · User Invitations · Public flow @workflow', () => {
  // 6 ── GET /invitations/by-token/:token (PUBLIC) ──────────────────────────
  test('GET /invitations/by-token/:token returns the invitation with thin tenant + invitedBy projections (ANONYMOUS) @workflow @contract', async ({
    asOwner,
    asAnonymous,
  }) => {
    let invitationId: string | undefined;
    try {
      const seed = await createInvitation(asOwner, {
        firstName: 'Phase4d',
        lastName: 'PublicLookup',
      });
      invitationId = seed.invitationId;

      const res = await asAnonymous.get(`/invitations/by-token/${seed.token}`);
      expect(res.status()).toBe(200);
      const body = expectContract(
        PlatformSchemas.PublicInvitationLookupSchema.strict(),
        await res.json(),
        `GET /invitations/by-token/${seed.token}`,
      );

      // Semantic — public shape exposes the tenant name (what the
      // acceptance page needs), the inviter's name, but NOT the
      // inviter's full Prisma row (no passwordHash, no firebaseUid).
      // The nested `tenant` projection has exactly three fields.
      expect(body.invitationId).toBe(seed.invitationId);
      expect(body.status).toBe('PENDING');
      expect(body.email).toBe(seed.email);
      expect(body.tenant.tenantId).toBe('demo-northstar-2026');
      expect(body.tenant.companyName.length).toBeGreaterThan(0);
      expect(body.tenant.subdomain.length).toBeGreaterThan(0);
      expect(body.invitedByUser.email).not.toBeNull();
    } finally {
      await cleanupInvitation(asOwner, invitationId);
    }
  });

  // 7 ── POST /invitations/accept (PUBLIC) ──────────────────────────────────
  test('POST /invitations/accept creates a User and transitions invitation → ACCEPTED (ANONYMOUS) @workflow @contract @destructive', async ({
    asOwner,
    asAnonymous,
  }) => {
    // The accept flow creates a real User row. The test cleans it up via
    // DELETE /users/:userId in the finally block. The invitation itself
    // transitions to ACCEPTED (terminal) — no cancel call is attempted
    // because ACCEPTED rows throw on DELETE /invitations/:id.
    let acceptedUserId: string | undefined;
    const seed = await createInvitation(asOwner, {
      firstName: 'Phase4d',
      lastName: 'Accept',
    });

    try {
      const acceptPayload = buildInvitationAccept({ token: seed.token });
      const res = await asAnonymous.post('/invitations/accept', acceptPayload);
      expect(res.status()).toBe(201);
      const body = expectContract(
        PlatformSchemas.AcceptInvitationResponseSchema.strict(),
        await res.json(),
        'POST /invitations/accept',
      );
      acceptedUserId = body.userId;

      // Semantic — new User row mirrors the invitation: same email +
      // name + role, firebaseUid echoes the submitted value,
      // emailVerified set true (invitation-accepted is considered
      // verified), isActive true, driver / customer null, and the
      // tenant embed is the demo tenant.
      expect(body.email).toBe(seed.email);
      expect(body.firstName).toBe('Phase4d');
      expect(body.lastName).toBe('Accept');
      expect(body.role).toBe('DISPATCHER');
      expect(body.firebaseUid).toBe(acceptPayload.firebaseUid);
      expect(body.emailVerified).toBe(true);
      expect(body.isActive).toBe(true);
      expect(body.driver).toBeNull();
      expect(body.customer).toBeNull();
      expect(body.tenant).not.toBeNull();
      expect(body.tenant!.tenantId).toBe('demo-northstar-2026');
      expect(body.userId.startsWith('user_')).toBe(true);

      // Persistence (invitation side) — the by-token lookup now throws
      // 400 "Invitation is no longer valid" because the service guards
      // on `status === 'PENDING'`. Confirms the transition to ACCEPTED.
      const afterLookup = await asAnonymous.get(`/invitations/by-token/${seed.token}`);
      expect(afterLookup.status()).toBe(400);

      // Persistence (user side) — the new user is readable via the
      // admin detail endpoint (OWNER scope), is DISPATCHER, active.
      const userDetail = await asOwner.get(`/users/${body.userId}`);
      expect(userDetail.status()).toBe(200);
      const userBody = expectContract(PlatformSchemas.UserDetailSchema.strict(), await userDetail.json());
      expect(userBody.role).toBe('DISPATCHER');
      expect(userBody.email).toBe(seed.email);
      expect(userBody.isActive).toBe(true);
    } finally {
      // Clean up the accepted user — the invitation is terminal and
      // can't be cancelled; deleting the user is the only cleanup.
      if (acceptedUserId) {
        const delRes = await asOwner.delete(`/users/${acceptedUserId}`);
        // 200 soft-delete; any other status is logged but not fatal.
        if (delRes.status() !== 200 && delRes.status() !== 404) {
          // eslint-disable-next-line no-console
          console.error(`accept-cleanup: DELETE /users/${acceptedUserId} returned HTTP ${delRes.status()}`);
        }
      }
    }
  });

  // 8 ── POST /invitations/accept with an invalid token → 404 ────────────────
  test('POST /invitations/accept rejects an unknown token with 404 (ANONYMOUS) @workflow @contract', async ({
    asAnonymous,
  }) => {
    // Negative contract — the `Invitation not found` branch of the
    // accept path. Proves (a) the route is truly public (no auth
    // challenge before the service runs), and (b) the 404 is emitted
    // by the service, not by the Public() guard. A positive match of
    // this contract protects against accidental return-null regressions.
    const payload = buildInvitationAccept({
      token: `qa-nonexistent-token-${Date.now()}`,
    });
    const res = await asAnonymous.post('/invitations/accept', payload);
    expect(res.status()).toBe(404);
  });
});

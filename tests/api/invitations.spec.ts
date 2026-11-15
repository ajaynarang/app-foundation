import { randomUUID } from 'crypto';
import { test, expect } from '../fixtures/auth.fixture.js';
import type { RoleApiClient } from '../fixtures/auth.fixture.js';
import { PlatformSchemas } from '@app/test-utils/schemas';
import { buildInvitationAccept } from '@app/test-utils/factories';

/**
 * Invitation tokens are bearer secrets (ADR-0012, "Recognised, so hashed"), and an invitation never hands over an
 * existing account (ADR-0009, "Workspace membership"), read off a running backend. The service and integration specs
 * hold the rules; this holds the wiring: no answer to the inviter carries a link, only OWNER and ADMIN can get one and
 * only by rotating the token, a rotated token is dead, the public routes take the token in the body, the public accept
 * refuses an email that has an account (409 SIGN_IN_TO_ACCEPT), the signed-in join refuses another email, and an
 * accept signs the new account in by cookie.
 *
 * The join of an unverified account (one step: an emailed-only token also verifies it, a shared link leaves it
 * unverified) is held by the service and integration specs: every token this suite can get is a rotated, shared one,
 * and it has no second workspace for an existing account to join.
 *
 * The suite has no database access, so each case gets its token from `POST /invitations/:invitation_id/link` as
 * OWNER, uses a fresh `qa-<uuid>@example.com` address, and cancels what it created. The one case that accepts
 * deletes the account it made, so its seat is free again.
 *
 * The public token routes each have a 15-minute per-IP limit of 20 (AUTH_THROTTLE_LIMIT_TOKEN). One run sends
 * `preview` 4 times and `accept` 7 times, so two runs inside the window fit. `join` is STRICT (5), counted per user;
 * one run sends it once as MEMBER.
 *
 * An expired token cannot be made here (no clock or database control): the service and integration specs hold expiry.
 */
test.describe('Invitation tokens @api', () => {
  const created: string[] = [];

  /** Invites a fresh address (or `email`) as MEMBER and checks the answer is the public invitation: no link, no token. */
  const invite = async (asOwner: RoleApiClient, email = `qa-${randomUUID()}@example.com`) => {
    const res = await asOwner.post('/invitations', {
      email,
      firstName: 'Qa',
      lastName: 'Invitee',
      role: 'MEMBER',
    });
    const body = await res.json();
    expect(res.status(), JSON.stringify(body).slice(0, 300)).toBe(201);
    const invitation = PlatformSchemas.UserInvitationCreateResponseSchema.parse(body);
    created.push(invitation.invitationId);
    return invitation;
  };

  /** A new shareable link for the invitation, and the raw token it carries. */
  const rotate = async (client: RoleApiClient, invitationId: string) => {
    const res = await client.post(`/invitations/${invitationId}/link`);
    const body = await res.json();
    expect(res.status(), JSON.stringify(body).slice(0, 300)).toBe(200);
    const { inviteLink } = PlatformSchemas.UserInvitationLinkSchema.parse(body);
    return new URL(inviteLink).searchParams.get('token') as string;
  };

  /** Accounts an accept created, deleted (soft: deactivated) after the case so their seats come back. */
  const accounts: string[] = [];

  test.afterEach(async ({ asOwner }) => {
    // A cancelled invitation frees its seat. One that is already cancelled or accepted answers 409, which is fine here.
    while (created.length > 0)
      await asOwner.delete(`/invitations/${created.pop()}`, { data: { reason: 'QA cleanup' } });
    while (accounts.length > 0) {
      const res = await asOwner.delete(`/users/${accounts.pop()}`);
      expect(res.status(), 'cleanup: delete the accepted account').toBeLessThan(300);
    }
  });

  test('a rotated token is dead: the first link is 404 on preview and on accept, the new one previews', async ({
    asOwner,
    asAnonymous,
  }) => {
    const invitation = await invite(asOwner);
    const first = await rotate(asOwner, invitation.invitationId);
    const second = await rotate(asOwner, invitation.invitationId);
    expect(second).not.toBe(first);

    const stalePreview = await asAnonymous.post('/invitations/preview', { token: first });
    expect(stalePreview.status()).toBe(404);
    expect((await stalePreview.json()).code).toBe('NOT_FOUND');
    const staleAccept = await asAnonymous.post('/invitations/accept', buildInvitationAccept({ token: first }));
    expect(staleAccept.status()).toBe(404);
    expect((await staleAccept.json()).code).toBe('NOT_FOUND');

    const preview = await asAnonymous.post('/invitations/preview', { token: second });
    expect(preview.status()).toBe(200);
    const shown = PlatformSchemas.InvitationPreviewSchema.parse(await preview.json());
    expect(shown.invitationId).toBe(invitation.invitationId);
    expect(shown.email).toBe(invitation.email);
  });

  test('resend answers the public invitation, never a link', async ({ asOwner }) => {
    const invitation = await invite(asOwner);
    const res = await asOwner.post(`/invitations/${invitation.invitationId}/resend`);
    expect(res.status()).toBe(200);
    const resent = PlatformSchemas.UserInvitationResendResponseSchema.parse(await res.json());
    expect(resent.invitationId).toBe(invitation.invitationId);
  });

  test('an unknown token is 404 NOT_FOUND on preview and accept; a cancelled invitation is 409 INVALID_STATE', async ({
    asOwner,
    asAnonymous,
  }) => {
    const unknown = 'x'.repeat(32);
    const preview = await asAnonymous.post('/invitations/preview', { token: unknown });
    expect(preview.status()).toBe(404);
    expect((await preview.json()).code).toBe('NOT_FOUND');
    const accept = await asAnonymous.post('/invitations/accept', buildInvitationAccept({ token: unknown }));
    expect(accept.status()).toBe(404);
    expect((await accept.json()).code).toBe('NOT_FOUND');

    const invitation = await invite(asOwner);
    const token = await rotate(asOwner, invitation.invitationId);
    const cancel = await asOwner.delete(`/invitations/${invitation.invitationId}`, { data: { reason: 'QA' } });
    expect(cancel.status()).toBe(204);

    const cancelledPreview = await asAnonymous.post('/invitations/preview', { token });
    expect(cancelledPreview.status()).toBe(409);
    expect((await cancelledPreview.json()).code).toBe('INVALID_STATE');
    const cancelledAccept = await asAnonymous.post('/invitations/accept', buildInvitationAccept({ token }));
    expect(cancelledAccept.status()).toBe(409);
    expect((await cancelledAccept.json()).code).toBe('INVALID_STATE');
  });

  test('only OWNER and ADMIN can get a link: MEMBER and SUPER_ADMIN are refused, and the GET routes are gone', async ({
    asOwner,
    asAdmin,
    asMember,
    asSuperAdmin,
  }) => {
    const invitation = await invite(asOwner);

    const member = await asMember.post(`/invitations/${invitation.invitationId}/link`);
    expect(member.status()).toBe(403);
    const superAdmin = await asSuperAdmin.post(`/invitations/${invitation.invitationId}/link`);
    expect(superAdmin.status()).toBe(403);
    await rotate(asAdmin, invitation.invitationId);

    // The old read-the-link route and the token-in-the-path lookup no longer exist.
    expect((await asOwner.get(`/invitations/${invitation.invitationId}/link`)).status()).toBe(404);
    expect((await asOwner.get(`/invitations/by-token/${'x'.repeat(32)}`)).status()).toBe(404);
  });

  test('takeover attempt: the public accept for an email that has an account is 409 SIGN_IN_TO_ACCEPT and writes nothing', async ({
    asOwner,
    asAnonymous,
  }) => {
    // The seeded super admin: a live, verified account outside the demo workspace. Before the fix this accept was a 200
    // that attached it to the inviter's workspace.
    const invitation = await invite(asOwner, 'admin@example.com');
    const token = await rotate(asOwner, invitation.invitationId);

    const res = await asAnonymous.post('/invitations/accept', buildInvitationAccept({ token }));
    const body = await res.json();
    expect(res.status(), JSON.stringify(body).slice(0, 300)).toBe(409);
    expect(body.code).toBe('SIGN_IN_TO_ACCEPT');
    expect(body).not.toHaveProperty('accessToken');

    const list = await asOwner.get('/invitations?status=PENDING&limit=100');
    expect(list.status()).toBe(200);
    const { items } = await list.json();
    expect(items.find((i: { invitationId: string }) => i.invitationId === invitation.invitationId)).toMatchObject({
      status: 'PENDING',
    });
  });

  test('wrong-email join: a signed-in account joins only an invitation for its own email (403 INVITATION_EMAIL_MISMATCH)', async ({
    asOwner,
    asMember,
  }) => {
    const invitation = await invite(asOwner);
    const token = await rotate(asOwner, invitation.invitationId);

    const res = await asMember.post('/invitations/join', { token });
    const body = await res.json();
    expect(res.status(), JSON.stringify(body).slice(0, 300)).toBe(403);
    expect(body.code).toBe('INVITATION_EMAIL_MISMATCH');
    // The answer names neither address.
    expect(JSON.stringify(body)).not.toContain(invitation.email as string);
  });

  test('used token: an accept signs the new account in by cookie, unverified for a shared link; a second accept is 409', async ({
    asOwner,
    asAnonymous,
  }) => {
    const invitation = await invite(asOwner);
    const token = await rotate(asOwner, invitation.invitationId);

    const res = await asAnonymous.post('/invitations/accept', buildInvitationAccept({ token }));
    const body = await res.json();
    expect(res.status(), JSON.stringify(body).slice(0, 300)).toBe(200);
    const accepted = PlatformSchemas.AcceptInvitationResponseSchema.parse(body);
    accounts.push(accepted.user.userId);
    expect(body).not.toHaveProperty('refreshToken');
    expect(res.headers()['set-cookie'] ?? '').toMatch(/(^|\n)refreshToken=[^;]+;.*HttpOnly/i);
    // The link was copied (rotated), so it proves nothing about the mailbox.
    expect(accepted.user.email).toBe(invitation.email);
    expect(accepted.user.emailVerified).toBe(false);

    const again = await asAnonymous.post('/invitations/accept', buildInvitationAccept({ token }));
    expect(again.status()).toBe(409);
    expect((await again.json()).code).toBe('INVALID_STATE');

    // The accept just emailed a verification link, so a resend inside the minute is the cooldown 429.
    const asNew = { headers: { Authorization: `Bearer ${accepted.accessToken}` } };
    const me = await asAnonymous.get('/auth/me', asNew);
    expect(me.status()).toBe(200);
    expect((await me.json()).emailVerified).toBe(false);
    const resend = await asAnonymous.post('/auth/verify-email/resend', undefined, asNew);
    expect(resend.status()).toBe(429);
    expect((await resend.json()).code).toBe('RATE_LIMITED');
  });

  test('no body firebaseUid: the accept refuses an unknown property with 400 VALIDATION_FAILED', async ({
    asAnonymous,
  }) => {
    const res = await asAnonymous.post('/invitations/accept', {
      token: 'x'.repeat(32),
      firebaseUid: `qa-${randomUUID()}`,
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).code).toBe('VALIDATION_FAILED');
  });
});

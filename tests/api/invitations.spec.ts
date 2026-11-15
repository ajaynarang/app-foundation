import { randomUUID } from 'crypto';
import { test, expect } from '../fixtures/auth.fixture.js';
import type { RoleApiClient } from '../fixtures/auth.fixture.js';
import { PlatformSchemas } from '@app/test-utils/schemas';

/**
 * Invitation tokens are bearer secrets (ADR-0012, "Recognised, so hashed"), read off a running backend. The service
 * specs hold the hashing and the conditional moves; this holds the wiring: no answer to the inviter carries a link,
 * only OWNER and ADMIN can get one and only by rotating the token, a rotated token is dead, and the public routes take
 * the token in the body.
 *
 * The suite has no database access, so each case gets its token from `POST /invitations/:invitation_id/link` as
 * OWNER, uses a fresh `qa-<uuid>@example.com` address, and cancels what it created. No invitation is accepted here:
 * an accept would create an account.
 *
 * The public token routes share a 15-minute per-IP limit of 10 (AUTH_THROTTLE_LIMIT_OTP_SEND). One run sends
 * `preview` 4 times and `accept` 3 times, so two runs inside the window fit.
 *
 * An expired token cannot be made here (no clock or database control): the service spec holds expiry.
 */
test.describe('Invitation tokens @api', () => {
  const created: string[] = [];

  /** Invites a fresh address as MEMBER and checks the answer is the public invitation: no link, no token. */
  const invite = async (asOwner: RoleApiClient) => {
    const res = await asOwner.post('/invitations', {
      email: `qa-${randomUUID()}@example.com`,
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

  test.afterEach(async ({ asOwner }) => {
    // A cancelled invitation frees its seat. One that is already cancelled answers 409, which is fine here.
    while (created.length > 0)
      await asOwner.delete(`/invitations/${created.pop()}`, { data: { reason: 'QA cleanup' } });
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
    const staleAccept = await asAnonymous.post('/invitations/accept', {
      token: first,
      firebaseUid: `qa-${randomUUID()}`,
    });
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
    const accept = await asAnonymous.post('/invitations/accept', { token: unknown, firebaseUid: `qa-${randomUUID()}` });
    expect(accept.status()).toBe(404);
    expect((await accept.json()).code).toBe('NOT_FOUND');

    const invitation = await invite(asOwner);
    const token = await rotate(asOwner, invitation.invitationId);
    const cancel = await asOwner.delete(`/invitations/${invitation.invitationId}`, { data: { reason: 'QA' } });
    expect(cancel.status()).toBe(204);

    const cancelledPreview = await asAnonymous.post('/invitations/preview', { token });
    expect(cancelledPreview.status()).toBe(409);
    expect((await cancelledPreview.json()).code).toBe('INVALID_STATE');
    const cancelledAccept = await asAnonymous.post('/invitations/accept', { token, firebaseUid: `qa-${randomUUID()}` });
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
});

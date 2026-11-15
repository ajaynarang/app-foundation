import { test, expect } from '../fixtures/auth.fixture.js';

/**
 * Email verification, read off a running backend. The service spec holds the token rules (hash only, 24 hours, single
 * use, one answer for every refusal, the 60-second resend cooldown); this holds the wiring: the verify link needs a
 * session (D8), a bad link is a 400 that never signs the caller out, and resend is a signed-in 204.
 *
 * The suite has no database access and every seeded user is verified, so there is no unverified signed-in account
 * to send a real link to here. The cooldown 429 needs one: the invitation accept makes one and emails it a link, so
 * `invitations.spec.ts` ("used token") holds that a resend right after is 429 RATE_LIMITED. The other way an address is
 * proven, an invitation join with an emailed-only token, needs that emailed token, so the integration spec holds it.
 *
 * Throttles: verify-email is STRICT (5 per 15 minutes), counted per user when signed in and per IP when not; one run
 * sends it once signed out and twice as MEMBER, so two runs fit in the window. Resend is OTP_SEND (10), counted per
 * user; one run sends it once as OWNER and once signed out.
 */
test.describe('Email verification @api', () => {
  const unknownToken = 'x'.repeat(64);

  test('verify needs a session: signed out it is 401, not a token check', async ({ asAnonymous }) => {
    const res = await asAnonymous.post('/auth/verify-email', { token: unknownToken });
    expect(res.status()).toBe(401);
    expect((await res.json()).code).toBe('UNAUTHENTICATED');
  });

  test('a link that is not the caller’s is 400 VERIFICATION_LINK_INVALID, never a 401', async ({ asMember }) => {
    const res = await asMember.post('/auth/verify-email', { token: unknownToken });
    const body = await res.json();
    expect(res.status(), JSON.stringify(body).slice(0, 300)).toBe(400);
    expect(body.code).toBe('VERIFICATION_LINK_INVALID');
    expect(body.detail).toBe('This verification link is invalid or has expired.');

    // The session is untouched: the same caller still reads their profile.
    expect((await asMember.get('/auth/me')).status()).toBe(200);
  });

  test('a token that is too short is 400 VALIDATION_FAILED', async ({ asMember }) => {
    const res = await asMember.post('/auth/verify-email', { token: 'short' });
    expect(res.status()).toBe(400);
    expect((await res.json()).code).toBe('VALIDATION_FAILED');
  });

  test('resend as a seeded (verified) user is 204 and a no-op; signed out it is 401', async ({
    asOwner,
    asAnonymous,
  }) => {
    const me = await (await asOwner.get('/auth/me')).json();
    expect(me.emailVerified).toBe(true);

    const res = await asOwner.post('/auth/verify-email/resend');
    expect(res.status()).toBe(204);

    const anonymous = await asAnonymous.post('/auth/verify-email/resend');
    expect(anonymous.status()).toBe(401);
  });
});

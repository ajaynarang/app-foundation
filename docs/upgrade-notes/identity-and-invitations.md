# Upgrade note: identity and invitations

For a product that was scaffolded from this starter **before** the identity and invitation hardening, and now pulls
it.

One dated entry per change that alters behaviour, in the order the changes were made. Each says what changes when
you pull it, what to do first, what breaks on the wire, and how to turn it back.

## 2026-11-15: invitation tokens are hashed at rest, and only OWNER/ADMIN can get a link

**What changed.** An invitation token is a bearer secret: whoever holds it can accept. It used to be stored in plain
text, returned to the inviter on create and resend, readable by any MEMBER through `GET /invitations/:id/link`, and
sent in the path of `GET /invitations/by-token/:token`, where every page load wrote it to the request log.

- The database stores only `sha256(token)` (`user_invitations.token_hash`). The raw token is in the emailed or
  texted link and nowhere else.
- `POST /invitations` and `POST /invitations/:invitation_id/resend` answer the public invitation (as
  `GET /invitations` lists it) with no `inviteLink`. The link goes to the invitee only. Resend rotates the token, so
  the previous link stops working.
- `POST /invitations/:invitation_id/link` (OWNER and ADMIN) is the only way to get a shareable link. Because the
  token is stored hashed, it cannot be read back: the route rotates the token, returns the new link once, and sends
  nothing. **The link in the invitation email stops working.** It stamps `link_shared_at`, so a later change can
  tell a token that only travelled by email from one an admin has seen.
- `POST /invitations/preview` (public, body `{ token }`) replaces `GET /invitations/by-token/:token`. It answers a
  public shape: `invitationId`, `email`, `phone`, `inviteChannel`, `firstName`, `lastName`, `role`, `expiresAt`,
  `tenant { tenantId, companyName, subdomain }` and `invitedBy { firstName, lastName }`. No token, no Int id, no
  inviter email.
- `POST /invitations/accept` answers the account's public profile (the `user` object `/auth/me` returns), not the
  stored user row. It used to return `passwordHash`, `pinHash`, `firebaseUid` and Int ids when the invitee already
  had an account. Its body is unchanged in this entry (`{ token, firebaseUid }`).
- An invitation is accepted, resent or rotated with a conditional update (`id`, `token_hash` and `PENDING` must all
  still hold), so two concurrent accepts of one token cannot both win; the loser gets 409 `INVALID_STATE`.
- `preview` and `accept` are limited to 10 calls per client in 15 minutes (`AUTH_THROTTLE_LIMIT_OTP_SEND`).

**Who notices.**

- Pending invitations keep working. The migration hashes each stored token in place with the same function the
  service uses, so a link already in someone's inbox still resolves. Every pending invitation is marked
  `link_shared_at = created_at`, because the inviter could read every link that exists today.
- Admins: "Copy link" on Settings › Invitations now asks first, then copies a new link and says "New invite link
  copied". The emailed link stops working.
- MEMBERs can no longer copy an invitation link.
- An API client or product web app that read `inviteLink` from create or resend, called `GET /:id/link` or
  `GET /by-token/:token`, or read the raw user row from accept must move to the new routes and shapes below. A
  product that copied the starter's copy-link hook (`use-copy-invite-link`) must switch it to
  `POST /invitations/:invitation_id/link`; its test fails until it does.

**Wire changes.**

| Before                                                              | After                                                                     |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `POST /invitations` → `{ …, inviteLink }`                           | `POST /invitations` → the public invitation, no `inviteLink`              |
| `POST /invitations/:id/resend` → `{ …, inviteLink }`                | the public invitation, no `inviteLink`; the old link is dead              |
| `GET /invitations/:id/link` (OWNER, ADMIN, MEMBER), token unchanged | removed; `POST /invitations/:id/link` (OWNER, ADMIN), rotates, shown once |
| `GET /invitations/by-token/:token` → the whole row                  | removed; `POST /invitations/preview` `{ token }` → the public preview     |
| `POST /invitations/accept` → the user row                           | the public profile (`UserProfileDto`)                                     |

**Schema.** One forward migration, `20261116000000_invitation_token_hash`. It adds `token_hash` and
`link_shared_at`, fills `token_hash` with `encode(sha256(convert_to(token, 'UTF8')), 'hex')`, marks pending rows
shared, then drops `token` and its unique index. Every row is kept.

**What to do first.** Nothing is required. If you want a pending invitation's next accept to count as proof of the
mailbox (a later entry uses `link_shared_at` for that), resend it: a resend rotates the token, emails it and clears
`link_shared_at`.

**How to turn it back.** Deploy the previous release and restore the `token` column from a backup taken before the
migration. The plain tokens cannot be recovered from their hashes, so without that backup every pending invitation
must be resent after the rollback (each resend issues a new token), the same as the API-key hash migration.

## 2026-11-15: email verification, and a reset of an unverified account is a reclaim

**What changed.** Nothing used to verify an email: every account outside the seeds stayed `email_verified = false`,
and no route set it. Now an address is proven by a link the account's signed-in owner opens, or by a password reset.

- A new table, `email_verification_tokens`, stores only `sha256(token)` and the address the token proves. A token
  works for 24 hours, once.
- `POST /auth/verify-email` `{ token }` (**signed in**, STRICT throttle) answers 204 and sets `emailVerified`. The
  token must belong to the caller: the person who clicks must also hold a credential for the account. Otherwise
  someone who signs up as `victim@x.com` would get their account verified the moment the real owner clicks the
  "Verify your email" message. Every refusal (unknown, used, expired, another address, another account) is one
  400 `VERIFICATION_LINK_INVALID`. Not 401: the web reads a 401 as an expired session.
- `POST /auth/verify-email/resend` (signed in, OTP_SEND throttle) answers 204, a no-op when already verified, and
  429 `RATE_LIMITED` with `Retry-After` within 60 seconds of the last email.
- Personal signup (`POST /auth/register`) and workspace registration (`POST /tenants/register`) send a verification
  email after the signup commits. A send failure never fails the signup. A user an admin creates gets none: they
  have no password yet, and their first reset verifies them.
- `POST /auth/reset-password` now also sets `emailVerified = true` and uses up the account's other reset and
  verification links. **When the account was not verified, the reset is a reclaim:** it also clears the phone, PIN
  and Firebase uid, revokes the account's API keys and OAuth access and refresh tokens, and emails "Your password
  was reset. Sign-in methods we removed: …". This is how the real owner of an address takes back an account someone
  else created with it. A reset of a verified account changes none of these.
- `tokens-cleanup` now also deletes reset and verification tokens that expired or were used more than 7 days ago
  (reset tokens were never deleted before).
- The web has a `/verify-email` page (public, so a signed-out click lands there and is sent to sign in first), a
  banner "Verify your email to join other workspaces" with a resend button when `emailVerified === false`, and the
  profile shows "Verified" only when the flag is `true` (it used to treat a missing flag as verified).
- `AuthErrorCode` in `@app/shared-types` holds the auth domain codes: `PASSWORD_NOT_SET`,
  `VERIFICATION_LINK_INVALID`, `EMAIL_NOT_VERIFIED`, `SIGN_IN_TO_ACCEPT`, `INVITATION_EMAIL_MISMATCH` (the last three
  are answered once the safe accept lands).

Nothing reads `emailVerified` yet. Sign-in works unverified, as before.

**Who notices.**

- **Every existing user is unverified.** There is no backfill: marking existing accounts verified would bless any
  account created with someone else's address. They keep signing in and using their own workspace; the banner asks
  them to verify. Once the safe invitation accept lands, an unverified account cannot join another workspace.
- **A first-party reset of an existing (so unverified) account removes its phone PIN, Firebase link, API keys and
  OAuth tokens**, and the notice email says so. If that is wrong for your product, run the verify-existing-users
  statement below first.
- Users of a workspace that is still pending approval cannot sign in, so their signup link may expire before they
  can use it; the banner resends one once they can sign in.
- A product web app that reads `emailVerified !== false` as "verified" should read `=== true`.

**Wire changes.**

| Before                                                  | After                                                                                   |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| (none)                                                  | `POST /auth/verify-email` `{ token }`, signed in → 204; 400 `VERIFICATION_LINK_INVALID` |
| (none)                                                  | `POST /auth/verify-email/resend`, signed in → 204; 429 `RATE_LIMITED`                   |
| `POST /auth/reset-password` kept every other credential | same answer; also verifies, and reclaims an unverified account                          |

**Schema.** One forward migration, `20261116010000_email_verification_tokens`, creates the table. No existing row
changes.

**What to do first.** If your product can prove ownership another way (for example, every account came from a
Google sign-in that checks the mailbox), mark those accounts verified with your own predicate, so they skip the
banner and a later reset does not reclaim them:

```sql
-- Product-owned, never run by the template: only rows whose address you can prove some other way.
UPDATE users SET email_verified = true WHERE deleted_at IS NULL AND <your proof>;
```

The template does not run it, because it cannot tell an account its owner created from one created with someone
else's address.

**How to turn it back.** Deploy the previous release. The table can stay (nothing else reads it) or be dropped with
`DROP TABLE email_verification_tokens;`. Accounts verified meanwhile stay verified, and a reclaim that already ran
cannot be undone: the removed phone, Firebase link and keys must be added again.

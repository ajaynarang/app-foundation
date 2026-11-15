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

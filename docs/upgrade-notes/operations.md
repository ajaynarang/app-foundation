# Upgrade note: operations

For a product that was scaffolded from this starter **before** the operations work (sessions, logging, error
tracking, telemetry, alerts, safety gates, deploy), and now pulls it.

One dated entry per change that alters behaviour, in the order the changes were made. Each says what changes when
you pull it, what to set first, and how to turn it back.

## 2026-11-13: refresh tokens rotate, with reuse detection

**What changed.** A refresh used to mint a new access token and leave the refresh token as it was, valid for seven
days whatever happened. Now every refresh issues a new refresh token (a successor) and sets it as the refresh
cookie. The tokens of one sign-in form a family, which is the session.

- The token a client presented is not cut short when its successor is issued. It is retired the first time the
  successor is presented, which proves the client received it. A client whose refresh response was lost (dead zone,
  app killed) still holds a working token.
- The presented token must match the hash stored for it, not only name a stored row.
- Presenting a retired token again is reuse: the whole session is revoked and the user signs in again. A
  `LoginEvent` failure with reason `REFRESH_REUSE` is written and the backend logs one warning
  (`event: auth.refresh_reuse`). Other sessions of that user are not touched. A retired token that arrives within
  `JWT_REFRESH_REUSE_GRACE_SECONDS` (default 10) of its retirement only gets a 401: that is a request another tab
  had in flight.
- A session lasts at most `JWT_SESSION_MAX_AGE` (default `30d`) from sign-in, however often it refreshes. One refresh
  token lives `JWT_REFRESH_EXPIRY` (default `7d`); the stored row used to ignore that key and always say seven days.
- Each session keeps its own workspace. Refresh used to mint the access token from the user's current default
  workspace, so a workspace switch in one browser moved every other session on its next refresh. Now the workspace
  is stored on the session and refresh keeps it, with that workspace's membership role. A removed membership or an
  inactive workspace ends the session on its next refresh. A workspace switch continues the same session.
- The access token's `sid` is the session id. Logout revokes the whole session; "sign out other sessions" (change
  password) revokes every other session.

**Who notices.**

- Browser users: nobody. The web client already sends one refresh at a time per tab and the cookie is replaced on
  each refresh. Two tabs in one browser share one cookie, so they share one session and one workspace; two
  workspaces at once need two sessions (two browsers or profiles).
- A client that stores the refresh token itself (a mobile app, a script, an API test) must store the new value
  from each refresh. The successor arrives as the `refreshToken` cookie of the `POST /auth/refresh` response; the
  response body is unchanged. A client that keeps re-sending its first token keeps working until the successor is
  first presented somewhere, then is signed out as reuse. The starter's `apps/mobile` has no refresh handling, so
  nothing in it changes.
- The refresh-token table gains one row per refresh. `JwtTokenService.cleanupExpiredTokens` deletes expired rows
  and rows revoked more than 30 days ago, but nothing schedules it yet; a later entry in this file turns on the
  `tokens-cleanup` job that calls it.

**Schema.** Two forward migrations, which keep every row:

- `20261113220000_refresh_token_rotation` adds `family_id`, `family_started_at`, `tenant_id`, `previous_token_id`,
  `rotated_at` and `last_used_at` to `refresh_tokens`. Each existing token becomes the first token of its own
  session, started when it was created, in the workspace its user is in today. Live sessions keep working and
  rotate on their next refresh.
- `20261113220100_login_fail_reason_refresh_reuse` adds `REFRESH_REUSE` to `login_fail_reason`. It is its own
  migration because Postgres cannot use a new enum value in the transaction that adds it.

**What to set first.** Nothing. Optionally `JWT_SESSION_MAX_AGE` and `JWT_REFRESH_REUSE_GRACE_SECONDS`
(`docs/doppler.md`). If you set `JWT_REFRESH_EXPIRY` above `7d`, note that the refresh cookie still expires after
seven days without a refresh.

**How to turn it back.** Deploy the previous release; no data step is needed. A token retired by rotation is also
marked revoked, which the old code honours, and every unretired token keeps working under the old code. The new
columns are ignored by the old code. Leave the migrations in place.

## 2026-11-13: tenant-aware login; login may answer 409 for duplicate accounts

**What changed.** `users` is unique only on `(tenant_id, email)`, so one email can have several live accounts.
Password login used to take the oldest of them and check the password only there: the owner of a newer account with
the same email could not sign in at all, and the session landed in whichever workspace the oldest row named.

- `POST /auth/login` checks the password against every live account on the email. Exactly one match signs in. No
  match is the same 401 as before, with a failure login event on each account it checked.
- When the password matches accounts in more than one workspace the answer is 409 `WORKSPACE_SELECTION_REQUIRED`,
  with the workspaces in a new optional envelope key, `workspaces` (`[{ tenantId, name }]`). The client signs in
  again with one `tenantId`. Only that code carries the key. This happens only for leftover duplicate accounts that
  share a password.
- Login, forgot-password and the three phone routes (`/auth/phone/login`, `/auth/phone/send-otp`,
  `/auth/phone/verify-otp`) take an optional `tenantId`: the tenant's public id. With it, only accounts in that
  workspace count (their own tenant, or a membership there), and the session runs in that workspace with that
  membership's role. An unknown `tenantId`, or one the account has no membership in, answers like a wrong password
  (401; `send-otp` still answers 204 and sends nothing). Single-tenant mode ignores it. Without it the session runs
  in the account's default workspace, as before.
- `GET /tenants/branding/:subdomain` now also returns the tenant's `tenantId`. The web login form sends it with every
  sign-in on a tenant subdomain, and shows a workspace picker on the 409.
- Forgot-password sends one link per live, active account behind the address (after the hint), and when there is
  more than one each email names its workspace.
- `ApiErrorCode` gains `WORKSPACE_SELECTION_REQUIRED`; the envelope type and `ApiErrorEnvelopeSchema` gain
  `workspaces?`.

**Who notices.**

- A product with no duplicate accounts: nobody. Run `DATABASE_URL=... pnpm accounts:duplicates` to find out.
- A product with duplicates: their owners can now sign in to each account, and those that share one password see
  the workspace picker. A client of your own that calls `POST /auth/login` must handle the 409 (show the
  `workspaces`, retry with `tenantId`) or it shows the `detail` text as an error. A test or schema that holds the
  error envelope to exactly eight keys must allow `workspaces`.
- A super-admin account that shares an email and a password with a tenant account cannot be told apart by the
  workspace list (it has no workspace) and so cannot sign in until the two are merged.

**What to set first.** Nothing. List any duplicates and merge them by the procedure in `docs/operations.md`
("Duplicate accounts"). The next operations change adds the database index that enforces one live account per
email; it skips itself while duplicates remain.

**How to turn it back.** Deploy the previous release; there is no schema change and no data step.

## 2026-11-13: the database enforces one live account per email

**What changed.** A new migration, `20261113230000_users_email_unique_live`, adds a partial unique index,
`users_email_live_key`, on `lower(email)` over the `users` rows whose `deleted_at` is null. With it the database
refuses a second live account on an address, in any case and in any workspace. A soft-deleted account frees its
address. Accounts with no email are not affected. Once the index exists, the 409 `WORKSPACE_SELECTION_REQUIRED` of
the previous entry can no longer happen.

The migration skips itself when the database already holds duplicates: it raises a notice
(`users_email_live_key not created: N email(s) are shared by more than one live account`), changes nothing and the
deploy carries on. While the index is absent the backend logs one warning at boot, in each process
(`event: auth.email_uniqueness_unenforced`).

**Who notices.**

- A product with no duplicate accounts: nobody. The index is created on deploy and no existing row changes. Code
  that creates a user on an address a live account already holds, in another tenant, now fails with a unique
  violation (Prisma `P2002`, answered as 409 `DUPLICATE`) instead of writing a second account. The starter's own
  lookups ignore case to match the index: personal signup and workspace registration (`registerTenant`) refuse with
  their own 409, an email invitation adds a membership to the existing account, and an SMS invitation that carries
  the email of an existing account is refused with a 409 that points to the email link (the phone path signs the
  caller in, so it never joins someone else's account). `POST /users` (`UsersService.createUser`, OWNER/ADMIN)
  has no lookup and now answers the raw 409 `DUPLICATE` for an address a live account holds. Check your own code
  that creates users the same way: a lookup by exact case misses `Jane@x.com` when given `jane@x.com`.
- A product with duplicates: the deploy succeeds without the index and the boot warning appears. Nothing else
  changes until you enforce it.
- A test of your own that writes two live accounts on one email now fails on a migrated database. The starter's
  two such specs drop the index for their run under an advisory lock and recreate it afterwards.

**What to set first.** Nothing. If you have duplicates: `DATABASE_URL=... pnpm accounts:duplicates`, merge them
(`docs/operations.md`, "Duplicate accounts"), then `DATABASE_URL=... pnpm accounts:enforce-unique-email`. You can
run the report before you pull, to know which case you are in.

**How to turn it back.** Deploy the previous release; the old code works with the index in place. To allow
duplicates again, drop it: `DROP INDEX IF EXISTS "users_email_live_key";`. Leave the migration in place: it does
not run twice, and `pnpm accounts:enforce-unique-email` puts the index back.

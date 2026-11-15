# ADR-0006 — Outbound gate

**Date:** 2026-11-13 · **Status:** Adopted.

## Context

A staging environment of a product built from this starter runs the same code as production, often with the same
provider keys, and often with a copy of production data or real people invited to try it. Nothing stopped it from
emailing, texting, pushing or calling back those people: an invitation sent from a test run, a reminder fired by a
cron, a webhook delivered to a customer's live endpoint. Each provider (Resend, SMTP, Twilio, Twilio Verify, Firebase,
Web Push, the WhatsApp providers, customer webhooks) was called directly from its own sender.

Leaving it to each environment's keys (no Twilio key on staging) does not work: an environment that needs to test
SMS needs the key, and then it can text anyone.

## Decision

**Every send to a real person passes one gate, `OUTBOUND_GATE`, just before the provider is called.**

- **Two modes, `OUTBOUND_MODE=live|allowlist`.** `live` sends to everyone; `allowlist` sends only to the recipients
  on the allow-list. Unset means `live` when `ENV_TYPE=production` and `allowlist` for `sandbox`, `preprod` and
  `development`: a missing key can neither silence real customers in production nor message them from anywhere else.
  A third mode would be one more thing to misconfigure.
- **Boot refuses the dangerous combinations.** Production refuses `allowlist`, which would hold back every customer
  message. `live` outside production refuses to boot without `OUTBOUND_LIVE_OUTSIDE_PRODUCTION=true`, the explicit
  statement that this environment serves real people (a staging that is about to become production). The check runs
  in the config schema, with the other boot checks.
- **The allow-list** is the `outbound_allow_entries` table (emails, email domains, phone numbers, web hosts), edited
  by super-admins at `/admin/outbound`, merged with `OUTBOUND_ALLOWLIST_BOOTSTRAP`, a comma list in the environment.
  The bootstrap list needs no login and no row, so the first super-admin of a staging that signs in by phone OTP can
  receive the code. When the table cannot be read the gate fails closed: only the bootstrap entries pass.
- **What is held back is recorded, once.** A send that has a delivery-ledger row (everything through the
  notification pipeline, and WhatsApp) is ledgered `SKIPPED` with reason `GATED`: the pipeline asks the gate first,
  without side effect, so a gated email is not recorded as sent and a gated SMS not as a provider failure. A send with
  no ledger row (sign-in codes, invitations, password resets, customer webhooks) is recorded by the gate in
  `outbound_suppressions`, with a masked recipient and a preview with codes and links removed, kept 30 days.
- **What is sent in `allowlist` mode is marked:** `[STAGING]` on an email subject, `STG:` before an SMS, `[STG]` on
  a push title. WhatsApp templates are pre-approved, so they are not changed.
- **The gate sits in front of real providers only.** The development console path (no email or SMS provider,
  `ENV_TYPE=development`, the message printed to the log) is below the gate and never gated, so a fresh clone with no
  keys behaves as before. The seeded users sign in by password and need nothing on the list.
- **The port is in the kernel, the policy in platform.** `OUTBOUND_GATE` and the matching rules are in
  `@appshore/kernel/infrastructure/outbound/` (the SMS sender is a kernel class and the kernel has no Prisma);
  `OutboundPolicyService` in `@appshore/platform/infrastructure/outbound/` reads the table and is bound to the port by
  a global module. Sender signatures do not change: the gate inside each sender stays the backstop for every path.

## What follows

- `apps/backend/src/architecture/outbound-gate-coverage.spec.ts` holds the rule: a send primitive (a Resend, Twilio or
  SMTP client, a Web Push or FCM send, a WhatsApp adapter call) may appear only in the listed senders, and each of
  them must inject and call the gate. A new sender either goes through an existing one or joins the list with the gate
  in the same pull request.
- A Resend refusal (reported in a returned `error`, not thrown) now throws, so it is counted in
  `app_outbound_failed{channel="email"}` and ledgered `FAILED` instead of `SENT`.
- A non-production environment that serves real people must say so (`OUTBOUND_MODE=live` with
  `OUTBOUND_LIVE_OUTSIDE_PRODUCTION=true`), or allow-list them, before it deploys this change. The upgrade note
  `docs/upgrade-notes/operations.md` has the steps; `docs/operations.md` has the day-to-day use.
- Unit tests bind the testing gates in `@appshore/kernel/infrastructure/outbound/testing/` (allow all, or hold all).
  `pnpm verify:api` runs with `ENV_TYPE=development` and no provider key, so its sends take the console path.

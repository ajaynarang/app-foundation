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
- A test of your own that writes two live accounts on one email now fails on a migrated database. Write such a
  pair in a throwaway schema (`CREATE TABLE <schema>.users (LIKE public.users INCLUDING DEFAULTS)`, then
  `SET search_path`), as the starter's raw-SQL specs do. The one starter spec that needs the pair through Prisma
  (`tenant-login.integration.spec.ts`; Prisma names `public` in every query) drops the index under an advisory lock
  and recreates it in a `finally`; a run killed before then leaves the index absent, which the boot warning reports
  and `pnpm accounts:enforce-unique-email` repairs.

**What to set first.** Nothing. If you have duplicates: `DATABASE_URL=... pnpm accounts:duplicates`, merge them
(`docs/operations.md`, "Duplicate accounts"), then `DATABASE_URL=... pnpm accounts:enforce-unique-email`. You can
run the report before you pull, to know which case you are in.

**How to turn it back.** Deploy the previous release; the old code works with the index in place. To allow
duplicates again, drop it: `DROP INDEX IF EXISTS "users_email_live_key";`. Leave the migration in place: it does
not run twice, and `pnpm accounts:enforce-unique-email` puts the index back.

## 2026-11-13: logging standard; email outside development fails without a provider

**What changed.**

- **Email with no provider.** With no `RESEND_API_KEY` and no `SMTP_*` keys, `EmailService.sendEmail` used to print
  the whole message (recipient, HTML body with its reset and invitation links) to the log and report success, in
  every environment. Now it prints the message only with `ENV_TYPE=development`, with every address masked. In any
  other environment, `ENV_TYPE` unset included, it prints nothing and throws `EmailNotConfiguredError`, so the send
  fails, and a caller that records deliveries records it as failed. Password reset still answers 200 (no account enumeration); its log
  line no longer carries the link.
- **SMS with no Twilio.** `SmsService.sendSms` still returns `false`. Outside `ENV_TYPE=development` it logs one
  line with a masked number and no message body (the body was usually a code).
- **Log lines.** Request lines drop the whole query string, not only `token=`. Phones and emails in log lines are
  masked (`maskEmail`, `maskPhone`), and errors a provider throws are masked in every field. Lines inside a request
  also carry `tenantDbId` and `role`; every job dispatched through a queue dispatcher carries `jobName`, `jobId` and
  its tenant. A failed job attempt is one structured `job.failed` line; a job with no handler is logged at error
  level as `job.unknown` (it was a warning); a permanent failure that cannot be stored is a `job.dead_letter` line.
  The mock OTP value is no longer logged.
- **Log transport.** With `LOG_TRANSPORT=loki`, outside development, logs now go to stdout and to Loki (they went to
  Loki only). An empty `LOKI_URL` outside development means no Loki target and one stderr line at boot (it used to
  fall back to `http://localhost:3100`). The `env` label comes from `ENV_TYPE` (`production`, `staging` for
  `sandbox` and `preprod`, `development`), not `NODE_ENV`; `level` is no longer promoted by the code (pino-loki
  adds `level` and `hostname` itself). `LOKI_USERNAME` and `LOKI_PASSWORD` set basic auth.
- **Queue board bypass.** `BULL_BOARD_AUTH=false` is honoured only with `ENV_TYPE=development`; it used to be
  honoured whenever `NODE_ENV` was not `production`.
- **Renames.** `withJobLogContext` is now `withJobContext`
  (`@appshore/kernel/infrastructure/logging/job-log-context`). The old name stays as an alias for one release.
  `maskUrlSecrets` is removed from `log-filter.ts`; use `stripQueryString` from
  `@appshore/kernel/shared/utils/log-redaction`.
- **Worker.** `worker.ts` imports telemetry first, so the worker's `pg`, `ioredis` and `http` calls are traced, and
  a worker whose boot hangs releases its buffered logs after 90 seconds with an error line naming the stall.
- **A new spec.** `apps/backend/src/architecture/log-hygiene.spec.ts` fails on a `NODE_ENV === 'production'`
  comparison, a logger call that interpolates a phone, email, token or URL unmasked, a `console.*` call outside its
  allow-list, a metric instrument created outside `metrics.ts`, and a Sentry import outside `error-tracking/`. The
  rules are in `docs/standards/observability.md`.

**Who notices.** A non-development environment (staging, a preview) that runs without an email provider: every
send now fails where it used to "succeed" silently. Code of your own that calls `sendEmail` and does not catch will
see the error. Code of your own that the new spec flags fails `pnpm test` until it is fixed.

**What to set first.** For each deployed environment that should send email, set `RESEND_API_KEY` (or the four
`SMTP_*` keys) before you deploy. A local run keeps working as long as `apps/backend/.env` has
`ENV_TYPE=development`, as `.env.example` sets it. If you ship logs to Grafana Cloud, set `LOKI_URL`,
`LOKI_USERNAME` and `LOKI_PASSWORD`. Rename `withJobLogContext` to `withJobContext` in your own processors before the
alias goes.

**How to turn it back.** Deploy the previous release; nothing is stored differently. There is no switch to print
email bodies outside development, on purpose: set a provider instead.

## 2026-11-13: error tracking, backend and web

**What changes when you pull it.**

- **Backend Sentry.** `@sentry/nestjs` is initialised from `main.ts` and `worker.ts` when `SENTRY_DSN` is set. With
  it unset, nothing changes: nothing is initialised and nothing is sent. Once set, every 5xx answer, final job
  failure, failed cron tenant, lost domain event, failed workflow function, platform AI credit refusal and reused
  refresh token is reported, tagged with ids only.
- **Web Sentry.** `@sentry/nextjs` wraps `next.config.ts` and is initialised from `src/instrumentation.ts` and
  `src/instrumentation-client.ts` when `NEXT_PUBLIC_SENTRY_DSN` is set. `captureError()` used to only log to the
  console even with the DSN set; it now reports when the DSN is set. `initSentry()` is removed from
  `@appshore/web-core/shared/lib/sentry` (it only printed a line). The global error page reports what it catches.
- **CSP.** With `NEXT_PUBLIC_SENTRY_DSN` set, its origin is added to `connect-src`. Unset, the CSP is unchanged.
- **Staging marker.** A web build with `NEXT_PUBLIC_APP_ENV=staging` shows a thin caution stripe across the top of
  every page. Unset means `development`: no stripe.
- **Request id.** The API now exposes `X-Request-Id` to browsers (CORS `exposedHeaders`), and `ApiError` carries it
  as `requestId`.
- **Log lines.** A failed durable-event enqueue or event-log write logs its error as an `err` field, not in the
  message text.

**Who notices.** A product that already set `NEXT_PUBLIC_SENTRY_DSN` (it used to do nothing) starts sending web
errors on its next build. Code of your own that called `initSentry()` from web-core no longer compiles: delete the
call.

**What to set first.** Nothing is required. To turn error tracking on, follow "Error tracking" in
`docs/observability.md`: `SENTRY_DSN` per backend environment, `NEXT_PUBLIC_SENTRY_DSN` and `NEXT_PUBLIC_APP_ENV` per
web build.

**How to turn it back.** Unset `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` (rebuild the web). Nothing is stored.

## 2026-11-13: telemetry off when unset, metrics, foundation crons start running, heartbeat

**What changes when you pull it.**

- **Six foundation crons start running.** A database built from the squashed init migration had no `job_schedules`
  rows, so these jobs were never scheduled. Migration `20261113233000_foundation_job_schedules` inserts one row each
  (daily, UTC), `ON CONFLICT DO NOTHING`, and every boot applies the rows to BullMQ:
  - `trial-expiry` (00:15): tenants on `TRIAL` whose `trialEndsAt` has passed move to `TRIAL_EXPIRED` and lose their
    gifted add-ons. This is the change most likely to be visible to your customers.
  - `job-cleanup` (03:00), `data-retention` (04:00), `login-events-cleanup` (04:30): old job records, login events,
    webhook logs, event logs and HITL challenges are deleted (90 or 30 days, as the handlers say).
  - `tokens-cleanup` (05:00): refresh tokens that expired, or were revoked more than 30 days ago, are deleted. It has
    a handler for the first time.
  - `cleanup` on the notifications queue (05:30): read in-app notifications older than 30 days and dismissed ones
    older than 7 days are deleted.
- **The ops heartbeat.** `ops-heartbeat` runs every five minutes on `bulk-ops` and logs one `ops.heartbeat` line.
- **oauth-refresh runs.** Its handler was never wired to the `bulk-ops` dispatcher, so a product with an OAuth vendor
  had its refresh jobs completed as unknown. It is wired now, and named in `APP_JOB_NAMES.BULK_OPS.OAUTH_REFRESH`.
- **`uploads-cleanup` is gone** from `BULK_OPS_JOB_NAMES`: it never had a handler. `trial-expiry` and `ops-heartbeat`
  join the list. Code that imported `BULK_OPS_JOB_NAMES.UPLOADS_CLEANUP` no longer compiles: delete the reference.
- **Scheduling moved.** `AuthModule` and `DataRetentionModule` no longer schedule their own crons at boot; one
  registrar applies every foundation row (`FoundationSchedulesRegistrar`). A schedule saved on the Schedules screen
  now carries a system job envelope.
- **Traces are off when no endpoint is set.** The backend used to fall back to `http://localhost:4318` in every
  environment, so an ECS task exported traces into nothing. Now an unset `OTEL_EXPORTER_OTLP_ENDPOINT` exports
  nothing, except with `ENV_TYPE=development`, where it still uses the local collector. `apps/backend/.env.example`
  no longer sets the endpoint.
- **Metrics.** With the endpoint set, metrics are pushed to `<endpoint>/v1/metrics` every 60 s (the instruments in
  `docs/observability.md`). New sampling key `OTEL_TRACES_SAMPLER_ARG` (default 1) and auth key
  `OTEL_EXPORTER_OTLP_HEADERS`.
- **Langfuse spans are masked.** Phones and emails in AI spans sent to Langfuse are replaced with `<PHONE>` and
  `<EMAIL>`, on both paths: AI SDK calls through the isolated Langfuse tracer, and Mastra agent spans (the chat
  assistant) through a span output processor in `mastra.provider.ts`. A product that adds its own Mastra
  `Observability` config adds `PiiMaskingSpanOutputProcessor` to it.
- **No worker task.** With `worker_desired_count = 0`, the next Terraform apply adds `OPS_GAUGES_FROM_API=true` to the
  API task definition (a new revision), so the API reports the queue, cron, outbox and deadline gauges. With a
  worker, the task definitions do not change.

**What to set first.** To keep a cron from starting, give it a disabled row before you deploy this release (the
migration then leaves your row alone):

```sql
INSERT INTO job_schedules (category, job_type, schedule_type, pattern, is_enabled, updated_at)
VALUES ('maintenance', 'trial-expiry', 'cron', '15 0 * * *', false, NOW())
ON CONFLICT (category, job_type) DO UPDATE SET is_enabled = false;
```

Use `('notifications', 'cleanup', …)` for the notification cleanup. Nothing else is required. A deployed environment
that relied on the old localhost fallback to reach a sidecar collector must now set `OTEL_EXPORTER_OTLP_ENDPOINT`.

**How to turn it back.** Disable a cron on the Schedules screen (or set `is_enabled = false` on its row); the next
boot removes its repeatable. Unset `OTEL_EXPORTER_OTLP_ENDPOINT` to stop traces and metrics.

## 2026-11-13: AWS fallback alarms and budget, Grafana read role, Container Insights off, deploy markers

**What changes when you pull it.**

- **Container Insights turns off.** `ecs.tf` used to hard-code it on. It now follows `container_insights`, default
  `false`, so the next Terraform apply turns it off on an existing cluster and its per-metric charges stop. Nothing
  in the template reads its metrics.
- **Level 1 alarms and a budget, only when asked for.** Setting `alarm_email` in an environment's tfvars creates an
  SNS topic with an email subscription, ten CloudWatch alarms (load balancer 5xx, unhealthy hosts, RDS CPU, storage,
  memory and connections, Redis memory, and a service-gone alarm each for the API and the worker) and a monthly AWS
  budget (`monthly_budget_usd`, default 100; it measures the whole account, so set 0 in one environment when two share
  an account). With `alarm_email` unset, nothing is created.
- **No worker task.** A stack with `worker_desired_count = 0` gets no worker service-gone alarm, because a service
  with no task sends no metric and the alarm would fire for good. Its API task already carries
  `OPS_GAUGES_FROM_API=true` (the telemetry entry above). In the alert catalog, set `HAS_WORKER = false` in
  `infra/observability/grafana-cloud/catalog/constants.mjs` and regenerate before you apply the Grafana rules, for
  the same reason.
- **A read-only role for Grafana.** Setting both `grafana_cloud_aws_account_id` and `grafana_cloud_external_id`
  creates `<project>-<env>-iam-role-grafana-cloudwatch`, which Grafana's CloudWatch datasource assumes. The deploy
  role gains permission to manage that one role, to refresh and remove the level 1 alarms (when `alarm_email` is
  set) and to read the budget.
- **`grafana_alerting_live`.** Setting it `true` removes every level 1 alarm and the topic in one apply (the budget
  stays). Production refuses it while either Grafana value is empty.
- **Deploy markers.** The deploy workflows now record a Sentry release and deploy and a Grafana annotation after each
  deploy, through `.github/scripts/observability-markers.sh`. Each step is a no-op until its GitHub secrets and
  variables exist, and a vendor error only warns. The deploy workflow's first job now checks out the repo and runs
  the script's hermetic test.
- **`SENTRY_RELEASE` comes from the image.** The backend Dockerfile takes a `BUILD_SHA` build argument (the workflow
  passes the git SHA) and sets `SENTRY_RELEASE` from it. A local build leaves it empty, as before.

**What to set first.** Nothing is required. To keep Container Insights, set `container_insights = true` before the
next apply. If you set `SENTRY_RELEASE` in Doppler, remove it: a Doppler value overrides the image's. The first apply
with `alarm_email` set must run with admin credentials, because the deploy role may not create the SNS topic. For
the deploy markers, set the repository secrets `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `GRAFANA_SA_TOKEN` and the
variables `SENTRY_PROJECT_BACKEND`, `GRAFANA_URL` when you want them.

**How to turn it back.** `container_insights = true` restores Container Insights. Clear `alarm_email` (or set
`grafana_alerting_live = true`) to remove the alarms; clear `alarm_email` or set `monthly_budget_usd = 0` to remove the
budget. Clear either Grafana value to delete the read role. Leave the marker secrets unset to keep the markers off.

## 2026-11-13: outbound gate; non-production environments send only to an allow-list

**What changes when you pull it.**

- **Outside production, only allow-listed recipients are messaged.** `OUTBOUND_MODE` unset now means `allowlist` for
  `ENV_TYPE=sandbox`, `preprod` and `development` (and `live` for `production`). Every email, SMS, sign-in code,
  push, WhatsApp message and customer webhook to someone not on the list is held back. Notification-pipeline sends
  are ledgered `SKIPPED` with reason `GATED`; the others are listed at `/admin/outbound` (new super-admin page, kept 30
  days). What is sent is marked `[STAGING]`, `STG:` or `[STG]`.
- **Boot refuses two settings.** `OUTBOUND_MODE=allowlist` with `ENV_TYPE=production`, and `OUTBOUND_MODE=live`
  outside production without `OUTBOUND_LIVE_OUTSIDE_PRODUCTION=true`.
- **A refused Resend email now throws.** Resend reports a refusal (sender domain, quota, validation) in a returned
  `error` instead of throwing; it used to be logged and ledgered as sent. It now fails the send, counts in
  `app_outbound_failed{channel="email"}` and is ledgered `FAILED`. A caller that awaits `EmailService.sendEmail` sees a
  `ResendRefusedError`.
- **Two new tables**, `outbound_allow_entries` and `outbound_suppressions`, and the enum `OutboundAllowKind`. The
  migration only adds; no existing row changes.
- **Constructors.** `EmailService`, `SmsService`, `TwilioVerifyService`, `PushService`, `FcmService`,
  `WhatsAppSendHandler`, `NotificationDeliveryService` and `WebhookDeliveryProcessor` inject `OUTBOUND_GATE`. The app
  module imports the global `OutboundModule`, which binds it. A product spec that builds one of these by hand passes
  `allowAllOutboundGate()` from `@appshore/kernel/infrastructure/outbound/testing/outbound-gate.testing`.

**What to set first.** For a non-production environment that serves real people, before you deploy: set
`OUTBOUND_MODE=live` and `OUTBOUND_LIVE_OUTSIDE_PRODUCTION=true`, or put them on the list (deploy, then add them at
`/admin/outbound`, or set `OUTBOUND_ALLOWLIST_BOOTSTRAP` first). A staging whose super-admins sign in by phone OTP
needs their numbers in `OUTBOUND_ALLOWLIST_BOOTSTRAP`, or no code reaches them. Production needs nothing, unless it
sets `OUTBOUND_MODE`: remove any value but `live`.

**How to turn it back.** `OUTBOUND_MODE=live` with `OUTBOUND_LIVE_OUTSIDE_PRODUCTION=true` sends to everyone, as
before. The tables can stay; nothing reads them in `live` mode. The Resend change has no switch.

## 2026-11-13: plan gates and the seat limit are enforced; SSE broadcasts go to broadcast roles only

**What changes when you pull it.**

- **Routes that were open are plan-gated.** `@RequireFeature` now sits on the API-key routes (`api_keys`), webhook
  subscriptions (`webhooks`), OAuth clients (`oauth_clients`), the integrations routes and connecting one
  (`integrations`; the vendor callback stays open) and the voice token (`voice_mode`). A workspace whose plan lacks
  the feature gets a 403 with `code` `PLAN_UPGRADE_REQUIRED` and a `detail` naming the cheapest plan that has it; an
  expired trial gets `TRIAL_EXPIRED`, a suspended workspace `ACCOUNT_SUSPENDED`. The web turns
  `PLAN_UPGRADE_REQUIRED` and `USER_LIMIT_REACHED` into an upgrade prompt. Super-admins and single-tenant mode are
  not gated. With the shipped seed, Starter loses integrations, voice, API keys, webhooks and OAuth clients, and
  Professional loses API keys, webhooks and OAuth clients.

<!-- feature:desk:start -->

- **Desk routes are plan-gated** by `desk`, every one a person calls; the workflow engine's own signed callback stays
  open.

<!-- feature:desk:end -->

- **Seats are counted.** Creating a user, reactivating one and sending an invitation are refused with
  `USER_LIMIT_REACHED` once the workspace's active members plus pending, unexpired invitations reach its plan's
  `userLimit` (`plan_configs.user_limit`; null is unlimited). A workspace already over its limit keeps every member;
  only adding is refused.
- **One rule everywhere.** The route guard, the AI tool pipeline's plan step, the WhatsApp channel's entitlement and
  any job that calls `TenantEntitlementsService.hasFeature` / `assertFeature` judge a plan the same way: kill switch
  (feature flag), super-admin, single-tenant, plan status, plan entitlement. Plan errors carry `code` and `detail`
  only (no `featureKey`, `requiredPlan` or `message`). `PlanGuard`'s constructor now takes the
  `TenantEntitlementsService`; a product spec that builds it by hand passes one.
- **Desk and the audit log are plan features, not add-ons.** `ADDON_FEATURE_KEYS` is empty. No entitlement row is
  removed. `whatsapp_notifications` gains a row on every plan, enabled only on Enterprise, as it behaved before. In
  single-tenant mode the WhatsApp channel no longer also needs the Enterprise plan (single-tenant mode passes every
  plan check); it still needs the `whatsapp_channel` flag and a provider.
- **SSE tenant broadcasts reach broadcast roles only.** Each role is classified in
  `apps/backend/src/platform-glue/sse/sse-broadcast-roles.ts`; the starter's four roles are all `broadcast`, so
  nothing changes until you add a role. A role you add fails `sse-role-fanout.spec.ts` until you classify it.
  `SseService` now injects `SSE_TENANT_BROADCAST_ROLES` and `addClient` takes the connection's role.

**What to set first.** A product with live tenants sets `PLAN_ENFORCEMENT=log` before it deploys: each would-be
denial is then one warning with `event: plan.would_deny` (feature, plan, route, code) and the call goes through. Read
a week of them, fix the plans or the seed, then remove the key. Check `plan_configs.user_limit` for each plan first.

**How to turn it back.** `PLAN_ENFORCEMENT=log` lets every plan denial and the seat check through. Kill switches
(feature flags) and the WhatsApp channel's entitlement hold in both modes, as they did before.

## 2026-11-13: every request, job, tool call and timer runs in a declared tenant context (nothing enforced yet)

**What changes when you pull it.**

- **A tenant context exists.** `packages/appshore/kernel/src/infrastructure/rls/` holds a second AsyncLocalStorage,
  apart from the log context: the tenant DB id a unit of work runs as (`tenant`), `public`, or declared cross-tenant
  `system` work with a reason. Nothing in the database reads it yet; there is no policy, role or second pool. It is
  set by the auth guards (`jwt`, `api-key`, `oauth`, `refresh` from the session's workspace), by `withJobContext`
  (each job runs as the tenant its payload names, never its caller's), by the AI tool executor around the one tool
  call (`tool:<name>`), by the outbox relay (system reason `outbox-relay`, then each event as its emitter's tenant)
  and the deadline sweeper (`deadline-sweep`, then each handler as its row's tenant), and by the public invitation
  routes once the token names a tenant. Super-admin routes opt in with `@SystemScope(reason)` or `@TargetTenant`.
- **Every log line carries `rls.*` fields** inside a scope: `rls.kind` (`tenant`, `public`, `system` or `none`),
  `rls.tenant`, `rls.source`, `rls.reason`. `rls.kind=none` marks a request or job nobody declared.
- **Unit tests run in strict mode.** Each package's Jest setup sets `RLS_STRICT_CONTEXT=throw` (backend:
  `apps/backend/test/jest-env-defaults.js`, kernel and platform: `jest.setup-env.js`). A context conflict then
  throws: a second, different tenant in one scope, `runAsTenant` or `runAsPublic` inside another context, a system
  scope entered from a tenant request, an event handled under another tenant than its emitter's. A unit test that
  sets no context is not affected. A deployed task leaves the key unset: a conflict is logged and the first context
  kept (a system scope entered from a tenant request is logged and runs as system), so no live request fails on it.
- **`OutboxRelay` takes a third constructor argument**, `TenantIdResolver`. A product spec that builds the relay by
  hand passes one.

**What to set first.** Nothing. A product job that runs across tenants should wrap its work in `systemScope(reason)`
or `forEachTenant(reason, …)` with a reason it registers through `registerSystemReasons`; the coverage specs that
require it arrive in the next change.

**How to turn it back.** There is no switch, because nothing is enforced. To silence strict mode in a product's own
tests, remove the `setupFiles` entry; deployed tasks never set it.

## 2026-11-13: every job, table, event handler and super-admin route declares its tenant context

**What changes when you pull it.** Three architecture specs now fail `pnpm test` until your own code declares what
the foundation's already does. Nothing changes at run time for code that already passes them, and nothing is enforced
in the database.

- **Jobs** (`rls-job-context-coverage.spec.ts`). Every job name a handler lists (`readonly jobNames`) is declared in
  `apps/backend/src/platform-glue/queue/job-context.ts` (`APP_JOB_CONTEXT`): `tenant` (the payload names it),
  `forEachTenant` or `system` with a reason, or `noDatabase`. A reason must be entered by a `systemScope(reason, …)`
  or `forEachTenant(reason, …)` call; an app reason goes in `APP_SYSTEM_REASONS` there. The foundation's crons now
  run that way: `job-cleanup`, `data-retention`, `login-events-cleanup`, `tokens-cleanup`, the notifications
  `cleanup` and `whatsapp-stale-sweep` in `systemScope`, `trial-expiry` and `ai-credential-revalidate` list across
  tenants and then handle each tenant as itself. A new queue with its own `@Processor` is added to the spec's list.
- **Tables** (`rls-registry.spec.ts`). Every model in `app.prisma` gets a class in
  `apps/backend/src/platform-glue/database/app-rls-registry.ts` (`tenant`, `tenant_nullable`, `child` with its
  parent, `identity`, `identity_system`, `catalog`, `platform`), consistent with its `tenantId` column.
- **Event handlers** (`rls-context-coverage.spec.ts`). Every `@OnEvent` handler becomes `@OnTenantEvent` (it runs as
  the tenant its payload names), or goes on the spec's allow-list with a reason (no database access, or cross-tenant
  by design with its own `systemScope`). `eventEmitter.on(…)` and its siblings are refused. The AI budget nudge
  listener is now `@OnTenantEvent`: in strict mode (tests) an event with no usable tenant id throws; deployed, it is
  logged and ignored as before.
- **Super-admin routes** (same spec). A handler whose `@Roles` is exactly `SUPER_ADMIN` carries `@SystemScope(reason)`
  (it reads across tenants) or `@TargetTenant(param, 'id' | 'slug')` (it acts on the one tenant its URL names); a
  route open to any other role carries neither. Every foundation super-admin route is annotated.

**What to set first.** Nothing. Run `pnpm test` after the pull and add a declaration for each name the specs print.

**How to turn it back.** Revert the change. There is no switch, because nothing is enforced.

## 2026-11-14: array-form `$transaction` is banned

**What changes when you pull it.** `rls-no-array-transaction.spec.ts` (in `apps/backend/src/architecture/`) fails
`pnpm test` for any `prisma.$transaction([...])`, any `$transaction(ops)` whose argument is not an inline function,
and a bare `$transaction()`, in the backend, the foundation packages and their specs. Once a tenant setting is applied
per transaction, two array transactions started in the same tick by different tenants run under the first tenant's
context, and a one-element array is not a transaction at all on Prisma 7.3; the interactive form has neither problem.
The foundation's six array transactions (password reset, default payment method, workspace switch, plan assignment,
OAuth chain revocation, the login-activity page and total) are now interactive, with the same writes in the same
order. The shared `createMockPrisma()` no longer accepts an array: a unit test that passes one gets a `TypeError`.

**What to set first.** Nothing. Rewrite each call the spec prints as
`$transaction(async (tx) => { await tx.a.update(…); await tx.b.update(…); })`, using `tx`, never the root client,
inside the callback. A spec with its own `$transaction` mock that still has an array branch can drop it.

**How to turn it back.** Revert the change. Nothing at run time depends on it.

## 2026-11-14: production deploys are locked until `PRODUCTION_DEPLOYERS` is set; the tunnel's jump host is the API task

**What changes when you pull it.**

- **Deploy workflow.** A production run of `deploy-all.yml` fails in its first job unless the GitHub login that
  started it is in the repo variable `PRODUCTION_DEPLOYERS` (comma-separated). Unset, production is locked. Staging is
  unchanged.
- The migration jobs pick their SSM jump host from the API service only (`aws ecs list-tasks --service-name
<project>-<env>-ecs-service-api`). They used to take the first running task of any service, which could be the
  worker. Every `list-tasks` call in the workflow and in `tools/db/` must name its service
  (`.github/scripts/check-ecs-service-filter.sh`, in `pnpm check:ops` and the workflow's validate job).
- Each migration job syncs the knowledge base after the base seeds (`pnpm seed:knowledge`, once per deploy, never
  fatal; it needs `COHERE_API_KEY` in Doppler to embed). The job builds the foundation packages and runs a throwaway
  Redis for it.
- Production seeds run with `ENV_TYPE=production` and Doppler's `SUPER_ADMIN_PASSWORD`. Before, they ran with neither,
  so a super-admin created on a fresh production database got the shared dev password.
- Production seeds no longer create demo data. Seed `00-first-tenant` used to create, on any database, the ACTIVE
  ENTERPRISE "demo" and "demo-two" workspaces (multi-tenant) and the `owner@example.com`, `admin-user@example.com` and
  `member@example.com` users. With `ENV_TYPE=production` it now creates none of them: single-tenant gets only the
  implicit tenant row, multi-tenant gets nothing. Rows an earlier production seed wrote are not removed; check for a
  `demo` subdomain and those three emails, and delete or deactivate them by hand.
- The image is built with `docker/build-push-action` and the GitHub Actions cache, after a free-disk step; the build
  job times out after 40 minutes. The `BUILD_SHA` argument is kept.
- **`tools/db/migrate.sh` and `tools/db/tunnel.sh`.** Both take `--env staging|production` (migrate also `local`).
  The jump host is always a task of the API service; `--container` is gone and the default is no longer the worker.
  The database host must start with `<project>-<env>-`. An existing tunnel on the port is never reused, in staging
  too: close it first. Production tunnels on 5434, needs `production` typed (or `--yes` plus `CONFIRM_ENV=production`
  with no terminal) and, to seed, `SUPER_ADMIN_PASSWORD` in `apps/backend/.env.aws.production`.
- **New** `tools/ops/maintenance-mode.sh` (`on`, `off`, `status`) writes the maintenance document the web middleware
  already reads. It writes nothing when the document cannot be read for any reason other than "not found"; the
  operator role needs `s3:ListBucket` on the CDN bucket, or S3 reports a missing document as 403.

**What to set first.** Set `PRODUCTION_DEPLOYERS` before your next production deploy. Set `SUPER_ADMIN_PASSWORD` and
`COHERE_API_KEY` in each environment's Doppler config if you want a seeded super-admin password and embeddings. If your
Terraform `project` is not `app`, run the scripts with `PROJECT=<name>`. Deploy this before any change that turns off
ECS Exec on the worker.

**How to turn it back.** Revert the workflow and the two scripts. To keep the workflow but open production to
everyone who can run it, there is no switch: list the logins.

<!-- feature:desk:start -->

**Desk.** `DESK_SCHEDULER_ENABLED=false` (new, unset means on) keeps the Desk scheduler heartbeat from being
registered with Inngest and refuses turning a tenant's automatic schedule on with a 409 `INVALID_STATE`. Nothing
changes until you set it; unset it to turn back.

<!-- feature:desk:end -->

## 2026-11-14: worker task role and Exec, narrowed production trust, non-root container, local S3

Apply this after the previous entry (the deploy workflow's API-only jump host) is deployed in that environment: once
the worker loses ECS Exec, a migration job that still picks any running task can land on the worker and fail.

**What changes when you pull it.**

- **The container runs as `node`, not root.** `apps/backend/Dockerfile` copies every file with `--chown=node:node`
  and ends with `USER node`. The image keeps `COPY patches/` before the frozen install. If you added a step that
  writes outside `/app` or `/tmp` at runtime, or binds a port under 1024, it now fails; move it or give that path to
  `node`. `.github/scripts/check-dockerfiles.sh` (in `pnpm check:ops`) holds the `USER` line, the `--chown` copies
  and the `patches/` copy; `.github/scripts/check-container-user.sh` (the manual `container.yml` workflow, or by hand
  with Docker up) builds the image and checks `id -u` is not 0.
- **The worker has its own task role**, `<project>-<env>-iam-role-ecs-task-worker`, with the same grants the shared
  role had (ECS Exec channels, the documents bucket, and the two Bedrock statements under `bedrock_models` and
  `bedrock_tenant_roles_enabled`). The worker task definition uses it while `worker_own_task_role` is `true`, the
  default. The next apply creates the role and a new worker task-definition revision.
- **`PLATFORM_ASSUME_ROLE_ARN` lists both task role ARNs** (API first) on both task definitions, when
  `bedrock_tenant_roles_enabled` is on. The backend already reads it as a list and names every ARN in the trust
  policy it hands a workspace.
- **ECS Exec is off on the worker** (`worker_enable_exec`, default `false`) and stays on for the API
  (`api_enable_exec`, default `true`: the migration jobs and `tools/db/tunnel.sh` jump through it). Every Exec
  session is now written to a new log group, `/<project>/<env>/ecs-exec` (365 days in production, 30 in staging),
  and both task roles may write to it.
- **The production deploy role trusts two subjects only**: `repo:<repo>:ref:refs/heads/main` and
  `repo:<repo>:environment:production`. It used to trust `repo:<repo>:*`, so any branch or pull-request workflow in
  the repo could assume it. Staging keeps `repo:<repo>:*`. The deploy workflow already refuses production from any
  branch but `main`, so a normal deploy is unaffected.
- **RDS storage autoscaling is on**, up to `rds_max_allocated_storage` (default 200 GB; `0` turns it off). It is an
  in-place modification with no downtime; you pay only for storage RDS actually adds.
- **The deploy role may now** pass the worker role, create, tag and delete that one role, create the `ecs-exec` log
  group and update the cluster's Exec logging setting.
- **Local S3.** `docker compose up -d minio minio-init` starts a MinIO on `localhost:9300` (console `9301`) with the
  `app-files` bucket. Set `S3_ENDPOINT=http://localhost:9300` (new, optional; unset means real AWS S3) and the two
  MinIO keys in `apps/backend/.env` to use it; the storage service then addresses it path-style. MinIO no longer
  publishes images on Docker Hub, so the compose file uses `pgsty/minio`, a community build of the same server.

**What to set first.**

- **Run this one apply with admin credentials** in each environment. It changes the deploy role's own trust policy,
  which the deploy role may not change, and it creates the worker role and the log group before the deploy role's
  new grants exist. Later deploys run from CI as before.
- **A stack with workspace Bedrock roles already connected** (`bedrock_tenant_roles_enabled = true` and at least one
  workspace on `BEDROCK_ROLE`) switches in two steps, or worker-side calls on those credentials are denied and the
  daily revalidation sweep marks them failing:
  1. Apply with `worker_own_task_role = false`. The worker role is created and both ARNs are in
     `PLATFORM_ASSUME_ROLE_ARN`; the worker keeps running under `ecs_task`.
  2. Have each such workspace re-save its trust policy from the Settings sheet, which now lists both ARNs.
  3. Set `worker_own_task_role = true` (or remove the line) and apply.

  Any other stack keeps the default and switches in one apply.

- If something you run assumed the production deploy role from a branch other than `main` or from a job without the
  `production` environment, move it to one of those first.

**How to turn it back.** `worker_own_task_role = false` puts the worker back on the shared role (the worker role stays,
unused). `worker_enable_exec = true` turns Exec on the worker back on. `rds_max_allocated_storage = 0` turns storage
autoscaling off. The production trust has no switch; revert the `github_deploy_subjects` local in `iam.tf` to widen
it. To run the container as root again, remove the `USER node` line (`check:ops` then fails, on purpose).

## 2026-11-14: refresh rotation is atomic; provider errors, relay and timer failures are logged and reported as the runbooks say

**What changed.**

- **A refresh is one locked transaction.** `JwtTokenService.rotateRefreshToken` takes a per-user advisory lock
  (`pg_advisory_xact_lock(SESSION_LOCK_NAMESPACE, userId)`), checks that the presented token is still live, retires
  the rows it makes stale and issues the successor, all before it commits. `revokeFamily` and the workspace switch
  take the same lock. Before, a token validated a moment earlier could still get a live successor after a reuse or a
  logout had revoked its family, and a token retired as a sibling while it was being refreshed started a chain no
  later retire reached. Both now get a plain 401.
- **Presenting a token retires every older live row of its session**, not only its predecessor and siblings. A
  workspace switch rotates from the session's newest live row, which is not always the token the client holds; the
  token the client held is now retired when the switch's successor is first presented, so it no longer stays valid
  in the old workspace until it expires. The token's own successors are kept, so a lost response still does not log
  the client out.
- **A retired token re-sent after the session was fully revoked** (after a logout, or after an earlier reuse) is a
  plain 401. It writes no `REFRESH_REUSE` login event and reports nothing; there was nothing left to revoke.
- **Notification provider errors are logged as an `err` field** (`{ msg: 'Email delivery failed', err }`), on the
  email, SMS, push, in-app and WhatsApp paths. The log serializer masks addresses and numbers in `err`; it never saw
  the message text, where the provider's error used to go, so a rejected recipient's address reached the log.
- **The outbox relay and the deadline sweep report failures to Sentry** with `jobName` (`outbox-relay`,
  `deadline-sweep`), the row's tenant and `source: job`: one report per failed event or failed timer run (a kind
  with no handler included). The warning lines stay at warn level, now with an `err` field. The `outbox-backlog` and
  `deadline-sweep-late` runbooks search for warn as well as error, and the `deadline-sweep-late` rule description no
  longer says a failing handler trips it (failing timers are left out of its gauge; they show as FAILING on
  `/admin/timers` and in Sentry).
- **Shutdown no longer logs `Called end on pool more than once`.** `Mastra.shutdown()` closes the store it was
  given; `MastraProvider` closed it a second time.
- **`pnpm verify:api` and the seed need the database named.** `tools/verify/api-qa.sh` stops when `DATABASE_URL` or
  `REDIS_URL` is unset, and `prisma/seeds/index.ts` stops when `DATABASE_URL` is unset. Both used to fall back to
  the local compose ports, which on a shared machine can belong to another project's container.

**Who notices.**

- Code that calls the token service directly: `rotateRefreshToken` now takes the presented token's
  `previousTokenId` and returns `null` when that token is no longer live (answer 401); `retirePredecessor` is gone
  (the rotation does it); `revokeFamily(familyId, userId)` takes the user and returns how many rows it revoked; the
  workspace switch calls `issueSwitchSuccessor`.
- Anyone running `pnpm verify:api` or `pnpm db:seed` without an `apps/backend/.env`: export the two values from
  `apps/backend/.env.example` first.
- Sentry projects see a new issue per failing outbox event or timer kind, repeated on each retry (grouped).

**What to set first.** Nothing.

**How to turn it back.** Deploy the previous release. No schema or data change.

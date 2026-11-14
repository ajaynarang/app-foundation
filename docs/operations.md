# Operations

How to run a product built from this starter once it has real users. Each section is the procedure for one job.

## Duplicate accounts

The rule is one live account per email. A workspace is a membership of that one account (`WorkspaceMember`), not a
second account. Personal signup refuses a second account for a live email, and an invitation adds a membership to
the existing account.

The database holds the rule with a partial unique index, `users_email_live_key`, on `lower(email)` over the rows
that are not soft-deleted: a second live account on an address, in any case and any workspace, is refused. On a
fresh database the index is there from the first migrate.

A product that ran before this rule may still hold two or more live accounts behind one address. Then the migration
that adds the index (`users_email_unique_live`) skips it with a notice instead of failing the deploy, and the backend
logs one warning at boot while it is absent (`event: auth.email_uniqueness_unenforced`). Sign-in copes with the
duplicates in the meantime:

- The password is checked against every live account on the email. Exactly one match signs in.
- When the password matches accounts in more than one workspace, `POST /auth/login` answers 409
  `WORKSPACE_SELECTION_REQUIRED` with a `workspaces` list (`{ tenantId, name }`). The web form shows the list and
  signs in again with the chosen `tenantId`. The list is sent only after the password matched.
- On a tenant subdomain the web form sends that tenant's `tenantId` with every sign-in, and only accounts in that
  workspace count.
- Forgot-password sends one link per account, and each email names its workspace.

Merge them anyway: until every duplicate is gone, the database cannot enforce the rule, and a new duplicate can
still be written.

**List them.**

```bash
DATABASE_URL=postgresql://... pnpm accounts:duplicates          # readable list
DATABASE_URL=postgresql://... pnpm accounts:duplicates --json   # the same, as JSON
```

The report reads only. Emails compare case-insensitively and soft-deleted accounts do not count. For each shared
address it lists every account: its public user id, role, whether it is active, its workspace, how many memberships
it has, when it was created and when it last signed in.

**Merge one group.** There is no merge tool: the `User` model has about 25 relations in the foundation schema and a
product adds its own, so which rows move is the product's decision. For each address:

1. Pick the survivor, usually the account that signed in most recently or owns the most data.
2. For each other account, add its workspace to the survivor with `WorkspacesService.addMember` (same role), so the
   person keeps access to that workspace.
3. Revoke the other account's sessions (`JwtTokenService.revokeAllUserTokens(user.id)`, the numeric id).
4. Soft-delete the other account (set `deleted_at`). Its history rows stay attached to the soft-deleted row. Move
   any rows your product needs on the survivor before this step.
5. Run `pnpm accounts:duplicates` again. The address should be gone from the list.

Tell the person which workspace and password to use from now on: the survivor keeps its own password.

**Enforce the rule.** Once the report lists nothing:

```bash
DATABASE_URL=postgresql://... pnpm accounts:enforce-unique-email
```

It creates `users_email_live_key`. It refuses and changes nothing while any duplicate remains (exit 1), and does
nothing when the index is already there (exit 0), so it is safe to run twice. Building the index takes a short write
lock on `users`; on a large table run it in a quiet hour. The boot warning stops on the next deploy or restart.

To check by hand: `SELECT indexdef FROM pg_indexes WHERE indexname = 'users_email_live_key';` returns one row when
the rule is enforced.

## Outbound gate

Every email, text, push notification, WhatsApp message and customer webhook passes one check, the outbound gate,
just before its provider is called (ADR "Outbound gate"). Outside production it stops a test environment from
messaging real people.

**Modes.** `OUTBOUND_MODE` is `live` (send to everyone) or `allowlist` (send only to the allow-list). Unset means
`live` when `ENV_TYPE=production` and `allowlist` for `sandbox`, `preprod` and `development`. The backend refuses to
boot in production with `allowlist`, and outside production with `live` unless `OUTBOUND_LIVE_OUTSIDE_PRODUCTION=true`
is set too. Set that pair only on an environment that really serves people (a staging about to become production),
and remove it after.

**The allow-list.** Super-admins edit it at `/admin/outbound`: an exact email, an email domain (with its subdomains;
public mail domains such as `gmail.com` are refused), a phone number in E.164 form, or a web host for webhooks. Push
reaches a user whose email or phone is on the list. An edit applies within 30 seconds on every task. An empty list
sends nothing.

`OUTBOUND_ALLOWLIST_BOOTSTRAP` adds entries from the environment, a comma list such as
`ops@example.com,@example.com,+919812345678,hooks.example.com`. Use it for the first super-admin of a new staging
environment who signs in by phone OTP, before anyone can sign in to edit the list. If the allow-list table cannot be
read, only these entries pass.

**What happens to a held-back send.**

- Sent through the notification pipeline (in-app triggers, reminders, WhatsApp): the delivery ledger
  (`notification_deliveries`) records it `SKIPPED` with `failure_reason = 'GATED'`.
- Sent directly (sign-in codes, invitations, password resets, customer webhooks): the gate records it in
  `outbound_suppressions`, shown under Held back on `/admin/outbound`, with the recipient masked and codes and links
  removed from the preview. The data-retention job deletes these rows after 30 days. A held-back webhook also closes
  its delivery log entry with "Held back by the outbound gate".

What is sent in `allowlist` mode is marked: `[STAGING]` before an email subject, `STG:` before a text, `[STG]` before
a push title. WhatsApp templates are pre-approved and go unchanged.

**On a laptop.** With `ENV_TYPE=development` and no email or SMS provider, messages are printed to the log as before;
that path is never gated. Set a provider key locally and the gate applies: allow-list your own address, or set
`OUTBOUND_ALLOWLIST_BOOTSTRAP`.

## Deploy

Backend deploys run from the manual workflow `.github/workflows/deploy-all.yml` (Actions tab, or
`gh workflow run deploy-all.yml -f environment=staging`). It never runs on a push.

**Branches.** Staging deploys only from `develop`, production only from `main`. The starter has no `develop` branch:
create it (`git switch -c develop main && git push -u origin develop`) before the first staging deploy.

**Who may deploy production.** The repo variable `PRODUCTION_DEPLOYERS` (Settings → Secrets and variables →
Actions → Variables) is a comma-separated list of GitHub logins. The workflow's first job
(`.github/scripts/check-production-deployer.sh`) fails a production run started by anyone else. Unset, every
production deploy fails: production is locked until someone sets it. Required reviewers on the `production`
environment, where your GitHub plan offers them, are a second gate on top, not a replacement.

**Order.** Build and push the image, then run the migrations, then roll the services. The `migrate-*` jobs are
`needs` of the `deploy-*` jobs, so the new image always finds the schema it expects. The cost: for a few minutes the
previous release's tasks run against the new schema. So a migration must be safe for the code of the release before
it. Add a column before the code that writes it; drop one only in a release after the code stopped reading it.

The worked example is the `ai_reader` role. The release that stopped switching to it had to be fully deployed in
every environment before the release whose migration drops it; pulled together, old tasks would have failed their
tool calls. `docs/upgrade-notes/ai-platform.md` ("Deploy order for `ai_reader`") has the steps. Nothing in the
workflow enforces an order like this; the rule above is the guard. No operator script creates, grants or switches to
a database role (`tools/verify/check-no-db-roles.sh`, in `pnpm check:ops`).

**What a migration job does.** It opens an SSM tunnel to the private database through a running task of the API
service (`<project>-<env>-ecs-service-api`; never the worker, whose ECS Exec is off), then runs
`prisma migrate deploy`, the base seeds and the knowledge-base sync.

- Production seeds run with `ENV_TYPE=production`, so no dev credential and no demo data is seeded: no "demo"
  workspace and no owner, admin or member user (single-tenant gets only the implicit tenant row). A super-admin the
  seed creates gets `SUPER_ADMIN_PASSWORD` from Doppler, or no password when it is not set (the job warns).
- The knowledge-base sync (`pnpm seed:knowledge`) runs once per deploy, after the seeds. It is incremental, so an
  unchanged corpus is a no-op. It never fails the deploy: on failure the job warns, adds a `kb-sync-failed` Grafana
  annotation and sends a sev2 notification (each a no-op until its values exist), and the assistant keeps the
  previous knowledge base. Without `COHERE_API_KEY` in Doppler the sync stores text with no embeddings (full-text
  search only) and the job warns.

**Build.** The image is built with BuildKit and the GitHub Actions layer cache, tagged with the git SHA, and carries
it as `SENTRY_RELEASE`. The build job stops after 40 minutes rather than hanging on a lost runner.

## Database migrations and the tunnel

Use `tools/db/migrate.sh`, not `prisma migrate dev`, against any shared database.

```bash
./tools/db/migrate.sh --env local                  # migrate + seed + knowledge base + Langfuse
./tools/db/migrate.sh --env staging --dry-run      # pending staging migrations, nothing applied
./tools/db/migrate.sh --env staging                # full run on staging
./tools/db/migrate.sh --env production --status    # read-only
./tools/db/tunnel.sh                               # staging database on localhost:5433
./tools/db/tunnel.sh --env production              # production database on localhost:5434
```

- `DATABASE_URL` comes from `apps/backend/.env.aws.<staging|production>` (gitignored). Copy it from that environment's
  Doppler config. The host must be one of that environment's instances (`<project>-<env>-…`); a file copied from the
  other environment stops the run. Set `PROJECT` when your Terraform `project` variable is not `app`.
- Staging tunnels on port 5433, production on 5434. An existing tunnel on the port is never reused: close it first.
- The jump host is a running task of the API service. `--container` is gone.
- Production: every run that writes needs `production` typed, even with `--yes`. With no terminal (a script) it needs
  `--yes` and `CONFIRM_ENV=production`. Seeding production needs `SUPER_ADMIN_PASSWORD` in `.env.aws.production`,
  runs with `ENV_TYPE=production` (no demo workspace, no demo users) and never resets. Langfuse keys come only from that file.
- The knowledge-base sync runs after the seeds in the full and seed-only modes, in every environment. A failure warns
  and does not stop the run.

## Maintenance switch

`tools/ops/maintenance-mode.sh` turns maintenance mode on or off for the web app. It writes
`status/maintenance.json` in the environment's CDN bucket (`<project>-<env>-cdn`); `apps/web/src/middleware.ts` reads
its `enabled` key and sends signed-in routes to `/maintenance`. The web app needs `NEXT_PUBLIC_CDN_URL` to read it.

```bash
tools/ops/maintenance-mode.sh on "Database upgrade" 2h   # reason and estimate shown on /maintenance
tools/ops/maintenance-mode.sh off
tools/ops/maintenance-mode.sh status
ENV=production tools/ops/maintenance-mode.sh on          # asks you to type 'production'
```

Every write reads the document first and changes only its own keys (`enabled`, `reason`, `message`,
`estimatedEndTime`, `startedAt`), so keys a product adds survive. Each write invalidates `/status/*` on the CDN; the
document's own cache is 30 seconds. With no terminal, a production write needs `CONFIRM_ENV=production`.

## Process switches

- `QUEUE_PROCESSORS_ENABLED`: `false` makes a process producer-only. Unset means it consumes, so `pnpm dev` keeps
  running jobs. Set it only through Terraform (`api_queue_processors_enabled`, shipped `true`), never in Doppler:
  Doppler values override the container environment, and the worker would stop consuming too. Turn it off only once a
  worker task runs (`worker_desired_count > 0`).
- `OPS_GAUGES_FROM_API`: set by Terraform only, on the API task, exactly when `worker_desired_count = 0`, so the
  queue, cron, outbox and deadline gauges still come from one process (`docs/observability.md`).

<!-- feature:desk:start -->

- `DESK_SCHEDULER_ENABLED`: `false` stops the Desk scheduler heartbeat from being registered with Inngest, so the
environment pays for no cron tick, and turning a tenant's automatic schedule on is refused with a 409. Pausing,
Run now and event-driven Desk runs still work. Unset means on. Use it on an environment that does not use automatic
Desk runs.
<!-- feature:desk:end -->

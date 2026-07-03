# What you get with the AppShore Platform Starter

This repo is the **AppShore Platform Starter** — the golden path for new AppShore products. You clone it, run one command, and you have a working
product skeleton — backend API, web app, admin console, and a mobile app — with all the boring,
hard, cross-cutting stuff already built, tested, and wired together. You only write the part
that makes your product _your product_.

There is deliberately **no business logic** in here. No "orders", no "projects", no "patients".
That empty space is where your app goes.

---

## Start a new app in 5 minutes

```bash
git clone <this-repo> my-app && cd my-app
pnpm init-app          # answers: name, display name, multi-tenant or not, keep mobile app?
pnpm install
pnpm docker:up         # Postgres + Redis (+ optional Grafana stack)
cd apps/backend && pnpm prisma:migrate:deploy && pnpm db:seed && cd ../..
pnpm dev               # backend :8000, web :3000, console :3002
```

`init-app` asks a few questions and rewrites the whole repo for you:

| Question               | What it changes                                                    |
| ---------------------- | ------------------------------------------------------------------ |
| App name (`acme-crm`)  | package names, docker containers, Terraform, Doppler project names |
| Display name           | every place the UI says "Platform"                                 |
| Multi-tenant? (mt/st)  | `MULTI_TENANT` env defaults — same code runs either way            |
| Keep mobile app? (y/n) | keeps + renames `apps/mobile`, or deletes it                       |
| Database name          | `DATABASE_URL` / `POSTGRES_DB` everywhere                          |

After that you have a running product with a login page, registration, settings, billing,
an AI assistant, and an ops console — before you've written a single line of code.

---

## What your new app already has

### Sign-in and users (done)

- JWT auth with refresh tokens, phone OTP (Twilio), and Firebase token exchange.
- Registration + invitations (email/SMS), roles (`OWNER / ADMIN / MEMBER / SUPER_ADMIN`),
  login-event history ("new device signed in"), API keys, and a full **OAuth provider**
  (your app can be "Sign in with X" for others, including MCP clients like Claude).
- Every route is guarded by default: `Throttler → Jwt → Tenant → Roles → Plan`.

### Multi-tenancy (done, optional)

- Tenants resolve from the subdomain (`acme.yourapp.com`); every table is tenant-scoped.
- Flip `MULTI_TENANT=false` + `IMPLICIT_TENANT_ID=1` and the exact same code runs
  single-tenant — no query changes needed.

### Plans, billing, and money (done)

- Stripe subscriptions, invoices, payment methods, a credit **wallet**, add-ons,
  plan entitlements ("PRO gets 10 seats"), trial handling, and dunning.
- `@RequirePlan()`-style gating is already enforced by the guard chain.

### AI assistant (done, extend it)

- A streaming chat assistant (Anthropic + AI SDK + Mastra) with conversation history,
  a Markdown **knowledge base** (drop files, run `pnpm seed:knowledge`), moderation,
  per-tenant **AI budgets** (soft/hard caps), model-pricing ledger, Langfuse tracing,
  and human-in-the-loop approval for risky agent actions.
- An **MCP server** with an empty toolset — add `@Tool` providers and your app is
  instantly usable from Claude and other MCP clients.
- **Desk**: an Inngest-powered durable agent workflow engine (episodes, approvals,
  memory, suppressions) with an empty responsibility registry to fill in.

### The plumbing every product needs (done)

- **Background jobs**: BullMQ queues with schedules, retries, dead-letter handling,
  a Bull Board dashboard, and data-retention cleanup.
- **Notifications**: one dispatcher, four channels — in-app, push, SMS, email.
- **Realtime**: SSE streams to the browser, bridged from domain events.
- **Domain events**: an event registry + outbound **webhooks** (per-tenant
  subscriptions with delivery logs and SSRF protection).
- **Files**: S3 uploads with presigned URLs.
- **Observability**: OpenTelemetry traces, structured pino logs, Loki/Tempo/Grafana
  docker profile, health endpoints (`/api/v1/health/live`, `/health/ready`).
- **Support & feedback**: ticketing + in-app feedback with AI summarization.
- **Admin console** (`apps/console`): super-admin app for tenants, jobs, events,
  cache, schedules, announcements, and AI spend.

### Four apps out of the box

| App            | What it is                                                     |
| -------------- | -------------------------------------------------------------- |
| `apps/backend` | NestJS 11 API — your domains live in `src/domains/`            |
| `apps/web`     | Next.js 15 product app — login, register, settings, AI chat    |
| `apps/console` | Next.js 15 super-admin/ops hub                                 |
| `apps/mobile`  | Flutter companion — status screen + phone-OTP sign-in scaffold |

### Infrastructure as code (done)

- `docker-compose.yml` for local dev (Postgres 16 + pgvector, Redis 7, Inngest, Grafana stack).
- Terraform for AWS (ECS, RDS, ElastiCache, S3, ALB, CloudWatch) — parameterized by app name.
- GitHub Actions CI (lint, type-check, tests, migrations) and a deploy pipeline.

---

## The default Postgres schema (what's already in your database)

The schema lives in `packages/appshore/db/prisma/schema/` — `foundation.prisma` is the
platform's (don't edit), **`app.prisma` is yours** (empty, waiting for your models).
Everything is Prisma; the client is imported from `@appshore/db`.

~68 foundation tables, in plain words:

| Group                | Tables (main ones)                                                                                                                                                | What they store                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Identity & tenancy   | `Tenant`, `User`, `RefreshToken`, `LoginEvent`, `UserInvitation`, `ApiKey`, `UserPreferences`, `SuperAdminPreferences`                                            | who your users are, which tenant they belong to        |
| OAuth provider       | `OAuthClient`, `OAuthAuthorizationCode`, `OAuthAccessToken`, `OAuthRefreshToken`                                                                                  | third-party apps signing in through you                |
| Plans & entitlements | `PlanConfig`, `PlanEntitlement`, `TenantPlanEvent`, `AddOn`, `TenantAddOn`, `AddOnRequest`                                                                        | what each plan allows, plan history, add-ons           |
| Billing & money      | `BillingCustomer`, `BillingSubscription`, `BillingInvoice`, `PaymentMethod`, `Wallet`, `WalletTransaction`, `ProcessedBillingEvent`                               | Stripe mirror + credit wallet                          |
| Feature flags        | `FeatureFlag`                                                                                                                                                     | per-tenant on/off switches                             |
| Notifications        | `Notification`, `PushSubscription`                                                                                                                                | in-app inbox + browser push targets                    |
| AI                   | `Conversation`, `ConversationMessage`, `ConversationSession`, `KnowledgeDocument`, `AiInvocation`, `ModelPricing`, `TenantAiBudget`                               | chat history, RAG docs (pgvector), spend ledger + caps |
| Desk (agent engine)  | `DeskAgent`, `DeskResponsibility`, `DeskEpisode`, `DeskEpisodeStep`, `DeskApproval`, `DeskMemory`, `DeskEntitySuppression`, `AgentInvocationLog`, `HitlChallenge` | durable agent workflows + approvals                    |
| Jobs & events        | `Job`, `JobSchedule`, `TenantJobRun`, `DomainEventLog`, `DeadLetterLog`, `TenantCounter`                                                                          | background-job state + event audit trail               |
| Webhooks             | `WebhookSubscription`, `WebhookDeliveryLog`                                                                                                                       | tenants subscribing to your events                     |
| Integrations         | `IntegrationConfig`, `IntegrationVendor`, `IntegrationEntityMapping`, `VendorConfig`                                                                              | connector framework (vendor registry is empty — yours) |
| Support & comms      | `SupportTicket`, `SupportTicketMessage`, `Feedback`, `Announcement`, `Document`                                                                                   | tickets, feedback, banners, file metadata              |

Rules the schema linter enforces: every table is tenant-scoped (`tenantId`) unless it's global
reference data; IDs are Int autoincrement (operational) or UUIDv7 (audit/event tables); camelCase
fields with `@map` for snake_case columns.

---

## How the code is organized (30-second tour)

```
packages/appshore/     ← the platform (@appshore/*). You rarely touch this.
  kernel/    pure mechanics: logging, events, retry, SSE, utils
  db/        THE Prisma package: schema, migrations, seeds, client
  platform/  auth, tenancy, queues, storage, health, users/tenants/plans APIs
  web-core/  web api client, realtime, hooks, session bridge
apps/
  backend/src/domains/       ← YOUR backend code goes here
  backend/src/platform-glue/ ← your event names, queue topology, hook bindings
  web/src/features/          ← YOUR web features go here
  mobile/lib/features/       ← YOUR mobile screens go here
```

One rule keeps it clean (and a CI test enforces it): **foundation packages never import app
code**. Where the platform needs app behavior (e.g. "send a notification when a user joins"),
it exposes a hook and `platform-glue/hooks.module.ts` binds your implementation.

---

## Carving out your application (your first domain)

Say you're building "projects":

1. **Models** — add `Project` to `packages/appshore/db/prisma/schema/app.prisma`
   (include `tenantId`), then `pnpm --filter @appshore/db prisma:migrate` and
   `pnpm --filter @appshore/db prisma:generate`.
2. **Backend** — create `apps/backend/src/domains/projects/` (module, controller,
   service; extend `BaseTenantController` from `@appshore/platform`; import the
   Prisma client from `@appshore/db`). Register the module in `app.module.ts`.
3. **Events** — add `app.project.created` to `APP_EVENT_REGISTRY` in
   `apps/backend/src/platform-glue/events/event-registry.ts`; you get typed
   `DOMAIN_EVENTS.PROJECT_CREATED`, SSE + webhooks for free.
4. **Web** — create `apps/web/src/features/projects/` (pages, hooks with TanStack
   Query calling `apiClient` from `@appshore/web-core`, shadcn/ui components).
5. **Mobile (optional)** — `apps/mobile/lib/features/projects/` using the same
   `ApiClient`.
6. **AI (optional)** — expose it to the assistant with a `@Tool` provider in
   `domains/ai/mcp/mcp-tools.module.ts`.

That's the whole loop. Auth, tenant scoping, rate limits, plan gating, toasts, and
observability are already handled around your code.

---

## Day-to-day commands

| Task                    | Command                                      |
| ----------------------- | -------------------------------------------- |
| Run everything          | `pnpm dev`                                   |
| DB migration            | `pnpm --filter @appshore/db prisma:migrate`  |
| Regenerate client+enums | `pnpm --filter @appshore/db prisma:generate` |
| Seed platform data      | `pnpm backend:seed`                          |
| All tests               | `pnpm test` (backend + foundation packages)  |
| E2E / RBAC / smoke      | `pnpm test:qa`                               |
| Mobile                  | `pnpm mobile:dev` / `pnpm mobile:test`       |
| Prisma Studio           | `pnpm backend:prisma:studio`                 |

More depth: [`CLAUDE.md`](../CLAUDE.md) (conventions + full map),
[`docs/superpowers/specs/`](./superpowers/specs/) (architecture decisions),
[`tools/init-app/README.md`](../tools/init-app/README.md) (the rename tool).

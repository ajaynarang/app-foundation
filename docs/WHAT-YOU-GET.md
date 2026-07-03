# What you get — and what you build

This repo is the **AppShore Platform Starter** — the golden path for new AppShore products.
Clone it, run one command, and you have a working product skeleton: backend API, web app,
admin console, and a mobile app, with the hard cross-cutting work already done, tested, and
wired together. **There is no business logic in here** — no "orders", no "projects". That
empty space is yours.

This page is the whole map: what's already built ✅, what turns on with an API key ⚙️, and
what you build ✎. Read it top to bottom and you know exactly where you stand.

---

## Start in 5 minutes (and log in immediately)

```bash
git clone <this-repo> my-app && cd my-app
pnpm install
pnpm init-app                                  # name, display name, multi-tenant?, mobile app?
pnpm docker:up                                 # Postgres 16 (pgvector) + Redis 7
cd apps/backend && cp .env.example .env && cd ../..
cp apps/web/.env.example apps/web/.env.local
pnpm backend:prisma:generate
cd apps/backend && pnpm prisma:migrate:deploy && pnpm db:seed && cd ../..
pnpm dev                                       # backend :8000 · web :3000 · console :3002
```

The seed prints ready-to-use **dev credentials** (non-production only):

| Who                  | Email               | Password       |
| -------------------- | ------------------- | -------------- |
| Workspace owner      | `owner@example.com` | `Password123!` |
| Platform super admin | `admin@example.com` | `Password123!` |

Phone sign-in also works out of the box: `+1 555 555 0100`, PIN `1234` (mock OTP `123456`).
Open `http://localhost:3000/login`, sign in as the owner, and you're inside a live workspace
("Demo Workspace" in multi-tenant mode; "Default Workspace" in single-tenant mode).

---

## ✅ What's already built (you ship this on day one)

**Identity & access**

- First-party **email + password** auth (bcrypt, forgot/reset password, change password,
  session revocation) — works with zero external services.
- Phone **OTP** and **PIN** login; **Firebase** token exchange as an optional alternative.
- JWT access + rotating refresh tokens (hashed at rest, httpOnly cookie), login-event history.
- Roles (`OWNER / ADMIN / MEMBER / SUPER_ADMIN`), invitations (email/SMS), **API keys**
  with scopes/rotation, and a full **OAuth 2.1 provider** (PKCE — your app can be
  "Sign in with X" for MCP clients like Claude).
- Every route guarded by default: `Throttler → Jwt → Tenant → Roles → Plan`.

**Multi-tenancy (or not) — one env var**

- Multi-tenant (default): subdomain tenants, self-registration + super-admin approval,
  per-tenant everything.
- Single-tenant (`MULTI_TENANT=false`): one implicit workspace; registration endpoints and
  UI disappear; the same code and queries run unchanged.

**Plans & billing**

- Plan configs + entitlements (feature gating enforced in the guard chain), trials, add-ons
  data model, Stripe subscriptions/invoices/payment methods, credit **wallet**, dunning.

**AI**

- Streaming chat assistant (Anthropic + AI SDK + Mastra) with conversation history, voice
  (Deepgram/Cartesia/LiveKit scaffolding), @-mentions, product tour.
- Markdown **knowledge base** (pgvector RAG) — drop files, run `pnpm seed:knowledge`.
- Per-tenant **AI budgets** (soft/hard caps), model-pricing spend ledger, moderation,
  human-in-the-loop approval for risky agent actions, Langfuse tracing.
- **MCP server** with two sample tools (health, knowledge search) — add `@Tool` providers
  and your app is callable from Claude.
- **Desk**: durable agent workflow engine on Inngest (episodes, approvals, memory,
  suppression) with one sample responsibility (`welcome`).

**The plumbing**

- BullMQ **background jobs** (queues: events, notifications, webhooks, ai-interactive,
  ai-background, bulk-ops) with schedules, retries, dead-letter log, Bull Board dashboard.
- **Domain events**: typed registry → SSE realtime to the browser + per-tenant outbound
  **webhooks** (delivery logs, SSRF-guarded).
- **Notifications**: one dispatcher — in-app inbox, browser push, SMS, email.
- S3 **file storage** with presigned URLs; **integrations framework** with one worked
  example connector (QuickBooks OAuth) showing the adapter pattern.
- **Search endpoint** with a provider extension point (returns empty until you register
  your domain searchers).
- **Support tickets** + in-app **feedback** (AI-summarized) + announcements/banners.
- OpenTelemetry traces, structured pino logs, Loki/Tempo/Grafana docker profile, health
  endpoints (`/api/v1/health/live`, `/health/ready`).

**Four apps**

| App            | What it is                                                                            |
| -------------- | ------------------------------------------------------------------------------------- |
| `apps/backend` | NestJS 11 API — your domains go in `src/domains/`                                     |
| `apps/web`     | Next.js 15 product app — login, registration, settings (15 pages), AI chat, admin     |
| `apps/console` | Next.js 15 super-admin/ops hub + API docs playground                                  |
| `apps/mobile`  | Flutter companion — status screen + phone sign-in, your screens go in `lib/features/` |

**Delivery**

- docker-compose dev stack, Terraform for AWS (ECS/RDS/ElastiCache/S3/ALB), GitHub Actions
  CI (lint, type-check, unit suites, Flutter analyze/test) + deploy pipeline, Playwright QA
  suite (auto-generated RBAC matrix over every controller, smoke, API tests).

---

## ⚙️ Works when you add a key (all optional)

| Capability        | Env keys (see `apps/backend/.env.example`) | Without it                         |
| ----------------- | ------------------------------------------ | ---------------------------------- |
| Real SMS / OTP    | `TWILIO_*`                                 | mock OTP `123456` (non-prod only)  |
| Email delivery    | `SMTP_*` or `RESEND_API_KEY`               | emails logged to server console    |
| AI assistant      | `ANTHROPIC_API_KEY`                        | chat UI loads, replies unavailable |
| Firebase login    | `FIREBASE_*` (backend + web)               | email/password + phone still work  |
| Stripe billing    | `STRIPE_*`                                 | plans/entitlements still enforced  |
| File uploads      | `AWS_*` / S3 bucket                        | uploads unavailable                |
| Voice assistant   | `DEEPGRAM_*`, `CARTESIA_*`, `LIVEKIT_*`    | text chat only                     |
| LLM observability | `LANGFUSE_*`                               | local prompt fallback used         |
| Bot protection    | `TURNSTILE_SECRET_KEY`                     | registration unprotected           |
| Error tracking    | Sentry (scaffold in web-core)              | console logging                    |

---

## ✎ What you build (the actual product)

1. **Your data** — models in `packages/appshore/db/prisma/schema/app.prisma`
   (`foundation.prisma` is platform-owned; don't edit). Every tenant-owned table gets a
   `tenantId`. Then `pnpm --filter @appshore/db prisma:migrate` + `prisma:generate`.
2. **Your backend domain** — a module under `apps/backend/src/domains/<your-domain>/`
   (controller extends `BaseTenantController` from `@appshore/platform`, Prisma client from
   `@appshore/db`), registered in `app.module.ts`.
3. **Your events** — entries in `APP_EVENT_REGISTRY`
   (`apps/backend/src/platform-glue/events/event-registry.ts`); typed `DOMAIN_EVENTS`
   constants, SSE and webhooks come free.
4. **Your web features** — `apps/web/src/features/<your-domain>/` (TanStack Query +
   `apiClient` from `@appshore/web-core`, shadcn/ui components). Replace the landing page
   (`apps/web/src/app/page.tsx`) and the legal placeholder copy.
5. **Your mobile screens** — `apps/mobile/lib/features/<your-domain>/`.
6. **Your AI surface** — `@Tool` providers in `domains/ai/mcp/mcp-tools.module.ts`, desk
   responsibilities in `domains/desk/responsibilities/`, knowledge-base content, search
   providers for @-mentions.
7. **Your integrations** — connectors in `domains/integrations/` `VENDOR_REGISTRY`
   (QuickBooks sample shows the pattern).
8. **Branding** — `init-app` does the renames; you bring logo, colors (tailwind preset in
   `packages/ui`), and real legal pages.

### Your first domain, end to end (~an hour)

Say you're building "projects": add a `Project` model to `app.prisma` → migrate → create
`domains/projects/` module with CRUD (copy the support domain as a reference — it's the
smallest) → add `app.project.created` to the event registry → build
`features/projects/` list+detail pages in web → done: auth, tenant scoping, rate limits,
plan gating, toasts, realtime, and observability were already handled around your code.

---

## The default Postgres schema (~60 tables, all foundation)

Lives in `packages/appshore/db/prisma/schema/` — **`app.prisma` is yours**, everything else
is platform-owned. Import the client and enums from **`@appshore/db`** (never
`@prisma/client` directly).

| Group                   | Main tables                                                                                                                                                                            | Purpose                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Identity & tenancy      | `Tenant`, `User`, `RefreshToken`, `PasswordResetToken`, `LoginEvent`, `UserInvitation`, `ApiKey`, `UserPreferences`                                                                    | who users are, which tenant owns them     |
| OAuth provider          | `OAuthClient`, `OAuthAuthorizationCode`, `OAuthAccessToken`, `OAuthRefreshToken`                                                                                                       | third-party / MCP sign-in through you     |
| Plans & billing         | `PlanConfig`, `PlanEntitlement`, `TenantPlanEvent`, `AddOn`, `TenantAddOn`, `BillingCustomer`, `BillingSubscription`, `BillingInvoice`, `PaymentMethod`, `Wallet`, `WalletTransaction` | entitlements, Stripe mirror, credits      |
| Feature flags           | `FeatureFlag`                                                                                                                                                                          | per-tenant switches                       |
| Notifications           | `Notification`, `PushSubscription`                                                                                                                                                     | inbox + push targets                      |
| AI                      | `Conversation`, `ConversationMessage`, `ConversationSession`, `KnowledgeDocument`, `AiInvocation`, `ModelPricing`, `TenantAiBudget`                                                    | chat, RAG (pgvector), spend ledger + caps |
| Desk (agent engine)     | `DeskAgent`, `DeskResponsibility`, `DeskEpisode`, `DeskEpisodeStep`, `DeskApproval`, `DeskMemory`, `DeskEntitySuppression`, `AgentInvocationLog`, `HitlChallenge`                      | durable agent workflows + approvals       |
| Jobs & events           | `Job`, `JobSchedule`, `TenantJobRun`, `DomainEventLog`, `DeadLetterLog`, `TenantCounter`                                                                                               | background-job state + audit trail        |
| Webhooks & integrations | `WebhookSubscription`, `WebhookDeliveryLog`, `IntegrationConfig`, `IntegrationVendor`, `VendorConfig`                                                                                  | outbound events, connector framework      |
| Support & comms         | `SupportTicket`, `SupportTicketMessage`, `Feedback`, `Announcement`                                                                                                                    | tickets, feedback, banners                |

Conventions (enforced by the schema linter + CI guardrail tests): tenant scoping on every
non-global table; Int autoincrement for operational tables, UUIDv7 for audit/event tables;
camelCase fields `@map`ped to snake_case columns; money in integer cents; **tenants are
suspended, never hard-deleted**.

---

## How the code is organized (30 seconds)

```
packages/appshore/      ← the AppShore Platform (@appshore/*). Build ON it, don't edit it.
  kernel/    pure mechanics: logging, event/queue/cache mechanics, retry, SSE, utils
  db/        THE Prisma package: schema, migrations, seeds, generated client
  platform/  auth, tenancy, database, queues, storage, health, users/tenants/plans APIs
  web-core/  web api client, realtime/SSE, hooks, session bridge
packages/{ui,shared-types,test-utils}   ← yours (renamed/themed per product)
apps/
  backend/src/domains/        ← YOUR backend code
  backend/src/platform-glue/  ← your event names, queue topology, hook bindings, search providers
  web/src/features/           ← YOUR web features
  mobile/lib/features/        ← YOUR mobile screens
```

One rule, CI-enforced (`apps/backend/src/architecture/foundation-boundaries.spec.ts`):
**platform packages never import app code** — `kernel ← db ← platform ← apps`. Where the
platform needs app behavior (a user joined, a tenant was approved), it exposes a hook and
`platform-glue/hooks.module.ts` binds your implementation.

---

## Day-to-day commands

| Task                      | Command                                      |
| ------------------------- | -------------------------------------------- |
| Run everything            | `pnpm dev`                                   |
| New migration             | `pnpm --filter @appshore/db prisma:migrate`  |
| Regenerate client+enums   | `pnpm --filter @appshore/db prisma:generate` |
| Seed (prints credentials) | `pnpm backend:seed`                          |
| All unit tests            | `pnpm test`                                  |
| E2E / RBAC / smoke        | `pnpm test:qa`                               |
| Mobile                    | `pnpm mobile:dev` / `pnpm mobile:test`       |
| Prisma Studio             | `pnpm backend:prisma:studio`                 |
| Background worker (prod)  | `pnpm --filter @app/backend start:worker`    |

Deeper reading: [`CLAUDE.md`](../CLAUDE.md) (conventions + full domain map) ·
[`docs/superpowers/specs/`](./superpowers/specs/) (architecture decision records) ·
[`tools/init-app/README.md`](../tools/init-app/README.md) (the rename tool) ·
[`docs/doppler.md`](./doppler.md) (secrets).

# AI Context — AppShore Platform Starter (app-foundation)

A domain-free **platform starter** built on the **AppShore foundation packages**: clone this,
run `pnpm init-app`, drop in your domain, and you have auth, multi-tenancy, billing, AI chat +
MCP, background jobs, observability, and IaC already built. There is intentionally **no business
domain** here — add yours under `apps/backend/src/domains/` and `apps/web/src/features/`.

The reusable cross-cutting foundation lives in `packages/appshore/` (`@appshore/*`) — those
packages are the platform, not your app. Layer rule (enforced by
`apps/backend/src/architecture/foundation-boundaries.spec.ts`):
`kernel ← db ← platform ← apps` and `kernel ← web-core ← web`. Packages never import app code.

---

## What this is

A full-stack monorepo extracted from a production platform with all business-domain code
removed. Everything cross-cutting remains and works:

- **Auth** — JWT + refresh, Firebase exchange, phone PIN/OTP, login-event tracking, OAuth provider.
- **Multi-tenancy** — tenant-scoped data + a global guard chain. Toggle with `MULTI_TENANT`
  (see below) to run single-tenant from the same code.
- **AI** — a working streaming chat assistant (Mastra + AI SDK + Anthropic, Langfuse tracing,
  moderation, per-tenant AI budget, HITL) and an **empty MCP toolset** as your extension point.
- **Billing** — Stripe subscriptions, wallet, plan entitlements, add-ons (generic).
- **Infra** — Postgres (pgvector) + Redis, BullMQ queues, Inngest (Desk workflow engine,
  empty), SSE realtime, S3 storage, email/SMS/push, OTel + pino + Loki/Tempo/Grafana, Terraform.

---

## Multi-tenant vs single-tenant (config toggle)

The same codebase runs either way:

- **Multi-tenant** (default): `MULTI_TENANT=true` (backend) + `NEXT_PUBLIC_MULTI_TENANT=true` (web).
  Tenants resolve from subdomain; tenant-scoped login; self-registration enabled.
- **Single-tenant**: `MULTI_TENANT=false` + `IMPLICIT_TENANT_ID=1`. One seeded tenant, no subdomain
  parsing, no tenant UI, registration hidden. Tenant scoping still works (every query resolves to
  the implicit tenant) — no query rewrites needed.

Tenant enforcement is a global guard chain (`Throttler → Jwt → Tenant → Roles → Plan`) plus
manual `where: { tenantId }` in services. The `TenantGuard` short-circuits to the implicit tenant
when `MULTI_TENANT=false`.

---

## Monorepo structure

```
apps/
  backend/   — NestJS 11 API: YOUR domains + app shell + platform-glue (composition/vocabulary)
  web/       — Next.js 15 (App Router, Tailwind, shadcn/ui, TanStack Query, Zustand)
  console/   — Platform management hub (Next.js 15) — super-admin/ops
  mobile/    — Flutter companion app (status + auth scaffold; API client in lib/core/)
packages/
  foundation/    — the AppShore platform (@appshore/* — reusable, app-blind; init-app never renames these)
    kernel/        — @appshore/kernel: DB-free mechanics (logging, event/queue/cache mechanics,
                     retry, SSE/SMS transport, telemetry, utils/validators, foundation event catalog)
    db/            — @appshore/db: THE prisma package — multi-file schema (foundation.prisma +
                     app.prisma extension point), generated client, migrations, seeds, enum codegen
    platform/      — @appshore/platform: Prisma-coupled SaaS foundation — auth/tenancy guards +
                     strategies, database, cache, queue persistence, storage, notification/push/sms,
                     health, platform domains (users, tenants, plans, flags, api-keys, oauth,
                     settings, onboarding) + test fixtures (@appshore/platform/test/*)
    web-core/      — @appshore/web-core: web foundation (api client, SSE/realtime, hooks, stores,
                     session-bridge) — source-consumed via tsconfig paths
  ui/            — shared shadcn/ui components + tailwind preset (@app/ui)
  shared-types/  — shared Zod schemas + Prisma-enum codegen (@app/shared-types)
  test-utils/    — auth fixtures, Playwright API client (@app/test-utils)
infra/
  terraform/     — AWS (ECS, RDS, ElastiCache, S3, ALB, CloudWatch) — var.project parameterized
  observability/ — Loki + Tempo + Grafana
tests/         — Playwright QA suite (@app/qa)
```

### Backend domains (`apps/backend/src/domains/`)

| Domain           | What it does (all domain-free / generic)                                                           |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| `billing/`       | Stripe subscriptions, wallet, dunning                                                              |
| `integrations/`  | Integration framework (vendor registry **empty** — add your connectors)                            |
| `notifications/` | Multi-channel dispatcher (in-app / push / SMS / email)                                             |
| `support/`       | Ticketing                                                                                          |
| `admin/`         | Super-admin infra console (jobs, events, cache, schedules, AI spend)                               |
| `feedback/`      | In-app feedback with AI summarization (AI-coupled, so it lives app-side)                           |
| `ai/`            | Chat assistant + agent runtime + **empty MCP toolset** + MCP server + knowledge base + RLS + voice |
| `desk/`          | Inngest durable workflow engine (**empty responsibility registry**)                                |
| `prompting/`     | Prompt management (one generic assistant fallback)                                                 |

Tenants/users/plans/flags/api-keys/oauth-provider now live in `@appshore/platform`
(`packages/appshore/platform/src/domains/platform/`). `apps/backend/src/platform-glue/` holds the
app-side composition: the merged event registry + DOMAIN_EVENTS (your vocabulary), queue topology
(queue.module + dispatchers), SSE bridge, outbound webhooks, cache invalidation map, and
`hooks.module.ts` — where platform lifecycle hooks (USER_LIFECYCLE_HOOKS, TENANT_PROVISION_HOOKS)
bind to app implementations.

### Extension points (where you add your app)

- **New domain:** add a module under `apps/backend/src/domains/<your-domain>/`, a feature under
  `apps/web/src/features/<your-domain>/`, and models in
  `packages/appshore/db/prisma/schema/app.prisma` (composed with foundation.prisma).
- **Domain events:** add entries to `APP_EVENT_REGISTRY` in
  `apps/backend/src/platform-glue/events/event-registry.ts` — DOMAIN_EVENTS constants derive
  automatically. The foundation's own catalog lives in `@appshore/kernel` (foundation-events).
- **MCP tools:** register `@Tool` providers in `apps/backend/src/domains/ai/mcp/mcp-tools.module.ts`.
- **Desk responsibilities:** add to the registry in `apps/backend/src/domains/desk/responsibilities/`.
- **Integration connectors:** add to `VENDOR_REGISTRY` in `apps/backend/src/domains/integrations/`.
- **Knowledge base:** drop Markdown under `apps/backend/content/knowledge-base/`, run `pnpm seed:knowledge`.

---

## Quick start

```bash
docker compose up -d postgres redis          # Postgres (pgvector) on :5499, Redis on :6399
pnpm install
pnpm --filter @app/shared-types build         # build shared types (dependents need its dist)
cp apps/web/.env.example apps/web/.env.local   # web env (NEXT_PUBLIC_API_URL etc.)
cd apps/backend && cp .env.example .env        # fill in secrets (DATABASE_URL, ANTHROPIC_API_KEY, ...)
pnpm prisma:generate                           # Prisma client + shared-enum codegen
pnpm prisma:migrate:deploy && pnpm db:seed     # apply migration + seed platform data
cd ../.. && pnpm dev                           # backend + web + console
```

Default dev DB URL: `postgresql://postgres:postgres@localhost:5499/app?schema=public`.

---

## Tech stack

| Layer    | Tech                                                                                      |
| -------- | ----------------------------------------------------------------------------------------- |
| Backend  | NestJS 11, TypeScript 5.9, Prisma 7.3, PostgreSQL 16 (pgvector), Redis 7, BullMQ, Inngest |
| Frontend | Next.js 15, Tailwind, shadcn/ui, TanStack Query, Zustand                                  |
| Auth     | JWT + refresh, Firebase, Twilio OTP                                                       |
| AI       | AI SDK, Anthropic, Mastra, MCP, Langfuse                                                  |
| Infra    | Docker Compose (dev), AWS ECS + Terraform (prod), Loki + Tempo + Grafana                  |

---

## Code conventions

### camelCase (NON-NEGOTIABLE)

All API responses, request bodies, DTOs, service params, and frontend types use **camelCase**.
Exceptions (snake_case is correct): Prisma `where`/`data`/`select`/`include`/`orderBy` blocks, and
the `@Query('snake_case')` decorator argument (the TS variable is still camelCase).

### Enums = Prisma (single source of truth)

All enums live in `packages/appshore/db/prisma/schema/*.prisma`. Backend code imports enums and
the Prisma client from **`@appshore/db`** (never `@prisma/client` directly); frontend/shared-types
import the generated mirror in `packages/shared-types/src/generated/prisma-enums.ts`.
Never hand-edit that generated file — `pnpm --filter @appshore/db prisma:generate` regenerates it
via the db package's `scripts/generate-shared-enums.ts`, and `enum-codegen-parity.spec.ts` guards it.

### UI standards

shadcn/ui components only (no raw `<button>`/`<input>`). Dark-theme tokens (`bg-background`,
`text-foreground`, `border-border`) — never standalone light-only colors. Sheet for 4+ field
forms, Dialog for quick actions, AlertDialog for destructive confirmations. Every mutation shows
success + error toasts; every loading state shows a Skeleton.

---

## Testing

- **Unit:** co-located `**/*.spec.ts` in `apps/backend/src` AND `packages/appshore/*/src`
  (Jest per package). Run `pnpm test` (turbo runs all). Platform test fixtures (prisma/cache/queue
  mocks, tenant/user factories) come from `@appshore/platform/test/*`.
- **Mobile:** `cd apps/mobile && flutter analyze && flutter test`.
- **E2E / smoke / RBAC:** `tests/` (`@app/qa`, Playwright). Run `pnpm test:qa`.

# AI Context — app-foundation

A domain-free **platform starter**: clone this, drop in your domain, and you have auth,
multi-tenancy, billing, AI chat + MCP, background jobs, observability, and IaC already built.
There is intentionally **no business domain** here — add yours under `apps/backend/src/domains/`
and `apps/web/src/features/`.

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
  backend/   — NestJS 11 API (Prisma 7.3, PostgreSQL 16 + pgvector, Redis 7, BullMQ)
  web/       — Next.js 15 (App Router, Tailwind, shadcn/ui, TanStack Query, Zustand)
  console/   — Platform management hub (Next.js 15) — super-admin/ops
packages/
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
| `platform/`      | Tenants, users, invitations, settings, feature flags, plans, API keys, OAuth provider              |
| `billing/`       | Stripe subscriptions, wallet, dunning                                                              |
| `integrations/`  | Integration framework (vendor registry **empty** — add your connectors)                            |
| `notifications/` | Multi-channel dispatcher (in-app / push / SMS / email)                                             |
| `support/`       | Ticketing                                                                                          |
| `admin/`         | Super-admin infra console (jobs, events, cache, schedules, AI spend)                               |
| `ai/`            | Chat assistant + agent runtime + **empty MCP toolset** + MCP server + knowledge base + RLS + voice |
| `desk/`          | Inngest durable workflow engine (**empty responsibility registry**)                                |
| `prompting/`     | Prompt management (one generic assistant fallback)                                                 |

### Extension points (where you add your app)

- **New domain:** add a module under `apps/backend/src/domains/<your-domain>/`, a feature under
  `apps/web/src/features/<your-domain>/`, and models in `prisma/schema.prisma`.
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
cd apps/backend && cp .env.example .env        # fill in secrets (DATABASE_URL, ANTHROPIC_API_KEY, ...)
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

All enums live in `apps/backend/prisma/schema.prisma`. Backend imports from `@prisma/client`;
frontend/shared-types import the generated mirror in `packages/shared-types/src/generated/prisma-enums.ts`.
Never hand-edit that generated file — `pnpm prisma:generate` regenerates it via
`scripts/generate-shared-enums.ts`, and `enum-codegen-parity.spec.ts` guards it.

### UI standards

shadcn/ui components only (no raw `<button>`/`<input>`). Dark-theme tokens (`bg-background`,
`text-foreground`, `border-border`) — never standalone light-only colors. Sheet for 4+ field
forms, Dialog for quick actions, AlertDialog for destructive confirmations. Every mutation shows
success + error toasts; every loading state shows a Skeleton.

---

## Testing

- **Unit:** co-located `apps/*/src/**/*.spec.ts` (backend, Jest). Run `pnpm test`.
- **E2E / smoke / RBAC:** `tests/` (`@app/qa`, Playwright). Run `pnpm test:qa`.

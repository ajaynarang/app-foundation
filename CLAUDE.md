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

- **Auth** — first-party email+password (primary, zero external services), phone PIN/OTP,
  optional Firebase exchange, JWT + refresh token (revocable; NOT rotated on use), login-event
  tracking, OAuth 2.1 provider.
  Seeds print dev credentials (owner@example.com / admin@example.com / Password123!).
- **Multi-tenancy** — tenant-scoped data + a global guard chain. Toggle with `MULTI_TENANT`
  (see below) to run single-tenant from the same code.
- **AI** — a working streaming chat assistant (Mastra + AI SDK + Anthropic, Langfuse tracing,
  moderation, per-tenant AI budget, HITL) and an **empty MCP toolset** as your extension point.
- **Billing** — Stripe subscriptions, wallet, plan entitlements, add-ons (generic).
- **Infra** — Postgres (pgvector) + Redis, BullMQ queues, Inngest (Desk workflow engine,
  empty), SSE realtime, S3 storage, email/SMS/push, OTel + pino + Loki/Tempo/Grafana, Terraform.

---

## Tenancy models (config toggle)

The same codebase runs three ways via `TENANCY_MODE` (multi | single | personal; `MULTI_TENANT`
kept for compat). Workspace-based membership (one user ↔ many workspaces, per-workspace role,
live switcher) is built in: `WorkspaceMember` is the source of truth and the JWT carries the
session's ACTIVE workspace — so two tabs can live in two workspaces. Personal mode auto-creates
a private workspace per user at signup (`POST /auth/register`) and hides org chrome.

Modes in detail:

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
  mobile/    — Flutter companion app (status + auth scaffold; API client in lib/core/)
packages/
  appshore/      — the AppShore Platform (@appshore/* — reusable, app-blind; init-app never renames these)
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
| `admin/`         | Super-admin infra routes (jobs, events, cache, schedules, AI spend, timers)                        |
| `feedback/`      | In-app feedback with AI summarization (AI-coupled, so it lives app-side)                           |
| `ai/`            | Chat assistant + agent runtime + **empty MCP toolset** + MCP server + knowledge base + RLS + voice |
| `desk/`          | Inngest durable workflow engine (**empty responsibility registry**)                                |
| `prompting/`     | Prompt management (one generic assistant fallback)                                                 |

Tenants/users/plans/flags/api-keys/oauth-provider now live in `@appshore/platform`
(`packages/appshore/platform/src/domains/`). `apps/backend/src/platform-glue/` holds the
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
  automatically. The foundation's own catalog lives in `@appshore/kernel` (foundation-events). Raise an event
  inside the write's transaction with `OutboxService.transaction((tx, emit) => …)` so it exists if and only if the
  write committed; delivery is at least once, so every consumer keys on the event id (ADR "Outbox and deadlines",
  held by `no-direct-emit.spec.ts` and `double-delivery.spec.ts`).
- **Timers (deadlines):** declare a kind in `apps/backend/src/platform-glue/deadlines/deadline-kinds.ts`, register
  its handler with `DEADLINE_HANDLERS`, and call `DeadlineService.schedule(tx, …)` / `cancel(tx, …)` inside the
  write's transaction. A timer is a row, fired by the `deadline-sweep` job on `bulk-ops`; never a delayed job or a
  `setTimeout` (ADR "Outbox and deadlines"). Super-admins see every timer at `/admin/timers`.
- **Background jobs:** declare your queues, job names, labels and categories in
  `apps/backend/src/platform-glue/queue/job-names.ts` (`APP_QUEUE_NAMES`, `APP_JOB_NAMES`, `APP_JOB_DISPLAY_NAMES`,
  `APP_JOB_CATEGORIES`, `APP_MANUAL_TYPES`); never in `@appshore/kernel`, whose lists are pinned by
  `foundation-vocabulary.spec.ts`. A handler implements `QueueJobHandler`; a new queue gets its one dispatcher.
  The API process consumes too unless `QUEUE_PROCESSORS_ENABLED=false` (Terraform `api_queue_processors_enabled`,
  shipped `true`; turn it off only once a worker task runs).
- **MCP tools:** register `@Tool` providers in `apps/backend/src/domains/ai/mcp/mcp-tools.module.ts`.
- **Notification types, policies + WhatsApp templates:** notification types are strings, not a Prisma enum. Declare
  yours in `apps/backend/src/platform-glue/notifications/notification-types.ts` (`APP_NOTIFICATION_TYPES`) and their
  policies and templates in `app-notification-policies.ts` beside it; `hooks.module.ts` binds them to
  `NOTIFICATION_TYPES`, `NOTIFICATION_POLICIES` and `WHATSAPP_TEMPLATES` (and optionally `PLATFORM_TIMEZONE`). The
  policy registry refuses to boot when a declared type has no policy. Add your
  named triggers to `apps/backend/src/domains/notifications/notification-triggers.service.ts`. The
  pipeline and every channel live in `@appshore/platform/infrastructure/notifications/`.
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
pnpm --filter @appshore/kernel --filter @appshore/db --filter @appshore/platform build
                                               # foundation packages (the backend consumes their dist)
pnpm prisma:migrate:deploy && pnpm db:seed     # apply migration + seed platform data
cd ../.. && pnpm dev                           # backend + web
```

Default dev DB URL: `postgresql://postgres:postgres@localhost:5499/app?schema=public`.

---

## Tech stack

| Layer    | Tech                                                                                        |
| -------- | ------------------------------------------------------------------------------------------- |
| Backend  | NestJS 11, TypeScript 5.9, Prisma 7.3, PostgreSQL 16 (pgvector), Redis 7, BullMQ, Inngest   |
| Frontend | Next.js 15, Tailwind, shadcn/ui, TanStack Query, Zustand                                    |
| Auth     | First-party email+password, phone PIN/OTP (Twilio optional), Firebase optional, JWT+refresh |
| AI       | AI SDK, Anthropic, Mastra, MCP, Langfuse                                                    |
| Infra    | Docker Compose (dev), AWS ECS + Terraform (prod), Loki + Tempo + Grafana                    |

---

## Code conventions

### camelCase (NON-NEGOTIABLE)

All API responses, request bodies, DTOs, service params, and frontend types use **camelCase**.
Exceptions (snake_case is correct): Prisma `where`/`data`/`select`/`include`/`orderBy` blocks, URL params
(`:tenant_id`), and query keys on the wire: a query DTO declares `@QueryString({ name: 'tenant_id' }) tenantId`,
so the property is still camelCase.

### Enums = Prisma (single source of truth)

All enums live in `packages/appshore/db/prisma/schema/*.prisma`. Backend code imports enums and
the Prisma client from **`@appshore/db`** (never `@prisma/client` directly); frontend/shared-types
import the generated mirror in `packages/shared-types/src/generated/prisma-enums.ts`.
Never hand-edit that generated file — `pnpm --filter @appshore/db prisma:generate` regenerates it
via the db package's `scripts/generate-shared-enums.ts`, and `enum-codegen-parity.spec.ts` guards it.
One decided exception: notification types are strings with an app registry (`PLATFORM_NOTIFICATION_TYPES` in
`@app/shared-types` plus the app's `notification-types.ts`), so a product adds a type without editing
`foundation.prisma`.

### API errors (one envelope)

Every error body is `statusCode, code, detail, fieldErrors?, timestamp, path, method, debugDetail?` and nothing
else: `detail` is the copy to show, `code` is the machine code (`ApiErrorCode` in `@app/shared-types`, or a domain
code). There is no `message` key. Throw a NestJS exception or a factory from
`@appshore/kernel/shared/errors/api-errors` (`fieldError`, `invalidState`, `duplicate`, `stale`); a route that
writes its own response calls `writeErrorEnvelope`. A 400 names its field; a state conflict is a 409. Every query
string is a query DTO from `@appshore/kernel/shared/utils/query-dto`. The decision is the ADR "API contract"
(`docs/adr/`), held by `apps/backend/src/architecture/error-envelope.spec.ts` and `field-errors.spec.ts`.

### UI standards

shadcn/ui components only (no raw `<button>`/`<input>`). They come from `@app/ui/components/ui/*`, the one
component set; the web app keeps no copy. Dark-theme tokens (`bg-background`,
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

### Gates (CI is manual-only, so these run locally)

- **`pnpm verify`** — run it before opening a pull request and paste its last line into the pull request body.
  It runs the format check, lint, schema lint, type-check, every package's unit tests (all but `@app/qa`) and the
  build, stops at the first failure, and ends with one line: `verify: PASS` or `verify: FAIL at "<step>"`. The
  integration specs need Postgres and Redis (`docker compose up -d postgres redis`, or export `DATABASE_URL` and
  `REDIS_URL`).
- **`pnpm verify:api`** — run it before a pull request that changes the wire (a status code, a route, a response
  or error body), and paste its last line too. It builds the backend, migrates, seeds, boots it and runs the
  Playwright `api` project (smoke, the RBAC matrix, `tests/api/`) against it. It needs Postgres and Redis and no
  third-party key. `API_QA_PORT` picks the port when 8000 is taken.
- **Pre-push hook** (`.husky/pre-push`, installed by `pnpm install`) — runs `pnpm verify:arch` on every push: the
  architecture specs in `apps/backend/src/architecture/`, which hold the repo's rules (layer boundaries, schema
  conventions, the error envelope, the API contract ratchet). A new rule gets a spec in that folder, so the hook
  holds it. It then runs the web guards: `single-component-set.test.ts` (the shadcn components live in `@app/ui`
  and `apps/web/src/shared/components/ui/` holds no copy), `theme-tokens.test.ts` (every text token clears WCAG AA)
  and `ui-grammar-guard.test.ts` (theme tokens only, status tones, `RowActions`, `PageHeader` on every settings and
  admin page, `ListErrorState` on every list). Dates go through `useFormatters()`: lint bans `toLocaleDateString`
  and `toLocaleTimeString`.
- **The API contract ratchet** (`apps/backend/src/architecture/api-contract.spec.ts`) — one rule per line of the
  ADR "API contract": status by route shape, naming, inputs, errors, lists, docs, edge. The starter passes every
  rule: `api-contract.baseline.json` is `{}` and a test keeps it empty. A decision that is not debt (a route whose
  wire format a vendor or a standard sets, a list the domain bounds) sits in `api-contract.allowlist.json` with its
  reason.
- **The committed OpenAPI document** (`apps/backend/openapi.json`, `public-openapi.json`) — generated from the code
  by `pnpm --filter @app/backend openapi:generate` and held to it by `swagger-completeness.spec.ts`, which also
  refuses a route without a summary, a described path param or a documented success body (`@ApiResult` with a
  response schema named in the controller group's `openapi.responses.ts`). Regenerate and commit both files with any
  change to a route, a DTO or a response. Production serves the public subset at `/api/openapi.json`.
- **Pre-commit hook** — Prettier on staged files.

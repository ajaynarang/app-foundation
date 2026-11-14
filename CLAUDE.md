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
  optional Firebase exchange, JWT + rotating refresh token (every refresh issues a successor; a retired token
  presented again revokes the session), login-event tracking, OAuth 2.1 provider.
  Seeds print dev credentials (owner@example.com / admin@example.com / Password123!).
- **Multi-tenancy** — tenant-scoped data + a global guard chain. Toggle with `MULTI_TENANT`
  (see below) to run single-tenant from the same code.
- **AI** — a working streaming chat assistant (Mastra + AI SDK + Anthropic, Langfuse tracing,
  moderation, per-tenant AI budget, HITL) and an **empty MCP toolset** as your extension point.
- **Billing** — Stripe subscriptions, wallet, plan entitlements, add-ons (generic).
- **Infra** — Postgres (pgvector) + Redis, BullMQ queues, transactional outbox, timers, SSE realtime, S3 storage,
  email/SMS/push, OTel traces and metrics + pino logs + Sentry errors (each off until its key is set; three levels:
  0 stdout only, 1 CloudWatch alarms with `alarm_email`, 2 Grafana Cloud and Sentry; `docs/observability.md`), a
  local-only Loki/Tempo/Prometheus/Grafana compose profile, Terraform. Operator procedures (deploy gate,
  migrations, maintenance switch, outbound gate, tenant reset, staging-debug stack) are in `docs/operations.md`.

<!-- feature:desk:start -->

- **Desk** — Inngest durable workflow engine for background AI agents (empty responsibility registry). Optional:
  chosen at scaffold time, off by default.

<!-- feature:desk:end -->

---

## Binding docs (read before any product work)

These docs are the architecture of record. Before planning, designing or building a product feature, read the ones
it touches; they override improvisation. In the starter they are skeletons: each has a filled "Foundation (already
here)" part where the starter already decides something, and an empty "Your product" part to fill in the product's
first days. `docs/README.md` indexes every other doc.

| Doc                                 | What it binds                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| `docs/VISION.md`                    | Who the product is for, what it does, what it will not do                       |
| `docs/domain-map.md`                | Every entity, what it means, how entities relate (the schema holds the columns) |
| `docs/lifecycles-and-invariants.md` | The always-true rules, each with its guard, and every state machine             |
| `docs/module-map.md`                | Which folder owns what, and which way dependencies point                        |
| `docs/event-vocabulary.md`          | Every domain event; use the names verbatim                                      |
| `docs/epics.md`                     | Build order, and what "demoable" means for each epic                            |
| `docs/adr/`                         | The decisions that are expensive to change, and why (index in its `README.md`)  |

**The amendment rule.** Deviating from a binding doc is allowed only as a deliberate amendment: change the doc, and
the ADR it rests on, in the same pull request as the code. Never drift silently. A new decision that is expensive to
undo gets its own ADR, started from `docs/adr/0000-template.md`.

---

## Tenancy models (config toggle)

The same codebase runs three ways via `TENANCY_MODE` (multi | single | personal; `MULTI_TENANT`
kept for compat). Workspace-based membership (one user ↔ many workspaces, per-workspace role,
live switcher) is built in: `WorkspaceMember` is the source of truth and the JWT carries the
session's ACTIVE workspace, stored on the session's refresh token — so two sessions (two browsers or profiles; tabs
share one cookie) can live in two workspaces. Personal mode auto-creates
a private workspace per user at signup (`POST /auth/register`) and hides org chrome.

Modes in detail:

- **Multi-tenant** (default): `MULTI_TENANT=true` (backend) + `NEXT_PUBLIC_MULTI_TENANT=true` (web).
  Tenants resolve from subdomain; tenant-scoped login (the form sends the subdomain's `tenantId`). One live account
  per email, held by the partial unique index `users_email_live_key`; a database that predates it may hold
  duplicates, and then the migration skips the index, boot logs `auth.email_uniqueness_unenforced`, and a password
  that matches accounts in several workspaces gets a 409 picker (`pnpm accounts:duplicates` lists them, merge per
  `docs/operations.md`, then `pnpm accounts:enforce-unique-email`); self-registration enabled.
- **Single-tenant**: `MULTI_TENANT=false` + `IMPLICIT_TENANT_ID=1`. One seeded tenant, no subdomain
  parsing, no tenant UI, registration hidden. Tenant scoping still works (every query resolves to
  the implicit tenant) — no query rewrites needed.

Tenant enforcement is a global guard chain (`Throttler → Jwt → Tenant → Roles → Plan`) plus
manual `where: { tenantId }` in services. The `TenantGuard` short-circuits to the implicit tenant
when `MULTI_TENANT=false`.

Every request, job, AI tool call and deadline handler also runs in a declared tenant context
(`packages/appshore/kernel/src/infrastructure/rls/`): the auth guards pin the request, `withJobContext` scopes each
job, cross-tenant work declares `systemScope(reason)` / `forEachTenant` / `@SystemScope`, and every log line carries
`rls.*`. Every job name, Prisma table, `@OnEvent` handler and super-admin route declares its context, held by the
`rls-*` specs in `apps/backend/src/architecture/` (app declarations: `platform-glue/queue/job-context.ts`,
`platform-glue/database/app-rls-registry.ts`). Nothing in the database enforces the context yet (no row-level
security policy); unit tests run it strict (`RLS_STRICT_CONTEXT=throw`). Every transaction is interactive,
`$transaction(async (tx) => …)`; the array form is banned (`rls-no-array-transaction.spec.ts`).

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
  observability/ — local-only Loki + Tempo + Prometheus + Grafana (compose profile; not the production stack)
tests/         — Playwright QA suite (@app/qa)
```

### Backend domains (`apps/backend/src/domains/`)

| Domain           | What it does (all domain-free / generic)                                                     |
| ---------------- | -------------------------------------------------------------------------------------------- |
| `billing/`       | Stripe subscriptions, wallet, dunning                                                        |
| `integrations/`  | Integration framework (vendor registry **empty** — add your connectors)                      |
| `notifications/` | Multi-channel dispatcher (in-app / push / SMS / email)                                       |
| `support/`       | Ticketing                                                                                    |
| `admin/`         | Super-admin infra routes (jobs, events, cache, schedules, AI spend, timers)                  |
| `feedback/`      | In-app feedback with AI summarization (AI-coupled, so it lives app-side)                     |
| `ai/`            | Chat assistant + agent runtime + **empty MCP toolset** + MCP server + knowledge base + voice |
| `prompting/`     | Prompt management (one generic assistant fallback)                                           |

<!-- feature:desk:start -->

With Desk: `desk/` is the Inngest durable workflow engine (**empty responsibility registry**).

<!-- feature:desk:end -->

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
  Every call runs through the one tool pipeline (scope, arguments, role, plan, confirmation, audit): give each tool
  `@RequiresScope`, and `@RestrictToRoles` / `@RequiresPlanFeature` to match its REST twin (backend-patterns §23.1;
  `mcp/tools/support-ticket.tool.ts` is the example).
- **Notification types, policies + WhatsApp templates:** notification types are strings, not a Prisma enum. Declare
  yours in `apps/backend/src/platform-glue/notifications/notification-types.ts` (`APP_NOTIFICATION_TYPES`) and their
  policies and templates in `app-notification-policies.ts` beside it; `hooks.module.ts` binds them to
  `NOTIFICATION_TYPES`, `NOTIFICATION_POLICIES` and `WHATSAPP_TEMPLATES` (and optionally `PLATFORM_TIMEZONE`). The
  policy registry refuses to boot when a declared type has no policy. Add your
  named triggers to `apps/backend/src/domains/notifications/notification-triggers.service.ts`. The
  pipeline and every channel live in `@appshore/platform/infrastructure/notifications/`.
- **Optional features:** a feature chosen at scaffold time (today: Desk) is wired only through
  `apps/backend/src/platform-glue/features/` (`OPTIONAL_FEATURES`). Its manifest
  (`tools/init-app/features/<name>.json`) names every file, marked block, JSON entry and allowlist entry that goes
  with it; `node tools/init-app/apply-feature.mjs --remove <name>` strips it. A Desk-only line outside the Desk
  folder sits between `feature:desk:start` / `feature:desk:end` comments and is registered there (ADR "Optional
  features: Desk is opt-in at scaffold time", held by `optional-features.spec.ts`; `pnpm verify:scaffold` checks
  both scaffolds).

<!-- feature:desk:start -->

- **Desk responsibilities:** add to the registry in `apps/backend/src/domains/desk/responsibilities/`.

<!-- feature:desk:end -->

- **Integration connectors:** add to `VENDOR_REGISTRY` in `apps/backend/src/domains/integrations/`.
- **Knowledge base:** drop Markdown under `apps/backend/content/knowledge-base/`, run `pnpm seed:knowledge` (incremental;
  `--force` re-embeds all). Measure retrieval with `pnpm kb:eval` against `apps/backend/content/kb-eval/golden.json`.

---

## Quick start

```bash
docker compose up -d postgres redis          # Postgres (pgvector) on :5499, Redis on :6399
pnpm install
pnpm --filter @app/shared-types build         # build shared types (dependents need its dist)
cp apps/web/.env.example apps/web/.env.local   # web env (NEXT_PUBLIC_API_URL etc.)
cd apps/backend && cp .env.example .env        # fill in secrets (DATABASE_URL; OPENROUTER_API_KEY for chat,
                                               # COHERE_API_KEY for knowledge-base vector search)
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
| Backend  | NestJS 11, TypeScript 5.9, Prisma 7.3, PostgreSQL 16 (pgvector), Redis 7, BullMQ            |
| Frontend | Next.js 15, Tailwind, shadcn/ui, TanStack Query, Zustand                                    |
| Auth     | First-party email+password, phone PIN/OTP (Twilio optional), Firebase optional, JWT+refresh |
| AI       | AI SDK, Anthropic, Mastra, MCP, Langfuse                                                    |
| Infra    | Docker Compose (dev), AWS ECS + Terraform (prod), OTLP + Sentry (off until keys are set)    |

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

Every error body is `statusCode, code, detail, fieldErrors?, workspaces?, timestamp, path, method, debugDetail?` and nothing
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
  It runs the format check, lint, schema lint, type-check, every package's unit tests (all but `@app/qa`; the web
  jest also runs `@appshore/web-core`'s tests), `pnpm check:ops`, the RBAC gap audit (`pnpm audit:rbac`) and the
  build, stops at the first failure, and ends with one line: `verify: PASS <sha> (<n>s)` or
  `verify: FAIL at "<step>" <sha> (<n>s)`, where `<sha>` is the commit the run started on and `+dirty` follows it
  when the tree had uncommitted changes (ADR "CI is manual by default; enforcement is local"). The
  integration specs need Postgres and Redis (`docker compose up -d postgres redis`, or export `DATABASE_URL` and
  `REDIS_URL`).
- **`pnpm verify:api`** — run it before a pull request that changes the wire (a status code, a route, a response
  or error body), and paste its last line too. It builds the backend, migrates, seeds, boots it and runs the
  Playwright `api` project (smoke, the RBAC matrix, `tests/api/`) against it. It needs Postgres and Redis and no
  third-party key. Export `DATABASE_URL` and `REDIS_URL` first: it migrates and seeds the database it is given,
  so it has no default and stops when either is unset. `API_QA_PORT` picks the port when 8000 is taken.
- **`pnpm verify:scaffold`** — run it before a pull request that touches `tools/init-app/`,
  `apps/backend/src/platform-glue/features/`, a file an optional-feature manifest names, or a Desk file outside the
  Desk folder, and paste its last line. It scaffolds two copies of the repo (`--desk no` and `--desk yes`), installs,
  builds the foundation packages, regenerates OpenAPI and the RBAC matrix, type-checks the backend, web and
  `tests/`, runs the backend specs, and checks that nothing names `inngest` or `domains/desk` in the `--desk no` copy
  unless `tools/init-app/features/desk.residue.json` lists it. It takes minutes and needs Postgres and Redis.
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
- **`pnpm check:ops`** — the operations files that are not Jest specs: the Grafana-as-code catalog under
  `infra/observability/grafana-cloud/` (generated files fresh, `validate.mjs`, its specs), the ops shell tests and
  Terraform fmt / validate / test. It runs inside `pnpm verify`, and the pre-push hook runs it when a push touches
  `infra/`, `docs/runbooks/`, `.github/` or `tools/`. Change the catalog, never its generated files. A new alert
  rule needs its `## <rule key>` section in `docs/runbooks/`; applying to Grafana is the manual `grafana-apply`
  workflow.
- **Pre-commit hook** — Prettier on staged files.

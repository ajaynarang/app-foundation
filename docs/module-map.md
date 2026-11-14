---
sources:
  - apps/backend/src/domains
  - apps/backend/src/platform-glue
  - apps/web/src/features
  - packages/appshore
  - apps/backend/src/architecture/foundation-boundaries.spec.ts
verified: 2d3e125
---

# Module map

> **Binding doc** (see "Binding docs" in the root `CLAUDE.md`). It says which folder owns what, and which way
> dependencies point. Two epics run in parallel only when they touch different modules here. "Foundation (already
> here)" is the starter; "Your product" is empty until the runway fills it. A new module, or a new dependency
> between modules, ships as an amendment in the same pull request.

## Foundation (already here)

### Layers

The packages and their one-way arrows are fixed by ADR [Package layering](adr/0008-package-layering.md) and held by
`apps/backend/src/architecture/foundation-boundaries.spec.ts`:

```
backend:  @appshore/kernel ← @appshore/db ← @appshore/platform ← apps/backend
web:      @appshore/kernel ← @appshore/web-core ← apps/web        (@app/ui imports no @appshore package)
```

| Package                                   | Owns                                                                                                                                                                                   |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/appshore/kernel/`               | DB-free mechanics: logging, events, queues, retry, SSE, SMS transport, telemetry, outbound gate port, tenant context                                                                   |
| `packages/appshore/db/`                   | The Prisma schema (`foundation.prisma`, `app.prisma`), client, migrations, seeds, enum codegen                                                                                         |
| `packages/appshore/platform/`             | Auth and tenancy guards, database, cache, queue persistence, storage, notifications, health, idempotency                                                                               |
| `packages/appshore/platform/src/domains/` | Platform domains: tenants, users, workspaces, invitations, plans, entitlements, feature flags, API keys, OAuth provider, settings, onboarding, announcements, login activity, outbound |
| `packages/appshore/web-core/`             | Web foundation: API client, auth, SSE, hooks, stores                                                                                                                                   |
| `packages/ui/`                            | `@app/ui`: shadcn components, page chrome, Tailwind preset                                                                                                                             |
| `packages/shared-types/`                  | Zod schemas, the generated enum mirror, shared wire types                                                                                                                              |
| `packages/test-utils/`                    | Auth fixtures and the Playwright API client                                                                                                                                            |

### Backend (`apps/backend/src/`)

| Folder                   | Owns                                                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domains/admin/`         | Super-admin routes: jobs, events, cache, schedules, timers, AI spend                                                                                                                  |
| `domains/ai/`            | Chat assistant, agent runtime, tool pipeline, MCP toolset and server, routing, knowledge base, moderation, voice                                                                      |
| `domains/billing/`       | Subscriptions, wallet, invoices, dunning; the billing provider adapter                                                                                                                |
| `domains/feedback/`      | In-app feedback with AI summaries                                                                                                                                                     |
| `domains/integrations/`  | The integration framework, credentials, OAuth to vendors, sync; `VENDOR_REGISTRY` is empty                                                                                            |
| `domains/notifications/` | The app's notification routes and named triggers                                                                                                                                      |
| `domains/prompting/`     | Prompt management and registrars                                                                                                                                                      |
| `domains/support/`       | Support tickets                                                                                                                                                                       |
| `platform-glue/`         | Where the app joins the platform: events and outbox, queue topology, deadlines, notification types, SSE, webhooks, search, cache invalidation, lifecycle hooks, optional-feature seam |
| `bootstrap/`, `config/`  | Boot: OpenAPI, throttling, trust proxy; the config schema and production boot guard                                                                                                   |
| `shared/`                | DTO and list kits, utils                                                                                                                                                              |
| `architecture/`          | The architecture specs that hold the repo's rules                                                                                                                                     |

<!-- feature:desk:start -->

| Folder          | Owns                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------ |
| `domains/desk/` | Desk, the durable workflow engine for background AI agents (empty responsibility registry) |

Desk is wired in only through `platform-glue/features/desk.feature.ts`. It imports `ai` and `prompting`; nothing
imports Desk except that seam (`optional-features.spec.ts`).

<!-- feature:desk:end -->

Dependencies between foundation domains today: `admin → ai`, `feedback → ai`, `ai → notifications`, `ai → support`
(the example tool pair). Every other domain imports only packages and `platform-glue/`. Review only, until a spec
holds the arrows.

### Web (`apps/web/src/`)

| Folder                                                                                                 | Owns                                                                                                                    |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `app/`                                                                                                 | Routes: auth pages, `settings/` (tenant administration), `admin/` (super-admin), onboarding                             |
| `features/platform/`                                                                                   | Platform features: AI chat and settings, API keys, OAuth clients, billing, plans, support, workspaces, onboarding, tour |
| `features/admin/`                                                                                      | Super-admin features: AI spend, outbound, timers                                                                        |
| `features/auth/`, `features/ai/`, `features/billing/`, `features/notifications/`, `features/webhooks/` | Auth state, agent activity, billing hooks, notification hooks, webhook management                                       |
| `shared/`                                                                                              | Components, providers, hooks, config shared by every feature                                                            |

<!-- feature:mobile:start -->

`apps/mobile/` is the Flutter companion app (auth and status scaffold). It talks to the backend over the same API.

<!-- feature:mobile:end -->

## Your product

### Backend domains

_How to fill this: one row per folder under `apps/backend/src/domains/`: what it owns (entities from
`docs/domain-map.md`), the events it emits, and the jobs it runs._

### Web features

_How to fill this: one row per folder under `apps/web/src/features/`, and the backend domain it talks to._

### Dependency direction

_How to fill this: the allowed arrows between your domains, as a list (`orders → catalog`). A domain imports another
only along an arrow listed here; anything else goes through an event. Keep it a tree: a cycle means two domains
should be one, or one should listen to the other's events._

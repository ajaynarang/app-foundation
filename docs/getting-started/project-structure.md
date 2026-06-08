---
title: Project Structure
description: A map of the SALLY monorepo — where code lives and where to add new code.
---

# Project Structure

SALLY is a pnpm workspace + Turborepo monorepo. Five apps, four packages, plus infrastructure and tests.

## Top-level layout

```
sally/
├── apps/                   Application code (workspace members + one static site)
├── packages/               Shared libraries (workspace members)
├── tests/                  Playwright QA suite (workspace: @sally/qa)
├── infra/
│   ├── terraform/          AWS infrastructure as code (ECS, S3, RDS, etc.)
│   └── observability/      Loki, Tempo, Grafana config (used by the docker-compose observability profile)
├── tools/
│   └── db/                 Database scripts — migrate.sh, pull-staging.sh, etc.
├── scripts/                Repo-wide scripts
├── postman/                Postman collections
├── docs/                   This documentation site (MkDocs Material)
├── .docs/                  Internal planning artifacts (specs, plans, technical notes)
├── docker-compose.yml      Postgres + Redis + Inngest (default), Loki/Tempo/Grafana (observability profile)
├── docker-compose.stg-debug.yml   Parallel Postgres + Redis for debugging staging issues locally
├── mkdocs.yml              Doc site config
├── turbo.json              Turborepo pipeline config
├── package.json            Root scripts + workspace declaration
└── pnpm-workspace.yaml     Workspace member list
```

## Apps

| App | Workspace name | Type | Dev command | Dev port |
|---|---|---|---|---|
| `apps/backend/` | `@sally/backend` | NestJS 11 API + Mastra agent runtime | `pnpm doppler:backend` | `8001` (Doppler-injected; falls back to `8000` without Doppler) |
| `apps/web/` | `@sally/web` | Next.js 15 frontend (App Router, dispatcher/driver/customer/admin/super-admin) | `pnpm doppler:frontend` | `3001` |
| `apps/console/` | `@sally/console` | Next.js 15 — platform management hub, API docs, settings | `pnpm doppler:console` | `3002` |
| `apps/studio/` | `@sally/studio` | Remotion video rendering (marketing collateral) | — | — |
| `apps/deck/` | _(no `package.json` — static HTML site)_ | Marketing/deck pages with their own `vercel.json` | — | — |

`apps/deck/` is a standalone static site, **not** a workspace member. It has its own deployment pipeline and isn't covered by Turborepo tasks.

## Packages

| Package | Workspace name | Purpose |
|---|---|---|
| `packages/shared-types/` | `@sally/shared-types` | Zod schemas, TypeScript types, and the auto-generated Prisma enum mirror (`src/generated/prisma-enums.ts`). Single source of truth shared by backend and frontend. |
| `packages/ui/` | `@sally/ui` | Shared Shadcn components (button, sheet, dialog, alert-dialog, table, …), Sally extensions (`form-sheet`, `sheet-section`, `sally-insight`, `info-item`, `phone-input`), the toast utility, and theme tokens in `styles/globals.css`. |
| `packages/test-utils/` | `@sally/test-utils` | Test factories, role/auth fixtures, Zod response schemas. Used by `tests/` (the QA workspace) and by backend Jest specs that need fixtures. |
| `packages/screenshots/` | `@sally/screenshots` | Marketing-screenshot capture and distribution pipeline (Playwright). **Not** for ad-hoc debugging screenshots — those go to `.screenshots/` (gitignored). |

## Backend domains (`apps/backend/src/domains/`)

14 domains. Each is a self-contained NestJS module set.

| Domain | Purpose |
|---|---|
| `admin/` | Admin jobs and scheduled-task control surfaces |
| `ai/` | Sally AI assistant, document intelligence, MCP server, knowledge base, moderation, orchestration, RLS, voice |
| `analytics/` | Tenant analytics |
| `billing/` | Tenant billing subscriptions, plans, add-on lifecycle |
| `desk/` | Sally's Desk — agent runtime: responsibilities, episodes, steps, approvals, memory, suppression |
| `financials/` | Invoicing, settlements, payments, close-out, profitability |
| `fleet/` | Drivers, vehicles, loads, customers, documents, recurring lanes |
| `home/` | Home-screen widget aggregator |
| `integrations/` | Samsara, QuickBooks, OAuth, sync engine, vendor adapters, EDI, email intake |
| `operations/` | Alerts, command center, Shield (compliance), monitoring, notifications |
| `platform/` | Users, tenants, feature flags, settings, onboarding, API keys, plans, feedback |
| `platform-services/` | Fuel cards, fuel prices, geocoding, mileage, tolls, traffic, weather, platform health |
| `prompting/` | LLM prompt management (Langfuse-style versioning) |
| `routing/` | Route planning, HOS compliance, load mileage |

See [Architecture → Backend](../architecture/backend.md) for the per-domain breakdown and the module pattern.

## Frontend route tree (`apps/web/src/app/`)

The web app uses Next.js 15 App Router. Top-level surfaces:

- **`dispatcher/`** — main TMS dashboard (DISPATCHER + ADMIN audience)
- **`driver/`** — mobile-shaped driver view
- **`customer/`** — customer portal
- **`admin/`** — tenant admin
- **`(super-admin)/`** — route group for platform super-admin
- **`api/`** — Next.js route handlers (webhook receivers, etc.)

AI surfaces: `sally-canvas/`, `sally-default/`, `sally-nerve/` (the **current production route** for what's being rebranded to "Sally's Desk" — the rename is in flight; see [Architecture → Sally's Desk](../architecture/sally-desk.md)), `agent-actions/`, `rest-optimizer/`.

Auth / onboarding: `login/`, `register/`, `registration/`, `accept-invitation/`, `forgot-password/`, `reset-password/`, `oauth/`, `onboarding/`, `setup-hub/`.

Marketing / public: `pricing/`, `product/`, `legal/`, `track/` (public load tracking).

Other: `settings/`, `maintenance/`, plus root-level `layout.tsx`, `providers.tsx`, `error.tsx`, `global-error.tsx`, `not-found.tsx`.

## Frontend features (`apps/web/src/features/`)

24 feature folders, each loosely matching a backend domain. Standard shape:

```
features/<domain>/<entity>/
  components/   Feature UI (Sheets, Tables, Forms)
  hooks/        use-<entity>.ts (queries), use-<entity>-actions.ts (mutations)
  api/          fetchers
  types/        TS interfaces (often re-exporting from @sally/shared-types)
  store/        Optional Zustand store, scoped to the feature
```

See [Frontend → Feature Modules](../frontend/feature-modules.md).

## Tests

```
tests/
  smoke/                 @smoke — health + security-headers + auth (~30s)
  rbac/                  @rbac — role × endpoint matrix (~2min)
  api/                   @workflow / @contract — multi-step domain chains
  browser/               Playwright UI critical paths
  loadtest/              autocannon baselines
  evals/                 AI evals — scaffold only, not active
  fixtures/              Thin re-exports to @sally/test-utils
  config/                global-setup, test-env
  scripts/               RBAC matrix gen, gap audit, confidence matrix
```

Backend unit tests are co-located: `apps/backend/src/**/*.spec.ts`. Web unit tests are not currently wired (Jest misconfig per `CLAUDE.md`); web is gated on type-check + build + browser tests.

See [Quality Gate](../qa/index.md) for running tests and [Frontend Guide](../frontend/index.md) for the testing policy.

## Important constraints

- **Documentation goes in three places:**
  - `docs/` — this site (MkDocs Material, GitHub Pages).
  - `.docs/plans/` — AI-generated implementation plans, dated `YYYY-MM-DD-topic.md`.
  - `.docs/technical/` — long-form technical notes.
  - The root directory holds only `README.md`, `CLAUDE.md`, `DOCUMENTATION.md`.
- **Branch from `develop`, never `main`.** See [Contributing → Git Workflow](../contributing/git-workflow.md).

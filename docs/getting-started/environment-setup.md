---
title: Environment Setup
description: Clone, install, start services, run the apps. Doppler-injected secrets; opt-in observability.
---

# Environment Setup

This page gets you from a fresh checkout to running apps in under 30 minutes.

## 1. Clone

```bash
git clone git@github.com:app-shore/sally.git
cd sally
git checkout develop
```

`develop` is the primary active branch. Never branch from `main` — see [Contributing → Git Workflow](../contributing/git-workflow.md).

## 2. Install dependencies

```bash
corepack enable             # one-time — installs the pinned pnpm version
pnpm install
```

The first install is slow (5–10 minutes) — the monorepo has 5 apps and several packages.

## 3. Authenticate with Doppler

We use [Doppler](https://www.doppler.com/) as the single source of truth for environment variables across local, staging, and production. **You will not maintain `.env` files** locally — Doppler injects them at runtime.

```bash
doppler login              # one-time per machine — opens a browser
```

Then link each app to its Doppler config (one-time per app):

```bash
cd apps/backend && doppler setup
# Select project: sally-backend, config: dev

cd ../web && doppler setup
# Select project: sally-web, config: dev

cd ../console && doppler setup
# Select project: sally-console, config: dev
```

See [Architecture → Secrets Management](../architecture/secrets-management.md) for the full Doppler story.

## 4. Start infrastructure (Docker)

```bash
docker-compose up -d
```

This starts the **default profile**:

| Service | Container | Host port | Image |
|---|---|---|---|
| `postgres` | `sally-postgres` | `5432` | `pgvector/pgvector:pg16` |
| `redis` | `sally-redis` | `6379` | `redis:7-alpine` |
| `inngest` | `sally-inngest` | `8288` | `inngest/inngest:latest` (Desk durable-workflow engine) |

Verify:

```bash
docker compose ps
# postgres, redis, inngest should all be "Up" / "healthy"
```

### Opt-in: observability stack

The Loki + Tempo + Grafana stack is **not** part of the default profile. Start it when you want to see traces and logs locally:

```bash
docker-compose --profile observability up -d
```

| Service | Container | Host port | Purpose |
|---|---|---|---|
| `loki` | `sally-loki` | `127.0.0.1:3100` | Log ingest |
| `tempo` | `sally-tempo` | `127.0.0.1:3200` (query API), `4317` (OTLP gRPC), `4318` (OTLP HTTP) | Trace ingest + query |
| `grafana` | `sally-grafana` | `127.0.0.1:3003` | UI — anonymous admin, login form disabled |

All three bind to `127.0.0.1` only and aren't reachable from other machines. Grafana → `http://localhost:3003`. Loki and Tempo datasources are provisioned automatically from `infra/observability/grafana/provisioning/`.

The backend silently falls back when the stack isn't running: Pino prints to stdout instead of shipping to Loki, OpenTelemetry buffers spans that nothing exports. Apps continue to work — you just can't see traces.

See [Architecture → Observability](../architecture/observability.md) for what to look at, where.

## 5. Initialize the database

From `apps/backend/`, with Doppler:

```bash
cd apps/backend

# Generate the Prisma client + the @sally/shared-types enum mirror
doppler run -- pnpm prisma:generate

# Apply migrations and seed (full mode)
../../tools/db/migrate.sh --env local -y
```

**Important:** never run `prisma migrate dev` directly. It resets mastra-owned tables that Prisma doesn't know about. Always use `tools/db/migrate.sh` — see [Backend → Database & Prisma](../backend/database-prisma.md) for the full flag reference.

## 6. Start the apps

Three terminal tabs:

```bash
# Tab 1 — backend
pnpm doppler:backend        # http://localhost:8001/api/v1

# Tab 2 — web
pnpm doppler:frontend       # http://localhost:3001

# Tab 3 — console
pnpm doppler:console        # http://localhost:3002
```

Or use the convenience script that opens iTerm2 tabs:

```bash
pnpm dev:side               # opens 3 tabs with the standard ports
pnpm dev:side:stop          # closes them
```

## 7. Verify

| Check | URL |
|---|---|
| Backend health | `curl http://localhost:8001/api/v1/health` (or open the Swagger UI at `http://localhost:8001/api`) |
| Web app | `http://localhost:3001` |
| Console | `http://localhost:3002` |
| Inngest dev UI | `http://localhost:8288` |
| Prisma Studio | `cd apps/backend && doppler run -- pnpm prisma:studio` |
| Grafana (if observability started) | `http://localhost:3003` |

## Bonus: the `stg-debug` parallel stack

When you need to reproduce a staging-specific issue locally without nuking your dev DB:

```bash
pnpm stg-debug:up                  # starts postgres on :5434, redis on :6380
./tools/db/pull-staging.sh --target stg-debug -y
pnpm doppler:backend:stg-debug     # runs backend against the parallel stack via Doppler config dev_stg_debug
```

Tear down with `pnpm stg-debug:reset` (data wiped) or `pnpm stg-debug:down` (data retained).

## Next

Read [Project Structure](project-structure.md) so you can find your way around the monorepo.

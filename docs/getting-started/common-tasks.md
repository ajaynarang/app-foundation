---
title: Common Tasks
description: Recipes for everyday work — migrate, seed, reset, view traces, run tests.
---

# Common Tasks

Compact recipes for everyday SALLY development. Each one is a paste-and-go.

## Database

### Apply a new migration locally

```bash
cd apps/backend
../../tools/db/migrate.sh --env local -y
```

Defaults to **full mode** — runs Prisma migrations, seeds, and Langfuse-style prompt seeds. Add `--migrate-only` to skip seeds.

**Don't:** `prisma migrate dev`. It resets mastra-owned tables that Prisma doesn't know about. Always use `tools/db/migrate.sh`. See [Backend → Database & Prisma](../backend/database-prisma.md).

### Generate the Prisma client + shared-types enum mirror

```bash
cd apps/backend
doppler run -- pnpm prisma:generate
```

This chains `prisma generate` and `tsx scripts/generate-shared-enums.ts`, so the frontend sees any new enum values immediately.

### Inspect data

```bash
cd apps/backend
doppler run -- pnpm prisma:studio
```

Opens Prisma Studio in your browser.

### Reset a tenant

```bash
pnpm tenant:reset
```

Deletes a tenant's loads, drivers, vehicles, invoices, settlements, and AI artifacts in foreign-key-safe order. The script lives at `apps/backend/scripts/tenant-reset/cli.ts`.

### Seed demo data

```bash
cd apps/backend
doppler run -- pnpm setup:demo
# add --reset to wipe and re-seed
```

### Repro a staging issue locally (stg-debug stack)

```bash
pnpm stg-debug:up                   # postgres on :5434, redis on :6380
./tools/db/pull-staging.sh --target stg-debug -y   # pulls a redacted dump
pnpm doppler:backend:stg-debug      # backend points at the parallel stack
```

Tear down: `pnpm stg-debug:reset` (wipe data) or `pnpm stg-debug:down` (keep data).

## Running things

### All apps, one command

```bash
pnpm dev:side          # opens iTerm2 tabs for backend (8001), web (3001), console (3002)
pnpm dev:side:stop     # closes them
```

### One app at a time

```bash
pnpm doppler:backend       # NestJS API on :8001
pnpm doppler:frontend      # Next.js web on :3001
pnpm doppler:console       # Next.js console on :3002
```

### Inngest dev UI

Auto-starts with `docker-compose up -d`. Open `http://localhost:8288`. It targets the backend on `host.docker.internal:8001/api/v1/inngest`.

## Observability (opt-in locally)

### Start the stack

```bash
docker-compose --profile observability up -d
```

Adds Loki (`:3100`), Tempo (`:3200` / `:4317` gRPC / `:4318` HTTP), Grafana (`:3003`).

### View traces

Open `http://localhost:3003` → Explore → Tempo. Search by trace ID or by service `sally-backend`.

### View logs

Open `http://localhost:3003` → Explore → Loki. Filter by `service="sally-backend"` and any tag (`level="error"`, `tenant_id=…`, etc.).

### Tell the backend to ship logs to Loki

```bash
LOG_TRANSPORT=loki pnpm doppler:backend
```

Without that env var, Pino prints to stdout (pretty in dev) and Loki stays empty.

See [Architecture → Observability](../architecture/observability.md) for the full story.

## Testing

### Backend unit tests

```bash
pnpm backend:test                       # whole backend Jest suite
cd apps/backend && pnpm test -- --watch  # watch mode
```

### QA suite (Playwright)

```bash
pnpm qa:list-tenants                              # find a valid TENANT_ID
TENANT_ID=<id> pnpm test:smoke:local              # ~30s
TENANT_ID=<id> pnpm test:rbac:local               # ~2min
TENANT_ID=<id> pnpm test:api:local                # ~3min
TENANT_ID=<id> pnpm test:browser:local            # ~2min
TENANT_ID=<id> pnpm test:qa:local                 # full suite
```

`:local` variants inject secrets from Doppler. See [Quality Gate → Running Tests](../qa/running-tests.md).

## Linting & formatting

```bash
pnpm lint                # all apps
pnpm format              # auto-fix Prettier
pnpm format:check        # CI-style check, no writes
pnpm type-check          # all apps
```

## Building

```bash
pnpm build               # all apps via Turborepo
pnpm backend:build       # backend only
```

## Common debugging

| Symptom | Likely cause | Fix |
|---|---|---|
| Backend won't start, `Port 8001 in use` | Stale `pnpm doppler:backend` from previous run | `lsof -ti:8001 \| xargs kill -9` |
| `prisma generate` fails with "schema enum mirror out of sync" | You edited the schema but didn't regenerate | `cd apps/backend && doppler run -- pnpm prisma:generate` |
| Mastra tables wiped after `prisma migrate dev` | You used the wrong tool | Always use `tools/db/migrate.sh` |
| Web app shows blank page | Backend isn't running on `:8001`, or CORS misconfigured | Check `pnpm doppler:backend` is up; check `CORS_ORIGINS` in Doppler |
| No traces in Grafana | Observability stack not started, or backend started before the stack | Run `docker-compose --profile observability up -d` then restart backend |
| QA tests can't find tenant | Need a valid `TENANT_ID` | `pnpm qa:list-tenants` to find one |

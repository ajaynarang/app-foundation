---
title: SALLY Internal Documentation
description: Developer and architecture documentation for the SALLY fleet operations platform.
---

# SALLY Internal Documentation

Documentation for developers, architects, and contributors working on SALLY — an AI-native fleet operations platform for US trucking carriers.

## Start Here

<div class="grid cards" markdown>

-   **New to the project?**

    Start with [Getting Started → Environment Setup](getting-started/environment-setup.md). Clone, install, run, ship a first PR — about a day end-to-end.

-   **Need to understand the system design?**

    Read [Architecture](architecture/index.md) — system overview, backend/frontend deep dives, data model, AI stack, observability, ADRs.

-   **Building a feature?**

    The [Backend Guide](backend/index.md) and [Frontend Guide](frontend/index.md) cover patterns and how-tos. The [Standards](standards/index.md) section lists the non-negotiable rules code review enforces.

-   **Submitting a PR?**

    [Contributing](contributing/index.md) covers the git workflow, what reviewers look at, and the (mostly manual) gate model.

</div>

## Quick reference

| Resource | URL / command |
|---|---|
| Web app (dev) | `http://localhost:3001` — `pnpm doppler:frontend` |
| Console (dev) | `http://localhost:3002` — `pnpm doppler:console` |
| Backend API (dev) | `http://localhost:8001/api/v1` — `pnpm doppler:backend` (Doppler injects `PORT=8001`; bare `pnpm dev` falls back to `8000`) |
| Inngest dev UI (Desk workflow engine) | `http://localhost:8288` (auto-starts with `docker-compose up -d`) |
| Prisma Studio | `pnpm prisma:studio` from `apps/backend/` |
| Grafana (opt-in observability) | `http://localhost:3003` — start with `docker-compose --profile observability up -d` |
| Tempo OTLP receiver (used by backend) | `http://localhost:4318` (HTTP) / `4317` (gRPC) |
| Loki ingest (used by backend Pino transport) | `http://localhost:3100` |

## Tech stack at a glance

| Layer | Technology |
|---|---|
| Backend | NestJS 11, TypeScript 5.9, Prisma 7.3, PostgreSQL 16 (pgvector), Redis 7, BullMQ |
| Frontend | Next.js 15, React 18, Tailwind CSS, Shadcn/ui (via `@sally/ui`), TanStack Query 5, Zustand 5 |
| Shared | Zod schemas + auto-generated Prisma enum mirrors in `@sally/shared-types` |
| Auth | Firebase Authentication (frontend), JWT-backed tenant context (backend) |
| AI | AI SDK 6, Mastra (agent framework), MCP, Vercel AI Gateway (model routing), Inngest (Desk durable workflows) |
| Observability | OpenTelemetry → Tempo (traces), Pino → Loki (logs), Grafana (UI) — all opt-in locally |
| Infra | Docker Compose (dev), AWS ECS + Terraform (prod), Vercel (web + console deploy hooks) |
| Monorepo | Turborepo + pnpm 9 |
| Secrets | Doppler |

The published version of these docs lives at <https://app-shore.github.io/sally/>. Updates are deployed manually via the `Deploy Internal Docs` GitHub Actions workflow.

## Viewing locally

```bash
pip install mkdocs-material   # one-time
mkdocs serve --dev-addr=127.0.0.1:8765
# open http://127.0.0.1:8765
```

The default mkdocs port (`8000`) conflicts with the backend's dev port, so prefer `8765` (or any free port) for local doc preview.

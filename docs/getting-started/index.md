---
title: Getting Started
description: Onboarding for new SALLY developers — prerequisites, setup, project structure, and your first PR.
---

# Getting Started

Welcome to SALLY. This section takes you from zero to a running dev environment and a shipped first PR.

## Onboarding path

| Step | Page | What you do |
|---|---|---|
| 1 | [Environment Setup](environment-setup.md) | Clone the repo, install dependencies, start Docker services, run the apps |
| 2 | [Project Structure](project-structure.md) | Where backend domains, frontend features, packages, and tests live |
| 3 | [Common Tasks](common-tasks.md) | Recipes for everyday work — migrate, seed, reset, view traces |
| 4 | [Your First PR](first-pr.md) | Branch model, conventional commits, local checks, the (manual) gate model |

## Prerequisites

| Tool | Version | Verify | Notes |
|---|---|---|---|
| Node.js | 20+ (CI baseline) | `node -v` | CI workflows pin Node 20; `quality-gate.yml` pins 22. Either is fine locally. |
| pnpm | 9.15.0 | `pnpm -v` | Pinned in `package.json` `packageManager`. Run `corepack enable` once to auto-install. |
| Docker (+ Compose v2) | Recent | `docker --version`, `docker compose version` | Runs Postgres, Redis, Inngest (and Loki/Tempo/Grafana when you opt in). |
| Git | 2.30+ | `git --version` | We use worktrees for parallel branches. |
| Doppler CLI | Latest | `doppler --version` | Secrets injection. Run `doppler login` once per machine. |

## Quick links once you're up

| Resource | URL | How |
|---|---|---|
| Web app | `http://localhost:3001` | `pnpm doppler:frontend` |
| Console | `http://localhost:3002` | `pnpm doppler:console` |
| Backend API | `http://localhost:8001/api/v1` | `pnpm doppler:backend` |
| Inngest dev UI | `http://localhost:8288` | Auto-started by `docker-compose up -d` |
| Prisma Studio | (opens browser, port varies) | `pnpm prisma:studio` from `apps/backend/` |
| Grafana (opt-in) | `http://localhost:3003` | `docker-compose --profile observability up -d`, anonymous admin |

## After onboarding

- **[Architecture](../architecture/index.md)** — how the system fits together.
- **[Backend Guide](../backend/index.md)** and **[Frontend Guide](../frontend/index.md)** — patterns and how-tos.
- **[Standards](../standards/index.md)** — the non-negotiable code rules.
- **[Quality Gate](../qa/index.md)** — the test suites and how to run them.
- **[Contributing](../contributing/index.md)** — review process, the manual-gate truth.

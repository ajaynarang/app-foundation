---
title: "ADR-001: Monorepo with Turborepo + pnpm"
description: Decision to use a monorepo architecture with Turborepo and pnpm workspaces.
---

# ADR-001: Monorepo with Turborepo + pnpm

**Date:** 2025-06-01
**Status:** Accepted

## Context

SALLY consists of multiple applications — a NestJS backend, a Next.js frontend, a partner documentation portal, and a video rendering studio — along with shared code such as Zod schemas and TypeScript types. The team needed to decide whether to maintain these as separate repositories or consolidate them into a single repository.

Key concerns included:

- Shared types between frontend and backend drift quickly in polyrepo setups.
- Coordinating cross-app changes (e.g., API contract changes) requires synchronized PRs across repos.
- Developer onboarding is simpler when the entire system lives in one place.
- CI/CD pipelines need to be efficient and avoid rebuilding unchanged apps.

## Decision

We adopted a **monorepo** managed by **Turborepo** for task orchestration and **pnpm 9.15** for package management.

The repository structure:

- `apps/backend/` — NestJS 11 API
- `apps/web/` — Next.js 15 frontend
- `apps/console/` — SALLY Console (platform hub, API docs)
- `apps/studio/` — Remotion video rendering
- `packages/shared-types/` — Shared Zod schemas and TypeScript types (~40 files)

Turborepo's `turbo.json` defines the task dependency graph for `build`, `dev`, `test`, `lint`, `type-check`, `format`, and `clean` tasks. pnpm workspaces handle dependency resolution and hoisting.

**Alternatives considered:**

- **Polyrepo (one repo per app):** Rejected due to cross-app coordination overhead and shared type drift.
- **Nx:** Rejected in favor of Turborepo's simpler configuration and tighter pnpm integration.
- **Lerna:** Rejected as it is primarily designed for publishing npm packages, not application orchestration.

## Consequences

**Positive:**

- Shared types in `packages/shared-types/` are consumed directly — no publishing step, no version drift.
- Atomic commits span the full stack (API change + frontend update + type update in one PR).
- Turborepo's caching dramatically reduces CI build times for unchanged apps.
- Single `pnpm dev` command starts the entire development environment.

**Negative:**

- Repository size grows over time; initial clone is heavier than any single app repo.
- CI pipelines require filtering logic to determine which apps changed.
- All developers need awareness of the full monorepo structure, even if they primarily work in one app.
- pnpm's strict dependency resolution occasionally requires explicit peer dependency declarations.

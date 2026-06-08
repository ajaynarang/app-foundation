---
title: "ADR-012: Domain Enums as Prisma Enums"
description: Every domain enum lives in schema.prisma; frontend imports the auto-generated mirror from @sally/shared-types.
---

# ADR-012: Domain Enums as Prisma Enums

**Date:** 2026-05-20
**Status:** Proposed — drafted from observed CI scripts and shared-types layout; awaiting acceptance.

## Context

In the early codebase, domain enums (load status, driver role, alert severity, etc.) were declared in three places:

1. As `String @db.VarChar` columns in Prisma — no DB-level constraint.
2. As Zod `z.enum([...])` schemas in shared-types — manually maintained to match the DB.
3. As TypeScript union types hand-written in the frontend.

Three sources, three definitions, no automated link between them. New values added to the backend silently failed in the frontend; renamed values caused runtime mismatches.

## Decision

**Prisma enums in `apps/backend/prisma/schema.prisma` are the single source of truth for domain enums.**

The chain:

1. Define enums in `schema.prisma`:

    ```prisma
    enum LoadStatus {
      DRAFT
      DISPATCHED
      ENROUTE
      DELIVERED
      CANCELLED
    }
    ```

2. `prisma generate` produces the typed enum in `@prisma/client`. Backend code imports it directly:

    ```ts
    import { LoadStatus } from '@prisma/client';
    ```

3. `apps/backend/scripts/generate-shared-enums.ts` (chained into `pnpm prisma:generate`) emits `packages/shared-types/src/generated/prisma-enums.ts` — an auto-generated mirror. **Never hand-edit this file.**

4. Frontend imports from the mirror:

    ```ts
    import { LoadStatus } from '@sally/shared-types';
    ```

5. `pnpm lint:schema` (runs `tsx apps/backend/scripts/lint-schema.ts`) is a CI guardrail — one of four guardrails (full list in `sally-backend-patterns` skill §6.4) — that catches schema drift before it lands.

**Four explicit don'ts:**

1. Never hand-edit `packages/shared-types/src/generated/prisma-enums.ts`.
2. Never use `String @db.VarChar` for a field that's enum-shaped.
3. Never hand-write `'UPPER_LITERAL'` next to an enum field. Always import the enum.
4. Never bypass the generator.

## Consequences

### Positive

- Adding an enum value in `schema.prisma` propagates to the frontend after one `pnpm prisma:generate`. The compiler catches consumers that don't handle the new case.
- Renaming a value is a global rename — Prisma + frontend update in lockstep.
- Database-level enums catch invalid inserts at the DB, not at runtime in TypeScript.
- New engineers learn one rule instead of three places to update.

### Trade-offs

- Adding an enum value requires a migration — `tools/db/migrate.sh --env local`. That's the right friction for a schema change.
- The shared-types mirror is auto-generated; the file shows up in PRs whenever an enum changes. PR reviewers should expect this and approve the diff.

### Neutral

- This rule applies to **domain enums** — status, role, type, severity, category. Not to every fixed-set string in the codebase. For genuinely transient sets (CLI flags, test fixture names, internal config keys), Zod `z.enum([...])` is fine.

## Evidence

- `apps/backend/scripts/generate-shared-enums.ts` — the generator.
- `apps/backend/package.json` `scripts.prisma:generate` — chains the generator into the Prisma generate step.
- `apps/backend/package.json` `scripts.lint:schema` — runs `tsx scripts/lint-schema.ts`.
- `packages/shared-types/src/generated/prisma-enums.ts` — the mirror (auto-generated; never hand-edit).
- Memory pin: `project_domain_enums_series.md` — PRs #701 and #702 implemented the migration.
- `sally-backend-patterns` skill §6.4 — the full convention with the four CI guardrails.
- This convention is documented in [Standards → Domain Enums](../../standards/platform.md#domain-enums-are-prisma-enums).

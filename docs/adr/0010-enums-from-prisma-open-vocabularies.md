# ADR-0010 — Enums come from Prisma; open vocabularies are strings with a registry

**Date:** 2026-11-14 · **Status:** Adopted.

## Context

A status or kind that is spelled in three places (the schema, a backend constant, a web type) drifts: a value is
added to one and the other two answer wrong. Some lists, though, are not closed. The foundation cannot know a
product's event names, job names, timer kinds or notification types, and a Prisma enum would force a foundation
schema change for every product value.

## Decision

**A closed set of values is a Prisma enum, and every other copy is generated from it. An open set that a product
extends is a string column with a registry in code, never an enum.**

- **Closed sets.** Every enum lives in `packages/appshore/db/prisma/schema/*.prisma`. Backend code imports enums and
  the client from `@appshore/db`, never from `@prisma/client` (review only; no lint rule holds it today). The web
  and `@app/shared-types` import the generated mirror, `packages/shared-types/src/generated/prisma-enums.ts`,
  written by `packages/appshore/db/scripts/generate-shared-enums.ts` during `prisma:generate` and never edited by
  hand.
  - The mirror matches the schema: `apps/backend/src/architecture/enum-codegen-parity.spec.ts`.
  - An enum-shaped column is a Prisma enum unless `ALLOWED_STRING_COLUMNS` lists it with a reason:
    `schema-enum-conventions.spec.ts`.
  - No hand-written Zod enum shadows a generated one: `no-duplicate-zod-enums.spec.ts`.
  - Status values keep their casing at call sites, backend and web: `status-call-sites.spec.ts`,
    `web-status-casing.spec.ts`.
- **Open sets.** Each is a string with one registry that the foundation merges with the product's own entries:
  - **Event names:** the foundation's `FOUNDATION_EVENT_REGISTRY`
    (`packages/appshore/kernel/src/infrastructure/events/foundation-events.ts`) plus the product's
    `APP_EVENT_REGISTRY` (`apps/backend/src/platform-glue/events/event-registry.ts`), keys `app.<aggregate>.<verb>`.
    `DOMAIN_EVENTS` constants derive from the registry, and code names an event through them. The merged catalog
    has no duplicate key or constant name: `event-registry.spec.ts`.
  - **Queue and job names:** the kernel's lists are pinned to what the foundation runs
    (`foundation-vocabulary.spec.ts`); a product declares its own in
    `apps/backend/src/platform-glue/queue/job-names.ts`.
  - **Deadline kinds:** `DEADLINE_KINDS` in `apps/backend/src/platform-glue/deadlines/deadline-kinds.ts`, each with
    its handler (ADR [Outbox and deadlines](0003-outbox-and-deadlines.md)).
  - **Notification types:** `PLATFORM_NOTIFICATION_TYPES` in `@app/shared-types` plus the product's
    `APP_NOTIFICATION_TYPES` (`apps/backend/src/platform-glue/notifications/notification-types.ts`); the policy
    registry refuses to boot when a declared type has no policy (`notification-policy.registry.spec.ts`).
  - The columns that hold them and look enum-shaped (`Job.type`, `Deadline.kind`, `Notification.type`) are on the
    allow-list of `schema-enum-conventions.spec.ts`, each with its registry named as the reason.

## Consequences

- Adding a status value is one schema edit, `prisma:generate`, and a migration. The web picks it up from the mirror.
- A product adds an event, job, deadline kind or notification type in its own file under `platform-glue/`, with no
  foundation schema change and no migration.
- The database does not check an open value. A value written by hand that no registry names is a bug no registry
  catches.
- A new open vocabulary needs its registry, its allow-list entry with a reason, and an amendment here.

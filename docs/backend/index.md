---
title: Backend Guide
description: How-to guides for building on the SALLY NestJS backend.
---

# Backend Guide

Practical guides for working in `apps/backend/`. Deeper context lives in [Architecture → Backend](../architecture/backend.md).

## Contents

| Page | When you need it |
|---|---|
| [Module Structure](module-structure.md) | Adding a new module, or finding where existing code lives |
| [Adding an Endpoint](adding-endpoint.md) | Adding a new route to an existing module |
| [Database & Prisma](database-prisma.md) | Schema changes, migrations, seeds, the `tools/db/migrate.sh` rule |
| [Events & Queues](events-queues.md) | `DomainEvent`, BullMQ queues, durable subscribers, the wildcard rule |
| [Scheduled Jobs](scheduled-jobs.md) | DB-driven `ScheduleManagerService`, repeat jobs, why we don't use `@Cron` |
| [Testing](testing.md) | Jest patterns, mocking Prisma, where specs live, the intentional skips |

## Hard rules

These are enforced across the backend. Code review will catch them.

- **camelCase at the boundary.** Every DTO property, request body, response field, and service param is `camelCase`. Snake_case is correct only inside Prisma `where`/`data`/`select`/`include`/`orderBy` blocks. See [Standards → camelCase](../standards/platform.md#camelcase-at-the-api-boundary).
- **`tenant_id` on every query.** Every query touching domain data must filter by `tenant_id`. Controllers extend `BaseTenantController` to get the resolved tenant.
- **Domain enums are Prisma enums.** Single source of truth in `apps/backend/prisma/schema.prisma`; frontend imports the auto-generated mirror. See [Standards → Domain Enums](../standards/platform.md#domain-enums-are-prisma-enums).
- **`new DomainEvent(...)`, never plain objects.** Plain-object emits break wildcard subscribers. See [Events & Queues](events-queues.md).
- **`tools/db/migrate.sh`, never `prisma migrate dev`.** The latter resets mastra-owned tables. See [Database & Prisma](database-prisma.md).
- **TDD for new services.** Write the spec, watch it fail, write the minimum to pass, refactor.

## Running the backend

```bash
docker-compose up -d           # postgres + redis + inngest (default profile)
pnpm doppler:backend           # NestJS on :8001 (Doppler-injected)

# Or all three apps in iTerm2 tabs
pnpm dev:side
```

For tests:

```bash
pnpm backend:test                           # all backend Jest specs
cd apps/backend && pnpm test -- --watch     # watch mode
cd apps/backend && pnpm test:cov            # with coverage
```

For migrations, see [Database & Prisma](database-prisma.md). For the QA suite, see [Quality Gate](../qa/index.md).

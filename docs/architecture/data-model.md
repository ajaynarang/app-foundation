---
title: Data Model
description: Postgres 16 + pgvector, Redis + BullMQ, the Prisma schema layout, multi-tenancy, calendar dates vs timestamps.
---

# Data Model

SALLY's persistent state is a single Postgres database. The schema is large (131 models as of May 2026) but the rules are simple: every domain entity is tenant-scoped, every enum lives in the schema, every date column has a deliberate type.

## Stores

| Store | Used for | Where |
|---|---|---|
| Postgres 16 (+ pgvector) | Persistent state — entities, audit logs, embeddings for RAG | `apps/backend/prisma/schema.prisma` is the source of truth |
| Redis 7 | Caching (read-through), pub/sub for SSE fan-out, BullMQ backing store | `apps/backend/src/infrastructure/cache/`, `infrastructure/queue/` |
| BullMQ (on Redis) | 19 named queues for async work — see [Backend → Events & Queues](../backend/events-queues.md) | `apps/backend/src/infrastructure/queue/queue.constants.ts` |

pgvector handles embeddings used by the knowledge-base / RAG layer. The vector tables live in the same Postgres database as the rest of the schema; no separate vector store.

## Schema layout

The Prisma schema is the **single source of truth** for the relational data. 131 models grouped by concern:

| Group | Representative models |
|---|---|
| Identity | `User`, `Tenant`, `ApiKey` |
| Fleet | `Driver`, `Vehicle`, `Trailer`, `Load`, `Convoy`, `Customer`, `CustomerContact`, `Document`, recurring lanes |
| Financials | `Invoice`, `Settlement`, `Payment`, `BillingCustomer`, `BillingInvoice`, `BillingSubscription`, `BillingOverride`, factoring (`FactoringCompany`, `FactoringContact`, `FactoringTransaction`) |
| Operations | `Alert`, `AlertConfiguration`, `AlertNote`, `Announcement`, `HitlChallenge`, command-center entities |
| Integrations | `IntegrationConfig`, `IntegrationEntityMapping`, `IntegrationExternalEntity`, `EDIMessage`, `EDITradingPartner`, `EDIAutoAcceptRule`, email-intake (`EmailIngestSettings/Message/Thread/Attachment`) |
| AI | `Conversation`, `ConversationMessage`, `ConversationSession`, `AgentInvocationLog`, `DomainEventLog` (events live with AI because they're durable) |
| Desk | `DeskAgent`, `DeskApproval`, `DeskEntitySuppression`, `DeskEpisode`, `DeskEpisodeStep`, `DeskMemory`, `DeskResponsibility` |
| Driver | `Driver`, `DriverActionRequest`, `DriverFleetPreferences`, `DriverPayStructure`, `DriverPerformanceMetrics`, `DriverPreferences`, `DriverUnavailability` |
| IFTA | `IftaFiling`, `IftaFuelPurchase`, `IftaQuarter`, `IftaStateMileage`, `IftaTaxRate` |
| Fuel cards | `FuelCardType`, `BrandFuelCardAcceptance` |
| Platform | `FeatureFlag`, `Feedback`, `FleetOperationsSettings`, `CustomFieldDefinition`, `AccountingAccountMapping` |
| Add-ons | `AddOn`, `AddOnRequest` |

This is intentionally a partial enumeration — the schema is large and the doc cites the source file rather than reproducing it. Open `apps/backend/prisma/schema.prisma` to see the full set.

## Multi-tenancy

- Every domain model has a `tenant_id` column.
- Almost all queries filter by tenant — services receive the active tenant via constructor injection or `AsyncLocalStorage`.
- `BaseTenantController` (NestJS) is the controller superclass that resolves the tenant from the authenticated user.
- For AI-driven SQL (where the LLM constructs predicates), **row-level security** is enforced at the database. The `ai/rls/` sub-domain manages the RLS policies.

## Enums — single source of truth

Every domain enum is a Prisma enum. The frontend imports an auto-generated mirror from `@sally/shared-types` (file: `packages/shared-types/src/generated/prisma-enums.ts`). Never hand-edit the mirror; never hand-write enum string literals.

See [Standards → Domain Enums](../standards/platform.md#domain-enums-are-prisma-enums) for the full rule, the regeneration chain, and the four don'ts.

## Calendar dates vs timestamps

This trips people up enough that it deserves its own subsection.

**Calendar dates** (a day, no time component):

- Prisma type: `@db.Date`.
- TypeScript representation: `string` in `YYYY-MM-DD` format. **Never** convert to a `Date` object — it'll get a timezone offset applied and shift by a day depending on where the server runs.
- Examples: a driver's date of birth, a settlement period's start/end day, an IFTA quarter's first/last day.

```ts
// CORRECT
const dob: string = driver.date_of_birth;  // "1985-03-12"
if (dob < '2000-01-01') { ... }            // string comparison is safe for YYYY-MM-DD

// WRONG — adds a timezone offset
const dobDate = new Date(driver.date_of_birth);
```

**Timestamps** (a specific instant):

- Prisma type: `@db.Timestamptz` (timestamp with timezone — always UTC at rest).
- TypeScript representation: ISO 8601 string when crossing the API boundary; `Date` in service code.
- Examples: when an alert was raised, when a payment cleared, when a driver pinged.

```ts
// CORRECT
return {
  createdAt: load.created_at.toISOString(),  // "2026-05-20T14:23:11.000Z"
};
```

The full rule lives in the memory file `date-time-handling.md`. The summary above is the only line you'll usually need.

## Migrations

Run via `tools/db/migrate.sh` — never `prisma migrate dev`. The reason: `prisma migrate dev` calls `db push` semantics on drift and will reset mastra-owned tables that Prisma doesn't know about. The wrapper script uses `prisma migrate deploy` (idempotent, drift-tolerant).

See [Backend → Database & Prisma](../backend/database-prisma.md) for the flag reference and the staging-tunnel flow.

## Inspecting

```bash
cd apps/backend
doppler run -- pnpm prisma:studio
```

For ad-hoc psql, the local `DATABASE_URL` is `postgresql://sally_user:sally_password@localhost:5432/sally`.

## Backups + retention

Production: AWS RDS automated backups, point-in-time recovery configured in `infra/terraform/`. The backend's `data-retention` module (`apps/backend/src/infrastructure/queue/data-retention.module.ts`) holds the application-side retention jobs.

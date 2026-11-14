# ADR-0002 — ID boundary

**Date:** 2026-11-12 · **Status:** Adopted. An enforced rule for new code. The numeric ids that already cross the
API are listed, with a reason each, and that list may only shrink.

## Context

The starter's id convention has always said that an `Int` primary key is internal: it is the join key, and it
"never goes in a URL or an AI tool input". Nothing held that. A service that returns a raw database row leaks a
dozen integer keys at once, and a route that takes `:id` with `ParseIntPipe` invites a caller to walk the table.
When this record was written, 42 route params were parsed as integers and the shared types held 23 numeric id
fields.

A starter is copied. A product built on it inherits whichever habit the starter shows, and a numeric id that has
shipped in a URL is hard to take back: links are saved, agents store ids, exports are archived.

Lists made the question concrete. A cursor list ordered by a date needs a unique tiebreak, and the cursor is
handed to the client. Four listed tables (`announcements`, `feedback`, `jobs`, `login_events`) had only an `Int`
key to offer.

## Decision

### The boundary

The **boundary** is: HTTP controllers, MCP tools, SSE and webhook egress, event payloads that leave the process,
and every schema exported from `@app/shared-types`. Inside it (services, Prisma, joins, foreign keys) `Int` keys
are used freely.

### Three rules

1. **Resolve on the way in.** No boundary input (`@Param`, `@Query`, `@Body`, an MCP tool parameter) takes a
   numeric entity id. It takes the record's public id, or its human number where it has one, and the service
   resolves that to the primary key. An unknown public id is a 404, never a database error.
2. **Serialize on the way out.** No boundary output is a raw database row. A record crosses through a serializer
   that sits beside its service, emits the public id, and leaves out `id` and every numeric foreign key. Nested
   people and tenants are named by their public ids too (`userId`, `tenantId`).
3. **Public ids in event payloads.** A domain event that can reach a webhook, the SSE bridge or the event log
   carries public ids. A numeric id may sit only in a field that never leaves the process.

A cursor follows from rules 1 and 2: it is opaque to the client but not encrypted, so its tiebreak is a public
identifier, never an `Int` primary key.

### A sixth id role: the public id

The id convention (`docs/standards/id-convention.md`) names five roles. This record adds a sixth.

> A **public id** is a separate unique column. It is never the primary key, and it never duplicates a sibling
> `*Number`.

Which form it takes:

| The table                                                                                                     | Its public id                                                                                 |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Has a human number (`ticketNumber`) or a string id already (`userId`, `tenantId`, `invitationId`, `clientId`) | That column. Do not add a second one.                                                         |
| A **new** aggregate with no human number                                                                      | `generateId(prefix)` in a `VarChar(30)`, for example `inv_k3j2…`. The prefix says what it is. |
| An **existing** table that only needs an address or a list tiebreak                                           | `public_id UUID`, unique, with the database default `gen_random_uuid()`                       |

The `UUID` form exists for the third row only. A database default means a SQL-only backfill, and old code and raw
SQL keep inserting during a rolling deploy. The writers of the two append-heavy tables (`jobs`, `login_events`)
pass a UUIDv7, so the unique index fills in order.

The convention's ban on random UUIDs is reworded to match: UUIDv4 is banned as the **primary key** of an audit
table. A `public_id` backfill and its default may use it.

### Adding `public_id` to a table that has rows

One migration, five guarded steps, so no statement rewrites the table and the migration is safe to run twice:

```sql
ALTER TABLE "t" ADD COLUMN IF NOT EXISTS "public_id" UUID;                    -- nullable, no rewrite
UPDATE "t" SET "public_id" = gen_random_uuid() WHERE "public_id" IS NULL;     -- backfill
ALTER TABLE "t" ALTER COLUMN "public_id" SET DEFAULT gen_random_uuid();
ALTER TABLE "t" ALTER COLUMN "public_id" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "t_public_id_key" ON "t"("public_id");
```

Adding the column with a volatile default in a single statement rewrites the whole table under an exclusive lock.
On a large table the update, the `NOT NULL` scan and the index build are the slow steps: run them by hand first
(update in batches, `CREATE UNIQUE INDEX CONCURRENTLY`), and the shipped migration then finds nothing to do.

### What moved, and what is listed

Moved to a public id with this record:

- **Broadcasts** (`/admin/broadcasts/:id`) and **feedback** (`/admin/feedback/:id`): the id in the URL is the
  row's `public_id`, parsed as a uuid. Rows are serialized; the author, the reporter, the resolver and the tenant
  are named by their public ids.
- **Invitations**: the list no longer returns the acceptance token (a bearer secret) or any numeric key.
- **Notifications**: the inbox returns a serialized row named by `notificationId`.
- **Sync history**: a run is named by its job's `public_id`.
- **Every cursor**: tiebreaks are public ids (`publicId`, `userId`, `tenantId`, `invitationId`, `clientId`,
  `notificationId`, `ticketNumber`) or a string row id (a UUIDv7 or cuid on tables that never had an `Int` key).

Still numeric, and listed in `apps/backend/src/architecture/id-boundary.allowlist.json` with the reason:

- The **super-admin console**: admin jobs, admin AI spend, admin schedules, billing admin, and the numeric
  `tenant_id` filters of the admin lists. No product built on this starter has converted these; they move
  together or not at all.
- **API keys**: the table has no public id, and the key hash is a secret. A key is addressed by its numeric id,
  and its two lists use that id as the cursor tiebreak. It is the one cursor that carries an `Int` key, and it
  carries nothing the URL does not already show.
- **Support tickets**: the lists page by `ticketNumber`, but the ticket routes still take the numeric id.
- A handful of shared types that hold foreign keys (`UserPreferences`, `PlanConfig`, the login-activity audit
  rows, the in-process AI telemetry shapes).

## What is enforced, and by what

`apps/backend/src/architecture/id-boundary.spec.ts` runs with the other architecture specs in the pre-push hook
(`pnpm verify:arch`) and in `pnpm verify`. It reads four surfaces:

| Surface                                                        | A finding is                                          |
| -------------------------------------------------------------- | ----------------------------------------------------- |
| Every `dto/` folder under the app's and the platform's domains | a property named `id`, `*Id` or `*Ids` typed `number` |
| Every controller                                               | a route param parsed with `ParseIntPipe`              |
| Every `*.tool.ts` under the AI domain                          | an id parameter declared `z.number()`                 |
| Every schema in `@app/shared-types`                            | an `id` or `*Id` field declared `z.number()`          |

A finding in a file that is not on the allowlist fails. So does one more finding in a listed file, an entry whose
file has since been fixed (lower its count or remove it), and an entry without a reason.

The cursor tiebreak is held one list at a time: each converted list has a spec that walks real pages over a
fixture, rows that share a timestamp included, and asserts the order it asked the database for.

## Consequences

- A new endpoint or tool that takes or returns a numeric id fails before it is pushed.
- A product adds its own aggregates with `generateId(prefix)` and never has to convert them later.
- Two URLs changed shape for existing clients: `/admin/broadcasts/:id` and `/admin/feedback/:id` take a uuid.
  `docs/upgrade-notes/contract-v1.md` lists them with the other wire changes.
- The allowlist is debt with a reason on every line. Converting the super-admin console, giving API keys a public
  id and moving the ticket routes to `ticketNumber` are the three follow-ups; each removes entries, and none is
  needed for a product to start.
- Removing an optional domain removes its entries: the allowlist is keyed by file path so a scaffold step can drop
  every entry under a folder.

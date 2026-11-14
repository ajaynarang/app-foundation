---
owner: foundation
sources:
  - packages/appshore/db/prisma/schema/app.prisma
  - packages/appshore/db/prisma/schema/foundation.prisma
  - packages/appshore/db/scripts/lint-schema.ts
  - packages/appshore/db/scripts/generate-shared-enums.ts
  - packages/appshore/platform/src/infrastructure/database/counter.service.ts#nextValue
  - packages/appshore/platform/src/test/mocks/prisma.mock.ts
  - docs/standards/id-convention.md
  - docs/standards/column-naming.md
guards:
  - script:lint:schema
  - schema-conventions.spec.ts
  - schema-enum-conventions.spec.ts
  - enum-codegen-parity.spec.ts
  - status-call-sites.spec.ts
  - no-duplicate-zod-enums.spec.ts
  - rls-no-array-transaction.spec.ts
  - id-boundary.spec.ts
examples:
  - projectNumber
  - ProjectKind
  - Cents
---

# Database: schema patterns, naming, enums, transactions, migrations

The canonical texts are `docs/standards/id-convention.md` (the six id roles and the boundary) and
`docs/standards/column-naming.md` (every field and column name). This file is the working summary and the recipe.
Models live in `packages/appshore/db/prisma/schema/`: `foundation.prisma` is the platform's and changes only for a
platform feature; `app.prisma` is the product's extension point. Backend code imports the client and enums from
`@appshore/db`, never `@prisma/client`.

## Rules

### Schema

- Fields are `camelCase`, mapped to `snake_case` columns with `@map`. [guard: script:lint:schema]
- Model names are singular `PascalCase`; tables are plural `snake_case` through `@@map`. [review-only: the linter
  checks fields, not table names]
- Every tenant-scoped model has `tenantId`, a relation to `Tenant.id`. [guard: script:lint:schema]
- A tenant-scoped model also has `createdAt` and `updatedAt`, and an index that starts with `tenantId`.
  [review-only: the linter checks only the tenant column]
- A `DateTime` field ends in `At` (an instant, `@db.Timestamptz`) or `Date` (a calendar day, `@db.Date`).
  [guard: script:lint:schema]
- Money is an `Int` in cents with a `Cents` suffix, never `Decimal` or `Float` for an amount.
  [review-only: the linter checks names, not every amount column's type]
- A `Json` column has its shape documented beside it. [review-only: needs reading]
- A foreign key targets `id`: `references: [id]`, never a slug or a business number. [guard: script:lint:schema]
- A soft-deletable new entity takes `deletedAt DateTime?` (and `deletedBy`), and its reads filter
  `deletedAt: null`; `isActive` booleans are legacy and get no new siblings. [review-only: no spec checks reads for
  the filter]

### Ids

- An operational table's key is `Int @id @default(autoincrement())`; an audit, event or log table's is a UUIDv7
  `String @id`. CUID is banned for new tables. [guard: script:lint:schema]
- A human identifier is a `<entity>Number` column from `CounterService.nextValue(tenantId, key)`, an atomic upsert, so
  two concurrent creates never share a number. Never a redundant `<entity>Id String` beside it.
  [review-only: no spec checks how a number is generated]
- A token lives in its own `*Token`, `*Key` or `*ShareLink` table, never on the entity row.
  [guard: script:lint:schema]
- An `Int` key never crosses the API. A new aggregate with no human number takes `generateId(prefix)` in a
  `VarChar(30)`; an existing table that needs an address takes `public_id UUID` through the five-step migration in
  `docs/standards/id-convention.md`. [guard: id-boundary.spec.ts]

### Enums

- Every status, role, type, priority, severity, category, tier, mode, stage, method, channel, scope or level column is
  a Prisma enum, never a `String`. A tenant-defined open set may stay a `String` with an entry and its reason in
  `ALLOWED_STRING_COLUMNS`. [guard: schema-enum-conventions.spec.ts]
- An app-owned vocabulary that every product extends (event names, job names, deadline kinds, notification types) is a
  `VarChar(60)` plus a registry checked at boot, allowlisted with the registry named; a product never edits
  `foundation.prisma` to add a value. [guard: schema-enum-conventions.spec.ts]
- The web and shared-types use the generated mirror, `packages/shared-types/src/generated/prisma-enums.ts`, regenerated
  by `pnpm --filter @appshore/db prisma:generate`; never hand-edit it. [guard: enum-codegen-parity.spec.ts]
- No hand-written upper-case literal next to an enum-typed field: import the enum. [guard: status-call-sites.spec.ts]
- No hand-written Zod enum that duplicates a Prisma enum. [guard: no-duplicate-zod-enums.spec.ts]

### Transactions and queries

- Every transaction is interactive, `$transaction(async (tx) => …)`, with every query inside on `tx`. The array form
  is banned: two tenants' array transactions in one tick would share the first one's context.
  [guard: rls-no-array-transaction.spec.ts]
- A parent and its children are created in one transaction, parent first, children with `createMany`; a delete runs
  children first, parent last. [review-only: foreign-key order is found by reading]
- No external call (HTTP, AI, a queue add) inside a transaction: it holds row locks and a rollback cannot undo it.
  Commit, then call; a crash between is retryable, not corrupt. [review-only: no spec scans transaction bodies]
- Find-then-create is racy: use `upsert` on a unique key. [review-only: needs reading]
- A financial write (a payment, an invoice, a wallet movement) checks for a duplicate before it creates: a unique key,
  or the request's idempotency key. [review-only: needs reading]
- No N+1: batch creates with `createMany`, batch updates with `updateMany` or one SQL statement, load relations with
  `include` or `select`. [review-only: needs reading]
- Composing a parent with children has three phases: resolve references and numbers outside the transaction, write
  atomically inside it, denormalize after the commit. Keep the transaction short. [review-only: needs reading]

### Migrations

- A schema change ships with a forward migration that keeps existing rows: additive first (a new table, a nullable
  column), a backfill separate from the schema change, a drop in a later migration.
  [review-only: no spec reads migration intent]
- A migration already on the default branch is never edited. [guard: .claude/hooks/protected-paths.mjs]
- An index for a cursor list starts with the scope columns, then the sort column, then the tiebreak; write it with
  `CREATE INDEX IF NOT EXISTS`. [review-only: needs reading]

## Recipe: add a model

1. Add the model to `packages/appshore/db/prisma/schema/app.prisma`: `id`, the public id or `<entity>Number`,
   `tenantId` with its relation, `createdAt`, `updatedAt`, enums for every enum-shaped column, and
   `@@index([tenantId, ...])`.
2. Regenerate the client and the enum mirror: `pnpm --filter @appshore/db prisma:generate`.
3. Create the migration without applying it, read the SQL, then apply:
   `pnpm --filter @appshore/db prisma:migrate --create-only`, then `pnpm --filter @appshore/db prisma:migrate:deploy`.
4. Run `pnpm lint:schema` and the schema specs (`pnpm --filter @app/backend exec jest src/architecture/schema`).
5. If a unit spec needs the model on the mock client, add it to the model list in
   `packages/appshore/platform/src/test/mocks/prisma.mock.ts`.
6. Commit the schema, the migration folder and the regenerated `prisma-enums.ts` together, and amend
   `docs/domain-map.md` if the model is part of the product's vocabulary.

A new enum value: edit the schema, regenerate, use `EnumName.MEMBER` on both sides, commit the schema and the mirror.
A new enum: declare it in the schema, use it as the column type, migrate with `CREATE TYPE` and `ALTER COLUMN`.

## Flag in review

- A `String` column whose name says enum, with no allowlist entry.
- `Decimal` or `Float` for money.
- A token column on an entity row; a foreign key to a non-key column.
- `this.prisma` inside a transaction callback; an external call inside one.
- A loop of `create` or `findUnique`.
- A migration that drops or renames in the same step as it adds.

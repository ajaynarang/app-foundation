# Column Naming Convention

Schema-level (Prisma model fields → DB columns), for `packages/appshore/db/prisma/schema/*.prisma`:

1. **Field names: camelCase.** Mapped to snake_case via `@map("...")`.
   Example: `createdAt DateTime @map("created_at")`

2. **Foreign-key columns: `<relation>Id`** (Int, references the parent's `id` PK).
   `projectId Int`, `taskId Int`, `tenantId Int`. Unambiguous — there is no
   competing `<entity>Id String` column (see id-convention.md).

3. **Public business identifiers: `<entity>Number`.**
   `Project.projectNumber`, `Invoice.invoiceNumber`.
   Never `<entity>Id` for a human-readable sequence.

4. **Opaque tokens: `<purpose>Token`, in a dedicated table.**
   `ProjectShareLink.token`. Never just `id` for a credential.

5. **Booleans: `is<X>` or `has<X>`.**
   `isArchived`, `hasAttachments`. Never `active` or `deleted`.

6. **Timestamps: `<verb>At` for events, `<noun>Date` for calendar dates.**
   `createdAt`, `completedAt @db.Timestamptz`
   `issueDate`, `dueDate @db.Date` — these are dates, not timestamps.

7. **Money: `<name>Cents` (Int).** Never `Decimal` / `Float` for line items.

8. **Counts: `<noun>Count`.** `viewCount`, `retryCount`.

9. **Enums: PascalCase enum name, SCREAMING_SNAKE_CASE values.**

10. **Tenant scoping: every tenant-scoped table has `tenantId Int`** (FK to `Tenant.id`),
    indexed, included in unique constraints where applicable.

## Banned

- snake_case Prisma field names (only in `@map` and `@db`).
- "deleted" boolean (use `deletedAt` for soft delete).
- "data" / "info" / "meta" Json columns without a documented schema.
- Hungarian notation: `strProjectId`, `intTaskId`.

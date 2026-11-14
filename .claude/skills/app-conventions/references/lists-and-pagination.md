---
owner: foundation
status: interim
pending: F2
sources:
  - packages/appshore/kernel/src/shared/utils/cursor-pagination.ts#keysetWhere
  - packages/appshore/kernel/src/shared/utils/cursor-pagination.ts#buildCursorPage
  - packages/appshore/kernel/src/shared/utils/cursor-pagination.ts#clampCursorLimit
  - apps/backend/src/domains/support/support.service.ts#pageTickets
  - apps/backend/src/domains/billing/services/invoice.service.ts#listInvoices
  - apps/backend/src/shared/lists/tenant-options.ts#listTenantOptions
  - apps/backend/src/architecture/api-contract.allowlist.json
  - packages/appshore/platform/src/test/helpers/cursor-walk.ts#walkCursorList
guards:
  - api-contract.spec.ts
  - cursor-pagination.spec.ts
examples:
  - PAYMENT_METHOD_LIST_CAP
---

# Lists and pagination: `CursorList`, the query-DTO kit, counts, bounded reads

Moved from the old backend skill; condensed with its recipe in its finish pull request. The query-DTO kit itself is in
[`api-contract.md`](api-contract.md).

Every list that can grow answers one envelope, `CursorList<T>` from `@app/shared-types`:
`{ items, nextCursor, total, counts? }`. The worked examples are `SupportService.pageTickets`
(`apps/backend/src/domains/support/support.service.ts`, tiebreak `ticketNumber`) and `InvoiceService.listInvoices`
(`apps/backend/src/domains/billing/services/invoice.service.ts`, tiebreak the cuid `id`).

## Rules

- A growing list is a cursor list: page size 50 by default and 100 at most, an opaque cursor, no offset, no page
  number, no second envelope (`{ data, total }`, `{ rows, nextCursor }`). [guard: api-contract.spec.ts]
- The query DTO extends `CursorQueryDto` (`limit`, `cursor`), `ListQueryDto` (adds `q`) or `DatedListQueryDto` (adds
  `from`, `to`). The controller passes the DTO on; the service clamps with `clampCursorLimit` and decodes with
  `keysetWhere` before any query runs, so a malformed cursor is a 400 that costs nothing.
  [guard: cursor-pagination.spec.ts]
- Order by the sort column, then a unique tiebreak in the same direction. A date column is `kind: 'date'` (the cursor
  keeps milliseconds, the database microseconds, so the helper treats the millisecond as a bucket); a name is
  `kind: 'text'`; a number or key is `kind: 'value'`. [guard: cursor-pagination.spec.ts]
- The tiebreak is a public identifier, never an `Int` primary key: the table's string id, its human number
  (`ticketNumber`) or a `publicId`. The two API key lists are the one exception (ADR "ID boundary").
  [guard: id-boundary.spec.ts]
- Fetch `take + 1` rows (the probe row says whether a next page exists) and build the page with
  `buildCursorPage(rows, take, encode)`. [guard: cursor-pagination.spec.ts]
- Join scope and keyset as `AND: [scope, keyset]`, never by spreading both into one object: each may carry an `OR`,
  and the second would replace the first. [review-only: needs reading]
- `total` counts the current view (search, filters, dates, status) and never the cursor. `counts` is for a status
  pivot: per-status totals for the same filters with the status filter left out. [review-only: needs reading]
- A sort over a SQL aggregate spells the keyset out in SQL and tags the cursor with what the totals depend on (the
  window's first day), so a cursor from another window is a 400 (`AdminAiSpendService.listTenants`).
  [review-only: needs reading]
- A picker is a cursor list with `q`: the first page until the person types, then a server search
  (`listTenantOptions`). [guard: api-contract.spec.ts]
- A list that does not grow may stay a bare array as an entry in `BOUNDED_LISTS` of
  `apps/backend/src/architecture/api-contract.allowlist.json`, with the reason its size is fixed or the named `take`
  that caps it. [guard: api-contract.spec.ts]
- Every other read a GET reaches is bounded: a `findMany` has a `take` with a named maximum
  (`PAYMENT_METHOD_LIST_CAP`), or the method is a `BOUNDED_READS` entry with the key or registry that fixes its size.
  Never load rows to count or sum them: `count`, `groupBy` or one SQL aggregate. [guard: api-contract.spec.ts]
- No controller returns a raw Prisma read. [guard: api-contract.spec.ts]
- An index backs the keyset: the scope columns, then the sort column, then the tiebreak
  (`@@index([tenantId, createdAt, publicId])`), added only where no index already starts that way, with
  `CREATE INDEX IF NOT EXISTS` in the migration. [review-only: needs reading]
- A list is tested by walking real pages: `fixtureModel(rows)`, `tiedTimestamps(n)` and `walkCursorList(read)` from
  `@appshore/platform/test/helpers/cursor-walk`. Assert every row comes back once across pages, ties included, that
  the total holds on every page, and that a cursor the service did not issue is a 400 before any query.
  [review-only: the test's presence needs reading]

## Flag in review

- `skip`, `page` or an offset in a list.
- An `Int` key as the tiebreak.
- `{ ...scope, ...keyset }`.
- A `findMany` with no `take` behind a GET, or rows loaded to count them.
- A list test at one page size.

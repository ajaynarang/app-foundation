---
owner: foundation
sources:
  - packages/appshore/kernel/src/shared/utils/cursor-pagination.ts#keysetWhere
  - packages/appshore/kernel/src/shared/utils/cursor-pagination.ts#buildCursorPage
  - packages/appshore/kernel/src/shared/utils/cursor-pagination.ts#clampCursorLimit
  - packages/appshore/kernel/src/shared/utils/cursor-pagination.ts#pivotCounts
  - packages/shared-types/src/infrastructure/cursor-list.ts#CursorList
  - apps/backend/src/domains/feedback/feedback.service.ts#listAll
  - apps/backend/src/domains/support/__tests__/support.service.spec.ts
  - apps/backend/src/domains/support/support.service.ts#pageTickets
  - apps/backend/src/domains/billing/services/invoice.service.ts#listInvoices
  - apps/backend/src/shared/lists/tenant-options.ts#listTenantOptions
  - apps/backend/src/architecture/api-contract.allowlist.json
  - packages/appshore/platform/src/test/helpers/cursor-walk.ts#walkCursorList
guards:
  - api-contract.spec.ts
  - cursor-pagination.spec.ts
  - list-query.spec.ts
---

# Lists and pagination: `CursorList`, the query-DTO kit, counts, bounded reads

How a list that can grow is read, paged, counted and tested. The query-DTO kit itself is in
[`api-contract.md`](api-contract.md); the web side of a list is [`frontend-lists.md`](frontend-lists.md).

Every list that can grow answers one envelope, `CursorList<T>` from `@app/shared-types`:
`{ items, nextCursor, total, counts? }`. The worked examples are `SupportService.pageTickets`
(`apps/backend/src/domains/support/support.service.ts`, tiebreak `ticketNumber`), `FeedbackService.listAll`
(`apps/backend/src/domains/feedback/feedback.service.ts`, tiebreak `publicId`, with a status pivot) and
`InvoiceService.listInvoices` (`apps/backend/src/domains/billing/services/invoice.service.ts`, tiebreak the cuid `id`).

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
  [review-only: no spec reads a keyset's `idField`; `id-boundary.spec.ts` covers DTOs, route params and Zod schemas,
  not cursors]
- Fetch `take + 1` rows (the probe row says whether a next page exists) and build the page with
  `buildCursorPage(rows, take, encode)`. [guard: cursor-pagination.spec.ts]
- Join scope and keyset as `AND: [scope, keyset]`, never by spreading both into one object: each may carry an `OR`,
  and the second would replace the first. [review-only: needs reading]
- `total` counts the current view (search, filters, dates, status) and never the cursor. [review-only: needs reading]
- `counts` is for a status pivot: one grouped count over the scope without the status filter, turned into every
  declared status (zero-filled) and the total in view by `pivotCounts(grouped, statuses, inView)`.
  [guard: cursor-pagination.spec.ts]
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

## Recipe: a cursor list

Copied from `apps/backend/src/domains/support/support.service.ts` (the query DTO is `TicketListQueryDto`, extending
`CursorQueryDto`):

```typescript
const TICKET_KEYSET = { field: 'createdAt', idField: 'ticketNumber', kind: 'date', direction: 'desc' } as const;

private async pageTickets(scope: Prisma.SupportTicketWhereInput, params: { limit?: number; cursor?: string }, extraInclude: Prisma.SupportTicketInclude) {
  const take = clampCursorLimit(params.limit);
  // Decoded before any query runs: a malformed cursor is a 400 and costs nothing.
  const keyset = params.cursor ? keysetWhere({ ...TICKET_KEYSET, cursor: params.cursor }) : undefined;
  const [rows, total] = await Promise.all([
    this.prisma.supportTicket.findMany({
      where: keyset ? { AND: [scope, keyset] } : scope,
      orderBy: [{ createdAt: 'desc' }, { ticketNumber: 'desc' }],
      take: take + 1,
      include: { /* ... */ _count: { select: { messages: true } } },
    }),
    this.prisma.supportTicket.count({ where: scope }),
  ]);
  const page = buildCursorPage(rows, take, (row) => encodeCursor(row.createdAt, row.ticketNumber));
  return { items: page.items.map((t) => this.mapTicketResponse(t)), nextCursor: page.nextCursor, total };
}
```

A status pivot, from `listAll` in `apps/backend/src/domains/feedback/feedback.service.ts`: the page reads the view
(scope plus the status), the counts read the scope alone.

```typescript
const [rows, grouped] = await Promise.all([
  this.prisma.feedback.findMany({
    where: keyset ? { AND: [view, keyset] } : view,
    orderBy: [...NEWEST_FIRST],
    take: take + 1,
  }),
  this.prisma.feedback.groupBy({ by: ['status'], where: scope, _count: { _all: true } }),
]);
const { counts, total } = pivotCounts(
  grouped.map((row) => ({ key: row.status, count: row._count._all })),
  FEEDBACK_STATUSES,
  query.status ? [query.status] : undefined,
);
```

1. Write the query DTO on `CursorQueryDto`, `ListQueryDto` or `DatedListQueryDto`; each filter is a kit decorator.
2. Pick the sort column and a unique public tiebreak; write the keyset constant beside the service.
3. Clamp, decode, fetch `take + 1` with `AND: [scope, keyset]`, count the view, build the page, serialize the items.
4. Name the response with `defineCursorListSchema` in `openapi.responses.ts` and regenerate OpenAPI.
5. Add the index the keyset needs (scope, sort, tiebreak) if none starts that way.
6. Test it the way `apps/backend/src/domains/support/__tests__/support.service.spec.ts` does: `tiedTimestamps(9)` rows
   through `fixtureModel`, then `walkCursorList` at a small `limit`; assert each row once, the order, the same total on
   every page, another tenant's rows absent, and a foreign cursor a 400 before `findMany` is called.

## Flag in review

- `skip`, `page` or an offset in a list.
- An `Int` key as the tiebreak.
- `{ ...scope, ...keyset }`.
- A `findMany` with no `take` behind a GET, or rows loaded to count them.
- A list test at one page size, or one that asserts the arguments it passed instead of walking pages.
- `counts` computed with the status filter applied, so the pivot numbers move when the pivot changes.

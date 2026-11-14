---
owner: foundation
status: interim
pending: F1
sources:
  - packages/appshore/web-core/src/shared/list/use-cursor-list.ts#useCursorList
  - packages/appshore/web-core/src/shared/list/use-list-params.ts#useListParams
  - packages/appshore/web-core/src/shared/list/use-list-params.ts#useLocalListParams
  - packages/appshore/web-core/src/shared/list/use-picker-search.ts#usePickerSearch
  - packages/appshore/web-core/src/shared/list/combine-reads.ts#combineReads
  - packages/appshore/web-core/src/shared/list/list-params.ts#listEmptyKind
  - apps/web/src/shared/components/page-chrome/index.ts
  - apps/web/src/shared/components/page-chrome/search-select.tsx#SearchSelect
  - apps/web/src/features/platform/api-keys/hooks/use-tenant-api-keys.ts#useTenantApiKeys
  - apps/web/src/app/settings/members/page.tsx
guards:
  - use-cursor-list.test.tsx
  - list-params.test.ts
  - use-local-list-params.test.tsx
  - use-picker-search.test.tsx
  - list-empty-kind.test.ts
  - list-footer.test.tsx
  - ui-grammar-guard.test.ts
---

# Frontend lists: the cursor list, URL state, the branch order, pickers, tables

Moved from the old frontend skill; condensed with the list recipe in its finish pull request. The backend half is
[`lists-and-pagination.md`](lists-and-pagination.md); the chrome around a list is in [`ui-grammar.md`](ui-grammar.md).

A list that grows is a cursor list built from the list kit (`@appshore/web-core/shared/list`, re-exported with the
chrome by `@/shared/components/page-chrome`). The backend answers `CursorList<T>` from `@app/shared-types`:
`{ items, nextCursor, total, counts? }`. The cursor is opaque: pass it back, never build or parse it.

## Rules

- A growing list reads through `useCursorList({ queryKey, queryFn: (cursor) => … })`. It returns `items`, `total`,
  `counts`, `isLoading`, `isRefreshing`, `isError`, `error`, `hasMore`, `loadMore`, `isLoadingMore` and
  `isLoadMoreError`. The API
  function takes `cursor` and returns `CursorList<T>`. [guard: use-cursor-list.test.tsx]
- Every list endpoint of the starter is a cursor list: no offset or page state, no Previous and Next pair, no
  `?page=`. "Load more" appends. The page size is the backend's (50, at most 100); pass `limit` only for fewer.
  [guard: use-cursor-list.test.tsx]
- The query key holds every filter, so a changed filter is a new list, back on page one; while it loads, the previous
  rows stay on screen dimmed (`isRefreshing`). Never swap rows for a spinner. [guard: use-cursor-list.test.tsx]
- `useListParams(CONFIG)`, with a module-level config, owns the page URL: status, search, sort, filters and the date
  range (`dateRange.fromInstant`, `dateRange.toInstant`). One list per page URL. A list inside a sheet or a tab that
  does not own the URL uses `useLocalListParams`. [guard: list-params.test.ts, use-local-list-params.test.tsx]
- Branch a list screen in this order: `isLoading` → `PageLoadingSkeleton`; `isError` → `ListErrorState`;
  `items.length === 0` → `PageEmptyState`, worded by `listEmptyKind` (`first-run`, `no-match`, `empty-window`);
  otherwise the rows, then `ListFooter`. A failed fetch never reads as "No … yet". [guard: ui-grammar-guard.test.ts,
  list-empty-kind.test.ts]
- Every list ends with `ListFooter` (`shown`, `total`, `hasMore`, `onLoadMore`, `isLoadingMore`, `loadMoreFailed`):
  it says "Showing 50 of 312" and holds Load more, so a list never stops silently; a failed Load more keeps the rows.
  [guard: list-footer.test.tsx]
- Never filter, count or sum a loaded page in the browser: a filter is a query param the server applies, and a figure
  over the whole list comes from the server (`total`, `counts`, or a summary endpoint). A screen that needs every row
  for an aggregate walks `nextCursor` with a page cap, never one unbounded read. [review-only: needs reading]
- A picker over a growing list uses `usePickerSearch` (and `SearchSelect` in a form): the first page until the person
  types, then a server search. [guard: use-picker-search.test.tsx]
- Several reads feeding one screen are joined with `combineReads`, so "unknown" never shows as "none".
  [review-only: no spec finds a screen that should combine its reads]
- A table is the shadcn `Table` from `@app/ui`; non-essential columns hide on small screens (`hidden sm:table-cell`,
  `hidden md:table-cell`); a row's actions are `RowActions` (one visible primary, the rest behind ⋯, destructive last).
  [guard: ui-grammar-guard.test.ts]

## Flag in review

- `offset`, `page` or a Previous and Next pair in a list.
- A count, sum or filter over the loaded rows.
- A list with no `ListFooter` or no `ListErrorState`.
- Rows replaced by a spinner while a new filter loads.
- A picker that filters a loaded page instead of searching the server.

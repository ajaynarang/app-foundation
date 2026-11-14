---
owner: foundation
sources:
  - packages/appshore/web-core/src/shared/list/use-cursor-list.ts#useCursorList
  - packages/appshore/web-core/src/shared/list/use-list-params.ts#useListParams
  - packages/appshore/web-core/src/shared/list/use-list-params.ts#useLocalListParams
  - packages/appshore/web-core/src/shared/list/use-picker-search.ts#usePickerSearch
  - packages/appshore/web-core/src/shared/list/combine-reads.ts#combineReads
  - packages/appshore/web-core/src/shared/list/list-params.ts#listEmptyKind
  - packages/appshore/web-core/src/shared/list/list-params.ts#toggleNamedSort
  - packages/appshore/web-core/src/shared/list/list-params.ts#ANY_FILTER_VALUE
  - packages/appshore/web-core/src/shared/list/option-filter.ts#resolveOptionFilter
  - packages/appshore/web-core/src/shared/list/list-shortcuts.ts#segmentCounts
  - packages/appshore/web-core/src/shared/list/list-shortcuts.ts#matchesSearch
  - packages/appshore/web-core/src/shared/list/name-list.tsx#NameListFilterRow
  - packages/ui/src/components/page-chrome/list-filter-row.tsx#ListFilterRow
  - packages/ui/src/components/page-chrome/list-filters.ts#filterRowMode
  - packages/ui/src/components/page-chrome/list-row.tsx#ListRow
  - packages/ui/src/components/page-chrome/list-card.tsx#ListCard
  - packages/ui/src/components/page-chrome/list-footer.tsx#ListFooter
  - packages/ui/src/components/page-chrome/list-search.tsx#LIST_SEARCH_DEBOUNCE_MS
  - packages/shared-types/src/infrastructure/cursor-list.ts#CURSOR_PAGE_SIZE
  - apps/web/src/shared/components/page-chrome/index.ts
  - apps/web/src/shared/components/page-chrome/search-select.tsx#SearchSelect
  - apps/web/src/features/admin/timers/components/TimersPage.tsx#TimersPage
  - apps/web/src/features/admin/timers/hooks.ts#useDeadlineList
  - apps/web/src/app/settings/members/page.tsx
guards:
  - use-cursor-list.test.tsx
  - list-params.test.ts
  - use-local-list-params.test.tsx
  - use-picker-search.test.tsx
  - list-empty-kind.test.ts
  - list-footer.test.tsx
  - list-filter-row.test.tsx
  - list-filters.test.ts
  - list-row.test.tsx
  - list-card.test.tsx
  - option-filter.test.ts
  - list-shortcuts.test.ts
  - status-pivot-overflow.test.tsx
  - ui-grammar-guard.test.ts
examples:
  - list.update
  - list.dateRange.label
  - list.isNarrowed
---

# Frontend lists: the list recipe, table or cards or rows, control order, URL state, short lists

Every screen that lists things reads as the same product: same zones, same control order, same search, sort, date
and paging. Build it from the kit; it is not a design conversation. The backend half (`CursorList`, query DTOs,
counts) is [`lists-and-pagination.md`](lists-and-pagination.md); the header, toolbar and row actions around a list
are in [`ui-grammar.md`](ui-grammar.md). The reference screen is the super-admin Timers page,
`apps/web/src/features/admin/timers/components/TimersPage.tsx`: a pivot with server counts, two option filters, a
named sort, all four states and the footer.

The kit has two halves, both imported from `@/shared/components/page-chrome`: the components
(`@app/ui/components/page-chrome`: `ListFilterRow`, `ListSearch`, `FilterSelect`, `FilterButton`, `FilterChips`,
`ListRows` and `ListRow`, `ListCardGrid` and `ListCard`, `ListFooter`, `ListErrorState`) and the state
(`@appshore/web-core/shared/list`: `useListParams`, `useLocalListParams`, `useCursorList`, `usePickerSearch`,
`NameListFilterRow`, `combineReads`, `resolveOptionFilter`, `segmentCounts`, `toggleNamedSort`, `matchesSearch`).
The backend answers `CursorList<T>` from `@app/shared-types`: `{ items, nextCursor, total, counts? }`. The cursor is
opaque: pass it back, never build or parse it.

## Rules

### The recipe, top to bottom

- A list page has five zones in this order: `PageHeader` (title and subtitle); `PageToolbar` (section tabs left,
  the one primary action right); the filter row (`ListFilterRow`); the list (a `Table`, `ListRows`, or
  `ListCardGrid`); `ListFooter`. Gaps: `space-y-4` from the filter row to the list, `space-y-3` around the list and
  its footer. [review-only: zone order and spacing need looking]
- The list takes one of three forms, chosen by how people read it. A **table** when people compare values across
  columns (every row has the same handful of attributes: members, invitations, tenants, timers). **Cards**
  (`ListCardGrid` and `ListCard`) when each item has its own identity and few shared columns. **Rows** (`ListRows`
  and `ListRow`) for a queue or a feed: one line per item, a key and a status at a glance. In doubt, rows. Never a
  hand-rolled `divide-y` stack or a `grid-cols` of `Card`s; never two forms on one list, never a different form per
  viewport (a table hides columns, rows hide trailing pieces, cards reflow). [review-only: the choice needs
  judgement; the components hold the rhythm, list-row.test.tsx and list-card.test.tsx]
- A growing list reads through `useCursorList({ queryKey, queryFn: (cursor) => … })`, inside the feature's hooks
  file. It returns `items`, `total`, `counts`, `isLoading`, `isRefreshing`, `isError`, `error`, `hasMore`,
  `loadMore`, `isLoadingMore` and `isLoadMoreError`. [guard: use-cursor-list.test.tsx]
- Paging is the cursor, appended by Load more: no offset or page state, no Previous and Next pair, no `?page=`.
  The page size is the backend's (`CURSOR_PAGE_SIZE`: 50, at most 100); pass `limit` only for fewer.
  [guard: use-cursor-list.test.tsx]
- The query key holds every filter, so a changed control is a new list, back on page one. While it loads, the
  previous rows stay on screen dimmed (`isRefreshing`, passed to `ListRows`, `ListCardGrid` or the table wrapper);
  never swap rows for a skeleton on a filter change. [guard: use-cursor-list.test.tsx, list-row.test.tsx]
- Branch the list zone in this order: `isLoading` → `PageLoadingSkeleton` (the shape of the list, `variant` and
  `rows`); `isError` → `ListErrorState` (a title, the error, Retry); `items.length === 0` → `PageEmptyState`;
  otherwise the list, then `ListFooter`. A failed fetch never reads as "No … yet".
  [guard: ui-grammar-guard.test.ts, use-cursor-list.test.tsx]
- The empty state has two flavours, picked by `listEmptyKind({ isNarrowed, windowLabel })`: `first-run` (nothing
  exists yet; say what will appear here), `no-match` (a search or filter hides everything; offer Clear) and
  `empty-window` (nothing in the date window; name the window and offer all time). An empty pivot other than the
  landing one says "nothing in this view". [guard: list-empty-kind.test.ts]
- Every list ends with `ListFooter` (`shown`, `total`, `windowLabel`, `hasMore`, `onLoadMore`, `isLoadingMore`,
  `loadMoreFailed`): "Showing 50 of 312 · last 30 days" and Load more, so a list never stops silently. A failed Load
  more keeps the rows. [guard: list-footer.test.tsx, use-cursor-list.test.tsx]
- The filter row never unmounts: only the zone under it swaps between skeleton, error, empty and rows, so a search
  box keeps its focus while results load. [review-only: needs reading]

### The filter row

- The control order is fixed. Left: the `StatusPivot` with counts, "All" last behind a divider
  (`dividerBefore: true`). Right, in order: search, filters, a `SegmentedControl` if any, the date, the sort, Clear.
  A control appears only when the list has that dimension, and its position never changes: no status means no pivot
  and the cluster stays right-aligned. [review-only: order of the children needs looking; list-filter-row.test.tsx
  holds the slots]
- Dropdown filters are declared once, as `ListFilterDeclaration[]` on `filters`, and the row decides
  (`filterRowMode`): one renders inline as a `FilterSelect`; two or more go behind one "Filter · n" button, with the
  applied ones as removable `FilterChips` under the row. Never place a `FilterSelect` or `FilterButton` by hand, and
  never keep a second copy of the applied state. The first option is always "All <things>".
  [guard: list-filters.test.ts, list-filter-row.test.tsx]
- Removing a chip clears only that filter and hands focus to the next chip, the previous one, or the Filter
  trigger; Clear shows only when `canClear` and resets search, filters, date and sort but keeps the pivot.
  [guard: list-filter-row.test.tsx, list-params.test.ts]
- `ListSearch` owns the one debounce (`LIST_SEARCH_DEBOUNCE_MS`); never debounce a list search by hand. The
  placeholder is "Search <things>…", and the server matches the human key as well as the name.
  [review-only: the server side of the match needs reading]
- The pivot's counts come from the server (`counts`, mapped to segments with `segmentCounts`); the server counts
  each row once, over the current search, filters and date window, ignoring only the status. A rarely used segment
  takes `overflow: true` and folds into one More menu that names the selected one.
  [guard: list-shortcuts.test.ts, status-pivot-overflow.test.tsx]
- A sort is a named option the endpoint whitelists (`newest`, `soonest`), through `SortButton`. Picking the active
  option again flips it: map that with `toggleNamedSort(current, picked, opposites)`, never ignore it. A list with a
  fixed order has no `SortButton` and one sort name in its config. [guard: list-params.test.ts]
- A list beside a rail passes `layout="wrap"` to `ListFilterRow`: one line while it fits, the controls under the
  pivot when it does not. [guard: list-filter-row.test.tsx]
- A name list (no status, no date: just a name to search and sort) uses `NAME_LIST_CONFIG` and
  `NameListFilterRow`; never rebuild that row per screen. [review-only: no screen in the starter is a name list yet]

### URL state

- `useListParams(CONFIG)` owns the page URL: `?status=&q=&sort=&from=&to=` plus the screen's own filter params,
  written with `router.replace` and no scroll. The config is a module-level constant. Defaults are never written,
  a filtered view survives back and refresh, and an unknown value in a link falls back to the default instead of
  erroring or reaching the API. [guard: list-params.test.ts]
- Always change list state through the setters (`setStatus`, `setQ`, `setSort`, `setFilter`, `setDateRange`,
  `clear`, or `list.update` for two changes at once); two changes made before the URL commits compose. Never call
  `router.replace` for a list param yourself. Params the list does not own (`?tab=`) are left alone.
  [guard: list-params.test.ts]
- One list per page URL. A page with two lists puts each in its own tab and drops the list params on a tab change.
  A list inside a sheet or a tab that does not own the URL uses `useLocalListParams` (the same contract, in
  component state, gone when the sheet closes); key it by the record so another record opens clean.
  [guard: use-local-list-params.test.tsx]
- A filter over server-defined records (a kind, a tenant, a project) is declared `ANY_FILTER_VALUE` and checked
  against the options the screen loaded with `resolveOptionFilter(linked, options, optionsQuery.isError)`. While
  the options load, a linked value holds the list (`enabled: !filter.holdList`); if they fail, the zone shows
  `ListErrorState` with a Retry for the options. A failed options fetch never reads as "All". Load those options
  from their own endpoint, never from the rows. An enum filter keeps its whitelist (the generated schema's
  `.options`). [guard: option-filter.test.ts]

### Dates

- A date control appears only where time is how people narrow the list: `DateRangeFilter` with `allTime`, always
  showing a value, wired to `list.setDateRange`. Presets are Today, 7, 30 and 90 days, Custom and All time.
  [review-only: where a date belongs needs judgement]
- An open queue opens on All time (its landing pivot never hides waiting work); history (settled pivots, logs)
  opens on the last 30 days. Say that per pivot with `defaultDateWindow` in the config. Once the person picks a
  range it is written to the URL and sticks across pivots; a preset is stored by name (`?from=7d`), so a link left
  open is still "last 7 days" tomorrow. [guard: list-params.test.ts]
- Send `list.dateRange.fromInstant` and `toInstant` to the API, never the calendar strings: the bounds are whole
  days in the person's timezone (from the page-chrome adapter). The footer names the window
  (`list.dateRange.label`). [guard: list-params.test.ts]

### Reads that are not one list

- Never filter, count or sum a loaded page in the browser: a filter is a query param the server applies, and a
  figure over the whole list comes from the server (`total`, `counts` or a summary endpoint). A screen that needs
  every row for an aggregate walks `nextCursor` with a page cap, never one unbounded read.
  [review-only: needs reading]
- A short list one tenant keeps to a handful, which the backend answers as a bounded list (a `BOUNDED_LISTS`
  entry), may search in the browser with `matchesSearch(term, fields)`; the moment it can grow, it moves to the
  server recipe. Never paginate in the browser. [guard: list-shortcuts.test.ts]
- An action over "all of these" says what it covers: a bulk button acts on the loaded rows, and when the server's
  count is larger it says so beside it. [review-only: needs reading]
- A picker over a growing list uses `usePickerSearch` (and `SearchSelect` in a form): the first page until the
  person types, then a server search. [guard: use-picker-search.test.tsx]
- Several reads feeding one panel are joined with `combineReads`, so any failed read shows `ListErrorState` and
  "unknown" never shows as "none". [review-only: no spec finds a panel that should combine its reads]

## Recipe: a list page

From `apps/web/src/features/admin/timers/`. The hook, in the feature's `hooks.ts`:

```typescript
export function useDeadlineList(params: Omit<DeadlineListParams, 'cursor'>, { enabled = true } = {}) {
  return useCursorList<DeadlineListItem, DeadlineState>({
    queryKey: queryKeys.deadlines.list(params as Record<string, unknown>),
    queryFn: (cursor) => timersApi.list({ ...params, cursor }),
    enabled,
    tier: QUERY_TIERS.OPERATIONAL,
  });
}
```

The page, trimmed, from `apps/web/src/features/admin/timers/components/TimersPage.tsx`. The config is a module
constant; the pivot's "All" is last; the sort is named:

```tsx
const LIST_CONFIG: ListParamsConfig<PivotValue, DeadlineListSort, TimerFilter> = {
  statuses: PIVOT_SEGMENTS.map((segment) => segment.value),
  defaultStatus: 'PENDING',
  sorts: DEADLINE_LIST_SORTS,
  defaultSort: DEFAULT_DEADLINE_LIST_SORT,
  filters: { kind: ANY_FILTER_VALUE, tenant: ANY_FILTER_VALUE },
};

function TimersPageInner() {
  const list = useListParams(LIST_CONFIG);
  const kindsQuery = useDeadlineKinds();
  const kindFilter = resolveOptionFilter(list.filters.kind, kindsQuery.data, kindsQuery.isError);
  const query = useMemo(
    () => ({ states: STATES_BY_PIVOT[list.status], kind: kindFilter.value, sort: list.sort }),
    [list.status, kindFilter.value, list.sort],
  );
  const deadlines = useDeadlineList(query, { enabled: !kindFilter.holdList });
  const pivotCounts = useMemo(
    () => segmentCounts(deadlines.counts, STATES_BY_PIVOT, DEADLINE_STATES),
    [deadlines.counts],
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Timers" subtitle="Every deadline the platform is holding — and whether it fired" />
      <div className="space-y-4">
        <ListFilterRow
          pivot={
            <StatusPivot
              segments={PIVOT_SEGMENTS}
              value={list.status}
              onChange={list.setStatus}
              counts={pivotCounts}
              label="Deadline state"
            />
          }
          filters={[
            {
              key: 'kind',
              label: 'Kind',
              allLabel: 'All kinds',
              options: kindOptions,
              value: kindFilter.value,
              onChange: (value) => list.setFilter('kind', value),
            },
          ]}
          canClear={list.isFiltered}
          onClear={list.clear}
        >
          <SortButton
            options={SORT_OPTIONS}
            sortBy={list.sort}
            sortOrder={SORT_ORDER[list.sort]}
            onSortChange={(value) => list.setSort(toggleNamedSort(list.sort, value as DeadlineListSort, SORT_OPPOSITE))}
          />
        </ListFilterRow>

        {deadlines.isLoading || kindFilter.status === 'loading' ? (
          <PageLoadingSkeleton variant="table" rows={8} />
        ) : deadlines.isError ? (
          <ListErrorState
            title="Couldn't load the timers."
            error={deadlines.error}
            onRetry={() => deadlines.refetch()}
            isRetrying={deadlines.isRefetching}
          />
        ) : deadlines.items.length === 0 ? (
          <PageEmptyState
            icon={Timer}
            title={list.isFiltered ? 'No timers in this view' : 'Nothing is waiting'}
            action={
              list.isFiltered ? (
                <Button variant="outline" size="sm" onClick={list.clear}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-3">
            <TimersTable deadlines={deadlines.items} isRefreshing={deadlines.isRefreshing} />
            <ListFooter
              shown={deadlines.items.length}
              total={deadlines.total}
              hasMore={deadlines.hasMore}
              onLoadMore={deadlines.loadMore}
              isLoadingMore={deadlines.isLoadingMore}
              loadMoreFailed={deadlines.isLoadMoreError}
            />
          </div>
        )}
      </div>
    </div>
  );
}
```

1. On the backend, the list endpoint first: a cursor list with `counts` if the page has a pivot
   ([`lists-and-pagination.md`](lists-and-pagination.md)).
2. Add the key namespace to `queryKeys` and the API object in the feature ([`frontend-data.md`](frontend-data.md)).
3. Write the hook over `useCursorList`; the query object is everything the server filters on.
4. Write the module-level config: statuses (the pivot values, "All" last), the named sorts, the filters
   (`ANY_FILTER_VALUE` for server-defined options, an enum's `.options` otherwise), `defaultDateWindow` if dated.
5. Wrap the page in `Suspense` (the URL hook reads search params), then render the zones and the four branches in
   the order above. Map each status to a tone in the feature's `constants.ts` and render it as a `StatusBadge`
   ([`ui-grammar.md`](ui-grammar.md)).
6. Check it at 375, 768 and 1440 px in both themes: one filter row, nothing off-screen, the footer always there.

## Flag in review

- `offset`, `page` or a Previous and Next pair in a list.
- A count, sum or filter over the loaded rows, or pivot counts derived on the client.
- A list with no `ListFooter` or no `ListErrorState`, or an empty state that is really a failed fetch.
- Rows replaced by a skeleton while a new filter loads, or a filter row that unmounts and drops focus.
- A control out of the fixed order, a hand-placed `FilterSelect`, or a second copy of the applied filters.
- A hand-rolled `divide-y` list or card grid, or two list forms on one screen.
- A list param written with `router.replace` by hand, two lists sharing one URL, or a sheet's list on the page URL.
- Calendar strings sent to the API instead of the instants, or a history list that opens on all time.
- A picker that filters a loaded page instead of searching the server.

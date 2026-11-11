'use client';

import { useMemo } from 'react';
import { keepPreviousData, useQuery, type QueryKey } from '@tanstack/react-query';
import type { CursorList } from '@app/shared-types';
import { useDebounce } from '../hooks/use-debounce';
import { LIST_SEARCH_DEBOUNCE_MS } from '@app/ui/components/page-chrome/list-search';

export interface PickerSearchSource<T> {
  /** The `page` key of the endpoint (never its paged `list` key) for the applied term. */
  queryKey: (q: string | undefined) => QueryKey;
  /** One page of the list endpoint for the applied term — `q` on the server, never a filter here. */
  queryFn: (q: string | undefined) => Promise<CursorList<T>>;
}

export interface UsePickerSearchOptions {
  enabled?: boolean;
}

/**
 * usePickerSearch — the rows behind a picker: the first page of a list endpoint until the user
 * types, then a SERVER search over every record on the shared list debounce. A picker never
 * filters a loaded page in the browser.
 *
 * `source` must keep its identity between renders (a module-level constant or `useMemo`).
 */
export function usePickerSearch<T>(
  term: string,
  source: PickerSearchSource<T>,
  { enabled = true }: UsePickerSearchOptions = {},
) {
  const typed = term.trim();
  const q = useDebounce(typed, LIST_SEARCH_DEBOUNCE_MS);
  const query = useQuery({
    queryKey: source.queryKey(q || undefined),
    queryFn: () => source.queryFn(q || undefined),
    placeholderData: keepPreviousData,
    enabled,
  });
  // A previous SEARCH's rows may stand in while the next loads; they never stand in for "no search".
  const page = query.isPlaceholderData && !q ? undefined : query.data;
  const items = useMemo(() => page?.items ?? [], [page]);

  return {
    items,
    /** How many records match in all — more than `items.length` when the page is full. */
    total: page?.total ?? 0,
    /** The applied (debounced) term; empty = the first page. */
    q,
    isSearching: q.length > 0,
    /** Nothing to show yet → skeleton. */
    isLoading: query.isLoading || (query.isPlaceholderData && items.length === 0),
    /** The rows on screen are not yet the answer to what was typed — dim them and ignore ↵. */
    isStale: typed !== q || query.isPlaceholderData,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

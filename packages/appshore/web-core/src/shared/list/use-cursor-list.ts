'use client';

import { keepPreviousData, useInfiniteQuery, type QueryKey } from '@tanstack/react-query';
import type { CursorList } from '@app/shared-types';
import { CONDITIONAL_POLL_INTERVAL_MS } from '../config/query-tiers';

export interface UseCursorListOptions<T, CountKey extends string> {
  /** The list key INCLUDING every filter — a changed filter is a new list, back on page one. */
  queryKey: QueryKey;
  /** Fetch one page; `cursor` is undefined for the first. */
  queryFn: (cursor: string | undefined) => Promise<CursorList<T, CountKey>>;
  enabled?: boolean;
  /** Spread a `QUERY_TIERS` entry here — never a hand-written staleTime. */
  tier?: { refetchOnWindowFocus?: boolean; staleTime?: number; refetchInterval?: number };
  /**
   * Refetch on the shared interval for as long as this says so — for rows that settle without an
   * event (a job in flight whose failure emits nothing). It sees every loaded row.
   */
  pollWhile?: (items: T[]) => boolean;
}

/**
 * useCursorList — cursor paging with appended pages ("Load more") over `useInfiniteQuery`.
 * Rows from the previous filter stay on screen while the new first page loads
 * (`isRefreshing`), so the list never flashes a skeleton between filters.
 *
 * The flags are shaped so a screen can branch `isLoading → isError → items.length === 0 → rows`
 * and be right: an empty PREVIOUS view never reads as "nothing here" for the new one, and a
 * failed Load more never throws away the rows already on screen.
 */
export function useCursorList<T, CountKey extends string = string>({
  queryKey,
  queryFn,
  enabled = true,
  tier,
  pollWhile,
}: UseCursorListOptions<T, CountKey>) {
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => queryFn(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
    enabled,
    ...tier,
    ...(pollWhile && {
      refetchInterval: (current: { state: { data?: { pages: CursorList<T, CountKey>[] } } }) =>
        pollWhile(current.state.data?.pages.flatMap((page) => page.items) ?? []) ? CONDITIONAL_POLL_INTERVAL_MS : false,
    }),
  });

  const pages = query.data?.pages ?? [];
  // Every page carries the totals; the newest fetch is the freshest.
  const latest = pages[pages.length - 1];
  const items = pages.flatMap((page) => page.items);

  return {
    items,
    total: latest?.total ?? 0,
    counts: latest?.counts,
    hasMore: query.hasNextPage,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    },
    isLoadingMore: query.isFetchingNextPage,
    /** The last Load more failed. The loaded rows stay; `<ListFooter>` says so and its button retries. */
    isLoadMoreError: query.isFetchNextPageError,
    /**
     * Nothing to show yet → skeleton. True on the first load AND while a new view loads over a
     * previous view that had no rows — those zero rows say nothing about the new view.
     */
    isLoading: query.isLoading || (query.isPlaceholderData && items.length === 0),
    /** Showing the previous filter's rows while the new ones load → dim the list. */
    isRefreshing: query.isPlaceholderData,
    /** The list could not be loaded and there is nothing to show → full error state. */
    isError: query.isError && items.length === 0,
    error: query.error,
    refetch: query.refetch,
    isRefetching: query.isRefetching,
  };
}

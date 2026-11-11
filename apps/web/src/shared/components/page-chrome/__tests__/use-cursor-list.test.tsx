/**
 * @jest-environment jsdom
 */
/* global describe, it, expect, jest */
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { CursorList } from '@app/shared-types';
import { CONDITIONAL_POLL_INTERVAL_MS } from '@appshore/web-core/shared/config/query-tiers';
import { useCursorList } from '@appshore/web-core/shared/list/use-cursor-list';

type Row = { id: string };
type Page = CursorList<Row>;

const page = (ids: string[], nextCursor: string | null, total = ids.length): Page => ({
  items: ids.map((id) => ({ id })),
  nextCursor,
  total,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return Wrapper;
}

describe('useCursorList', () => {
  it('is LOADING, not empty, while a new view loads over a previous view that had no rows', async () => {
    const received = deferred<Page>();
    const fetchers: Record<string, () => Promise<Page>> = {
      accepted: () => Promise.resolve(page([], null)),
      received: () => received.promise,
    };
    const { result, rerender } = renderHook(
      ({ view }: { view: string }) => useCursorList<Row>({ queryKey: ['list', view], queryFn: () => fetchers[view]() }),
      { wrapper: wrapper(), initialProps: { view: 'accepted' } },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items).toEqual([]);

    rerender({ view: 'received' });
    // The previous (empty) view is the placeholder — it says nothing about the new one.
    expect(result.current.isRefreshing).toBe(true);
    expect(result.current.items).toEqual([]);
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      received.resolve(page(['a', 'b'], null));
      await received.promise;
    });
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(result.current.isLoading).toBe(false);
  });

  it('keeps the previous rows (dimmed, not a skeleton) while a new view loads over a non-empty one', async () => {
    const next = deferred<Page>();
    const fetchers: Record<string, () => Promise<Page>> = {
      a: () => Promise.resolve(page(['a1'], null)),
      b: () => next.promise,
    };
    const { result, rerender } = renderHook(
      ({ view }: { view: string }) => useCursorList<Row>({ queryKey: ['list', view], queryFn: () => fetchers[view]() }),
      { wrapper: wrapper(), initialProps: { view: 'a' } },
    );
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    rerender({ view: 'b' });
    expect(result.current.isRefreshing).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.items).toEqual([{ id: 'a1' }]);
    await act(async () => {
      next.resolve(page([], null));
      await next.promise;
    });
  });

  it('keeps the loaded rows when Load more fails, and the next Load more retries', async () => {
    let failNext = true;
    const queryFn = (cursor: string | undefined): Promise<Page> => {
      if (cursor === undefined) return Promise.resolve(page(['a', 'b'], 'c1', 3));
      if (failNext) return Promise.reject(new Error('network blip'));
      return Promise.resolve(page(['c'], null, 3));
    };
    const { result } = renderHook(() => useCursorList<Row>({ queryKey: ['list'], queryFn }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.isLoadMoreError).toBe(true));
    // The rows stay; this is not the full-page error state.
    expect(result.current.isError).toBe(false);
    expect(result.current.items).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(result.current.hasMore).toBe(true);

    failNext = false;
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toHaveLength(3));
    expect(result.current.isLoadMoreError).toBe(false);
    expect(result.current.hasMore).toBe(false);
  });

  it('reports the full error state only when the list could not be loaded at all', async () => {
    const { result } = renderHook(
      () => useCursorList<Row>({ queryKey: ['list'], queryFn: () => Promise.reject(new Error('down')) }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.items).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isLoadMoreError).toBe(false);
  });

  it('polls on the shared interval only while pollWhile says so, over every loaded row', async () => {
    jest.useFakeTimers();
    try {
      let status = 'RUNNING';
      const queryFn = jest.fn(() => Promise.resolve(page([status], null)));
      const { result } = renderHook(
        () =>
          useCursorList<Row>({
            queryKey: ['list', 'polling'],
            queryFn,
            pollWhile: (rows) => rows.some((row) => row.id === 'RUNNING'),
          }),
        { wrapper: wrapper() },
      );
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });
      expect(result.current.items).toEqual([{ id: 'RUNNING' }]);
      expect(queryFn).toHaveBeenCalledTimes(1);

      status = 'DONE';
      await act(async () => {
        await jest.advanceTimersByTimeAsync(CONDITIONAL_POLL_INTERVAL_MS);
      });
      // The refetch of an infinite query settles a few ticks after its interval fires.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(50);
      });
      expect(queryFn).toHaveBeenCalledTimes(2);
      expect(result.current.items).toEqual([{ id: 'DONE' }]);

      // Settled: no further polling.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(CONDITIONAL_POLL_INTERVAL_MS * 3);
      });
      expect(queryFn).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
});

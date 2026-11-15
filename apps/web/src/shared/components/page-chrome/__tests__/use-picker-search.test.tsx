/**
 * @jest-environment jsdom
 */
/* global describe, it, expect, jest */
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { CursorList } from '@app/shared-types';
import { LIST_SEARCH_DEBOUNCE_MS } from '@app/ui/components/page-chrome/list-search';
import { usePickerSearch, type PickerSearchSource } from '@appshore/web-core/shared/list/use-picker-search';

type Row = { id: string };
const page = (ids: string[], total = ids.length): CursorList<Row> => ({
  items: ids.map((id) => ({ id })),
  nextCursor: null,
  total,
});

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return Wrapper;
}

function source(answers: Record<string, CursorList<Row> | Error>) {
  const queryFn = jest.fn((q: string | undefined) => {
    const answer = answers[q ?? ''];
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
  });
  const built: PickerSearchSource<Row> = { queryKey: (q) => ['rows', 'page', { q }], queryFn };
  return { built, queryFn };
}

describe('usePickerSearch', () => {
  it('lists the first page until the user types, and reports how many exist in all', async () => {
    const { built, queryFn } = source({ '': page(['a', 'b'], 40) });
    const { result } = renderHook(() => usePickerSearch('', built), { wrapper: wrapper() });

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(queryFn).toHaveBeenCalledWith(undefined);
    expect(result.current.total).toBe(40);
    expect(result.current.isSearching).toBe(false);
    expect(result.current.isStale).toBe(false);
  });

  it('does not fetch while disabled', () => {
    const { built, queryFn } = source({ '': page(['a']) });
    renderHook(() => usePickerSearch('', built, { enabled: false }), { wrapper: wrapper() });
    expect(queryFn).not.toHaveBeenCalled();
  });

  it('searches on the server after the shared debounce, and is stale until the answer lands', async () => {
    jest.useFakeTimers();
    try {
      const { built, queryFn } = source({ '': page(['a', 'b']), pay: page(['p']) });
      const { result, rerender } = renderHook(({ term }: { term: string }) => usePickerSearch(term, built), {
        wrapper: wrapper(),
        initialProps: { term: '' },
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });
      expect(result.current.items).toHaveLength(2);

      rerender({ term: ' pay ' });
      // Still typing: the rows on screen answer the previous term.
      expect(result.current.isStale).toBe(true);
      expect(queryFn).toHaveBeenCalledTimes(1);

      await act(async () => {
        await jest.advanceTimersByTimeAsync(LIST_SEARCH_DEBOUNCE_MS);
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });
      expect(queryFn).toHaveBeenLastCalledWith('pay');
      expect(result.current.items).toEqual([{ id: 'p' }]);
      expect(result.current.q).toBe('pay');
      expect(result.current.isSearching).toBe(true);
      expect(result.current.isStale).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('reports a failed search as an error, not as an empty result', async () => {
    const { built } = source({ '': new Error('boom') });
    const { result } = renderHook(() => usePickerSearch('', built), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.items).toEqual([]);
  });
});

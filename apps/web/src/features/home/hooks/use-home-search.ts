import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { queryKeys } from '@/shared/constants/query-keys';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { searchEntities, type SearchApiResult } from '@/shared/lib/search';

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 200;

/**
 * Wraps the existing `searchEntities` API with debounce + TanStack Query.
 *
 * - 200ms debounce prevents hammering the server while typing
 * - `placeholderData: keepPreviousData` prevents flicker between keystrokes
 * - Only fires when the debounced query is >= 2 characters
 */
export function useHomeSearch(rawQuery: string) {
  const debouncedQuery = useDebounce(rawQuery.trim(), DEBOUNCE_MS);
  const hasQuery = debouncedQuery.length >= MIN_QUERY_LENGTH;

  const { data, isLoading } = useQuery<SearchApiResult[]>({
    queryKey: queryKeys.home.search(debouncedQuery),
    queryFn: () => searchEntities(debouncedQuery),
    enabled: hasQuery,
    placeholderData: keepPreviousData,
  });

  return {
    results: data ?? [],
    isLoading: hasQuery && isLoading,
    hasQuery,
  };
}

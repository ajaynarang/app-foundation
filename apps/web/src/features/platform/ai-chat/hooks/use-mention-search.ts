import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { searchEntities } from '@/shared/lib/search';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { queryKeys } from '@/shared/constants/query-keys';

const MIN_QUERY = 2;
const DEBOUNCE_MS = 250;

/**
 * Debounced, gated entity search for the @-mention picker. Reuses the same
 * unified `/search` endpoint that powers ⌘K and the home search. Fetches only
 * once the (debounced) query is at least 2 characters.
 */
export function useMentionSearch(query: string) {
  const debounced = useDebounce(query, DEBOUNCE_MS);
  const enabled = debounced.trim().length >= MIN_QUERY;

  const { data, isFetching } = useQuery({
    queryKey: queryKeys.assistantAi.mentionSearch(debounced),
    queryFn: () => searchEntities(debounced),
    enabled,
    placeholderData: keepPreviousData,
  });

  return { results: data ?? [], isLoading: enabled && isFetching, hasQuery: enabled };
}

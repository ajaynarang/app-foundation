import { useQuery } from '@tanstack/react-query';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { stopsApi } from '../api';

export function useStopSearch(query: string) {
  const debouncedQuery = useDebounce(query, 300);

  return useQuery({
    queryKey: ['stops', 'search', debouncedQuery],
    queryFn: () => stopsApi.search(debouncedQuery || undefined),
    // Always fetch on mount (for recent stops even with empty query)
    enabled: true,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { queryKeys } from '@/shared/constants/query-keys';
import { QUERY_TIERS } from '@/shared/config/query-tiers';
import { placesApi } from '../api';
import { PLACES_DEBOUNCE_MS, PLACES_MIN_QUERY_LENGTH, PLACES_SUGGESTION_LIMIT } from '../constants';

/**
 * As-you-type address suggestions from the configured places provider (HERE).
 * Debounced; only fires once the trimmed query reaches the min length and the
 * caller opts in via `enabled` (the picker gates tier-3 on tier 1+2 hit count).
 */
export function usePlacesAutocomplete(rawQuery: string, opts?: { enabled?: boolean }) {
  const debounced = useDebounce(rawQuery.trim(), PLACES_DEBOUNCE_MS);
  const callerEnabled = opts?.enabled ?? true;

  return useQuery({
    queryKey: queryKeys.places.autocomplete(debounced),
    queryFn: () => placesApi.autocomplete(debounced, { limit: PLACES_SUGGESTION_LIMIT }),
    enabled: callerEnabled && debounced.length >= PLACES_MIN_QUERY_LENGTH,
    ...QUERY_TIERS.STATIC,
    placeholderData: keepPreviousData,
  });
}

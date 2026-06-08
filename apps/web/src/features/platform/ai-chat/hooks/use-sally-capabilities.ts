'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/shared/constants/query-keys';
import { QUERY_TIERS } from '@/shared/config/query-tiers';
import { getSallyCapabilities } from '../api';
import { useSallyStore } from '../store';

/**
 * Fetch the capability set for the current user. Mode is read from the
 * Sally store (set on auth) rather than a prop so callers don't have to
 * thread it through. Static-tier cache: capabilities rarely change.
 */
export function useSallyCapabilities() {
  const userMode = useSallyStore((s) => s.userMode);

  return useQuery({
    queryKey: queryKeys.sallyAi.capabilities(userMode),
    queryFn: () => getSallyCapabilities(userMode),
    ...QUERY_TIERS.STATIC,
  });
}

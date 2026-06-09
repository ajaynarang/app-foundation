'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/shared/constants/query-keys';
import { QUERY_TIERS } from '@/shared/config/query-tiers';
import { getAssistantCapabilities } from '../api';
import { useAssistantStore } from '../store';

/**
 * Fetch the capability set for the current user. Mode is read from the
 * Assistant store (set on auth) rather than a prop so callers don't have to
 * thread it through. Static-tier cache: capabilities rarely change.
 */
export function useAssistantCapabilities() {
  const userMode = useAssistantStore((s) => s.userMode);

  return useQuery({
    queryKey: queryKeys.assistantAi.capabilities(userMode),
    queryFn: () => getAssistantCapabilities(userMode),
    ...QUERY_TIERS.STATIC,
  });
}

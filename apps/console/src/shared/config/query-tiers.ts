export const QUERY_TIERS = {
  OPERATIONAL: {
    refetchOnWindowFocus: true as const,
  },
  STATIC: {
    staleTime: 5 * 60_000,
  },
  ACTIVE_POLL: {
    staleTime: 5_000,
    refetchInterval: 30_000,
  },
} as const;

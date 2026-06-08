/**
 * Query cache tier configuration.
 *
 * Most hooks need ZERO config — global defaults in providers.tsx handle
 * SSE-covered data (2-min staleTime, no polling, SSE invalidation pushes fresh data).
 *
 * Only spread a tier when the hook needs to DEVIATE from defaults:
 *
 * | Tier          | Use when                                              |
 * |---------------|-------------------------------------------------------|
 * | (default)     | SSE covers it — loads, drivers, vehicles, alerts, etc |
 * | OPERATIONAL   | Needs refetchOnWindowFocus (dispatch board, cmd center)|
 * | STATIC        | Rarely changes — reference data, plans, config        |
 * | ACTIVE_POLL   | No SSE coverage, must poll — job status, HOS clocks   |
 */
export const QUERY_TIERS = {
  /** Operational dashboards — refetch on tab focus for instant catch-up */
  OPERATIONAL: {
    refetchOnWindowFocus: true as const,
  },

  /** Semi-static data — config, reference data, plans. Longer staleTime, no polling */
  STATIC: {
    staleTime: 5 * 60_000,
  },

  /** Active polling — no SSE coverage, must poll server. Use sparingly. */
  ACTIVE_POLL: {
    staleTime: 5_000,
    refetchInterval: 30_000,
  },
} as const;

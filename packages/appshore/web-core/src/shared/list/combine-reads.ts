/** One read a panel depends on — the subset of a TanStack `useQuery` result this needs. */
export interface PanelRead {
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  refetch: () => unknown;
  isRefetching?: boolean;
}

export interface CombinedReads {
  /** Some read is still on its first load — show the skeleton. */
  isLoading: boolean;
  /** Some read failed — show `ListErrorState`, never the empty branch (a failure must not read as "nothing"). */
  isError: boolean;
  /** The first failure, for `ListErrorState`'s user-safe line. */
  error: unknown;
  /** Re-run every read that failed. */
  retry: () => void;
  isRetrying: boolean;
}

/**
 * combineReads — one loading / error / retry state for a panel built from several reads (an overview's
 * "Needs attention" from keys + invitations + plan). Any failed read fails the panel: summing what did load
 * would show "nothing needs attention" or "0 members" when the truth is unknown.
 */
export function combineReads(reads: readonly PanelRead[]): CombinedReads {
  const failed = reads.filter((read) => read.isError);
  return {
    isLoading: reads.some((read) => read.isLoading),
    isError: failed.length > 0,
    error: failed[0]?.error,
    retry: () => {
      for (const read of failed) void read.refetch();
    },
    isRetrying: failed.some((read) => read.isRefetching === true),
  };
}

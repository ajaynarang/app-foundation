import { useQueries } from '@tanstack/react-query';
import { queryKeys } from '@/shared/constants';
import { emailIntakeApi } from '../api';
import type { EmailIngestThread } from '../types';

interface ArchiveParams {
  from?: string;
  to?: string;
}

interface ArchiveResult {
  data: EmailIngestThread[];
  total: number;
}

/**
 * Archive view = CONFIRMED + DISCARDED. Backend takes one status, so
 * we run both queries in parallel and merge results client-side.
 */
export function useArchiveThreads(params: ArchiveParams = {}) {
  const buildParams = (status: 'CONFIRMED' | 'DISCARDED') => {
    const p: Record<string, string> = { status };
    if (params.from) p.from = params.from;
    if (params.to) p.to = params.to;
    return p;
  };

  const confirmedParams = buildParams('CONFIRMED');
  const discardedParams = buildParams('DISCARDED');

  const results = useQueries({
    queries: [
      {
        queryKey: queryKeys.emailIngest.threads(confirmedParams),
        queryFn: () => emailIntakeApi.listThreads(confirmedParams),
      },
      {
        queryKey: queryKeys.emailIngest.threads(discardedParams),
        queryFn: () => emailIntakeApi.listThreads(discardedParams),
      },
    ],
  });

  const [confirmed, discarded] = results;
  const isLoading = results.some((r) => r.isLoading);
  const isError = results.some((r) => r.isError);

  const merged: ArchiveResult = {
    data: [...(confirmed.data?.data ?? []), ...(discarded.data?.data ?? [])],
    total: (confirmed.data?.total ?? 0) + (discarded.data?.total ?? 0),
  };

  return { data: merged, isLoading, isError };
}

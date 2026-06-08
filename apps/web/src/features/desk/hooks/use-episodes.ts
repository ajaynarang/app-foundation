import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { showError, showSuccess } from '@sally/ui';

import { queryKeys } from '@/shared/constants/query-keys';
import { extractErrorMessage } from '@/shared/lib/error-utils';

import { deskApi } from '../api';
import type { ListDeskEpisodesQuery, ListHandledEpisodesQuery } from '../types';

export function useEpisodes(query?: ListDeskEpisodesQuery) {
  return useQuery({
    queryKey: queryKeys.desk.episodes(query as Record<string, unknown>),
    queryFn: () => deskApi.episodes.list(query),
  });
}

export function useEpisode(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.desk.episode(id ?? ''),
    queryFn: () => deskApi.episodes.get(id as string),
    enabled: !!id,
  });
}

/**
 * Handled tab list query. Backend resolves `window` → `{from, to}` using
 * tenant-local timezone via Luxon; the frontend just passes the canonical
 * enum (or explicit `from`/`to` for "custom"). 2-minute staleTime — the
 * Handled tab is a historical view, not a live queue. See design spec §4.
 */
export function useHandledEpisodes(query: ListHandledEpisodesQuery) {
  return useQuery({
    queryKey: queryKeys.desk.handled(query as Record<string, unknown>),
    queryFn: () => deskApi.episodes.handled(query),
    staleTime: 2 * 60_000,
  });
}

/**
 * Resolve an escalated episode via `PATCH /desk/episodes/:id/resolve`. The
 * operator's exit for an escalation: ESCALATED → RESOLVED moves it off the
 * Needs-you tab into Handled.
 *
 * Invalidates:
 *   • `desk.episodes`    — Needs-you list drops the escalation row
 *   • `desk.handled`     — Handled list receives the now-RESOLVED row
 *   • `desk.handoffCounts` — the Escalated badge decrements
 *   • `desk.episode(id)` — the sheet re-renders in Handled mode
 */
export function useResolveEpisode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { episodeId: string; note?: string }) =>
      deskApi.episodes.resolve(input.episodeId, { note: input.note }),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.desk.episodesRoot });
      qc.invalidateQueries({ queryKey: queryKeys.desk.handledRoot });
      qc.invalidateQueries({ queryKey: queryKeys.desk.handoffCounts() });
      qc.invalidateQueries({ queryKey: queryKeys.desk.episode(vars.episodeId) });
      showSuccess('Escalation resolved');
    },
    onError: (error: Error) => showError('Failed to resolve escalation', extractErrorMessage(error)),
  });
}

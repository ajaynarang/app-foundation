import { useMutation, useQueryClient } from '@tanstack/react-query';
import { showError, showSuccess } from '@sally/ui';

import { queryKeys } from '@/shared/constants/query-keys';
import { extractErrorMessage } from '@/shared/lib/error-utils';

import { deskApi } from '../api';
import { SNOOZE_DURATIONS } from '../lib/snooze-durations';
import type { SnoozeDuration, SnoozeEpisodeRequest } from '../types';

// "for 1 week" / "until you un-snooze" — user-facing label pulled from the
// same canonical durations list the dropdown renders, so the toast copy
// stays in sync with the menu copy automatically.
function snoozeLabel(duration: SnoozeDuration): string {
  const entry = SNOOZE_DURATIONS.find((d) => d.value === duration);
  if (!entry) return String(duration);
  return duration === 'forever' ? entry.label.toLowerCase() : `for ${entry.label.toLowerCase()}`;
}

/**
 * Snooze an episode via `POST /desk/episodes/:id/snooze`. The backend closes
 * the episode (outcome = rejected_by_operator) and creates/extends a
 * `desk_entity_suppressions` row so the same entity does not re-surface
 * until the suppression expires or is cleared.
 *
 * Invalidates:
 *   • `desk.episodes`    — Needs-You list drops the row
 *   • `desk.handled`     — Handled list receives the row with `Snoozed` pill
 *   • `desk.handoffCounts` — tab badges + counts update
 *   • `desk.episode(id)` — sheet re-renders in HandledMode with snooze card
 */
export function useSnoozeEpisode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { episodeId: string; body: SnoozeEpisodeRequest }) =>
      deskApi.suppressions.snooze(input.episodeId, input.body),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.desk.episodesRoot });
      qc.invalidateQueries({ queryKey: queryKeys.desk.handledRoot });
      qc.invalidateQueries({ queryKey: queryKeys.desk.handoffCounts() });
      qc.invalidateQueries({ queryKey: queryKeys.desk.episode(vars.episodeId) });
      showSuccess(`Snoozed — Sally won't bring this up ${snoozeLabel(vars.body.duration)}`);
    },
    onError: (error: Error) => showError('Failed to snooze', extractErrorMessage(error)),
  });
}

/**
 * Un-snooze a suppression via `POST /desk/suppressions/:id/unsnooze`. Next
 * scheduled sweep re-opens an episode for the entity if it's still eligible.
 */
export function useUnsnoozeSuppression() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (suppressionId: string) => deskApi.suppressions.unsnooze(suppressionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.desk.episodesRoot });
      qc.invalidateQueries({ queryKey: queryKeys.desk.handledRoot });
      qc.invalidateQueries({ queryKey: queryKeys.desk.handoffCounts() });
      showSuccess('Un-snoozed — Sally will revisit on the next cycle');
    },
    onError: (error: Error) => showError('Failed to un-snooze', extractErrorMessage(error)),
  });
}

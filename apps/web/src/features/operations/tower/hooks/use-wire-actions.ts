'use client';

import { useCallback } from 'react';
import { useSnoozeAlert } from '@/features/operations/alerts/hooks/use-alerts';
import { useDecideApproval } from '@/features/desk/hooks/use-approvals';
import { WIRE_MUTE_DURATION_MINUTES } from '../constants';

/**
 * Mutations behind the wire item action buttons.
 *
 * - `muteAlert` snoozes the related alert for 1 hour (existing alert snooze
 *   endpoint).
 * - `decideDesk` accepts/declines a Desk approval (existing Desk decide
 *   endpoint). Accept → APPROVED; decline → REJECTED + terminate.
 *
 * Both underlying hooks already fire `showSuccess` / `showError`, so callers
 * just consume `isPending` for the `<Button loading>` state.
 */
export function useWireActions() {
  const snooze = useSnoozeAlert();
  const decide = useDecideApproval();

  const muteAlert = useCallback(
    (alertId: string) => snooze.mutate({ alertId, durationMinutes: WIRE_MUTE_DURATION_MINUTES }),
    [snooze],
  );

  const acceptDesk = useCallback(
    (approvalId: string, onDone?: () => void) =>
      decide.mutate(
        { id: approvalId, body: { decision: 'APPROVED', terminate: false } },
        { onSuccess: () => onDone?.() },
      ),
    [decide],
  );

  const declineDesk = useCallback(
    (approvalId: string, onDone?: () => void) =>
      decide.mutate(
        {
          id: approvalId,
          body: { decision: 'REJECTED', rejectionReason: 'Declined from Tower wire', terminate: true },
        },
        { onSuccess: () => onDone?.() },
      ),
    [decide],
  );

  return {
    muteAlert,
    isMuting: snooze.isPending,
    acceptDesk,
    declineDesk,
    isDeciding: decide.isPending,
  };
}

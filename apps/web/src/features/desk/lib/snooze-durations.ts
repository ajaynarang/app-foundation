import type { SnoozeDuration } from '@sally/shared-types';

/**
 * Canned snooze durations shown in the Needs-You sheet footer Snooze dropdown.
 * Backend maps each key → a ms offset in `SuppressionService` (`forever` → `null`).
 * Single source of truth so the dropdown and any other surface that needs
 * these labels stay in lock-step.
 */
export const SNOOZE_DURATIONS: ReadonlyArray<{ value: SnoozeDuration; label: string }> = [
  { value: '1d', label: '1 day' },
  { value: '3d', label: '3 days' },
  { value: '1w', label: '1 week' },
  { value: '1mo', label: '1 month' },
  { value: 'forever', label: 'Until I un-snooze' },
];

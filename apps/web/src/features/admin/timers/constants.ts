import type { DeadlineState } from '@app/shared-types';
import type { StatusVariant } from '@app/ui';

/** One tone per derived deadline state; a status never picks its own colour (ui-grammar-guard.test.ts). */
export const DEADLINE_STATE_VARIANTS: Record<DeadlineState, StatusVariant> = {
  PENDING: { label: 'Pending', tone: 'neutral' },
  FAILING: { label: 'Failing', tone: 'danger' },
  FIRED: { label: 'Fired', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'muted' },
};

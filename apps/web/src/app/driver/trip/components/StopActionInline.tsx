'use client';

/**
 * StopActionInline — 3-stage stop completion embedded in the timeline.
 * Wraps the existing StopCompletionFlow which already handles all action logic,
 * confirmation sheet, detention timer, and status mutations.
 */

import { StopCompletionFlow } from '@/features/fleet/drivers/components/StopCompletionFlow';
import type { LoadStop } from '@/features/fleet/loads/types';
import { STOP_STATUS } from '../lib/constants';

interface Props {
  stop: LoadStop;
  loadId: string;
  isActive: boolean;
}

export function StopActionInline({ stop, loadId, isActive }: Props) {
  if (!isActive) return null;
  if (stop.status === STOP_STATUS.COMPLETED) return null;

  return (
    <div className="mt-2 space-y-2">
      <StopCompletionFlow stop={stop} loadId={loadId} />
    </div>
  );
}

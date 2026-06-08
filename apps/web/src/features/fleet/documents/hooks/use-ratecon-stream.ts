'use client';

import { SSE_EVENTS, type SsePayloadFor } from '@sally/shared-types';
import { useSseEvent } from '@/shared/realtime';

interface UseRateconStreamOptions {
  onCompleted?: (data: SsePayloadFor<typeof SSE_EVENTS.RATECON_COMPLETED>) => void;
  onFailed?: (data: SsePayloadFor<typeof SSE_EVENTS.RATECON_FAILED>) => void;
}

/**
 * Side effects for rate-confirmation parse jobs. Mounted on pages that
 * need to react to specific job results (e.g., resolve a ghost-card on
 * the dispatcher loads page).
 */
export function useRateconStream(options: UseRateconStreamOptions = {}): void {
  useSseEvent(SSE_EVENTS.RATECON_COMPLETED, (data) => options.onCompleted?.(data));
  useSseEvent(SSE_EVENTS.RATECON_FAILED, (data) => options.onFailed?.(data));
}
